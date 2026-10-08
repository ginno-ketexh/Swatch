require "test_helper"
require "vips"

class ImageIngestTest < ActiveSupport::TestCase
  setup do
    @item = Item.create!(title: "Lamp", user: users(:owner))
  end

  test "jpeg, png, webp, and gif are accepted" do
    jpeg = Tempfile.new([ "photo", ".jpg" ])
    Vips::Image.black(6, 4).add(40).jpegsave(jpeg.path, Q: 80, strip: true)
    webp = Tempfile.new([ "photo", ".webp" ])
    Vips::Image.black(6, 4).add(40).webpsave(webp.path, Q: 80, strip: true)
    gif = Tempfile.new([ "photo", ".gif" ])
    Vips::Image.black(6, 4).gifsave(gif.path)

    jpeg_result = ImageIngest.call!(Rack::Test::UploadedFile.new(jpeg.path, "image/jpeg", true, original_filename: "scan.png"), item: @item)
    assert_equal "image/jpeg", jpeg_result.content_type
    assert_equal "swatch-#{@item.id}.jpg", jpeg_result.filename

    webp_result = ImageIngest.call!(Rack::Test::UploadedFile.new(webp.path, "image/webp"), item: @item)
    assert_equal "image/webp", webp_result.content_type

    gif_result = ImageIngest.call!(Rack::Test::UploadedFile.new(gif.path, "image/gif"), item: @item)
    assert_equal "image/gif", gif_result.content_type
    assert_equal 6, gif_result.width
    assert_equal 4, gif_result.height
  end

  test "a png renamed as jpeg is accepted and stored under a safe name" do
    result = ImageIngest.call!(upload_png(filename: "holiday.jpg", type: "image/jpeg"), item: @item)

    assert_equal "image/png", result.content_type
    assert_equal "swatch-#{@item.id}.png", result.filename
    assert_equal 12, result.width
    assert_equal 8, result.height
  end

  test "html, svg, and a script hiding in a gif are rejected" do
    html = upload_bytes("<html><body>no</body></html>", "photo.png", "image/png")
    svg = upload_bytes(%(<svg xmlns="http://www.w3.org/2000/svg"></svg>), "photo.png", "image/png")
    polyglot = upload_bytes("GIF89a<script>alert(1)</script>", "anim.gif", "image/gif")

    [ html, svg, polyglot ].each do |file|
      error = assert_raises(ImageIngest::Reject) { ImageIngest.call!(file, item: @item) }
      assert_equal "Swatch accepts JPEG, PNG, WebP or GIF images", error.message
    end
  end

  test "an image over 8000 pixels or 40 megapixels is rejected" do
    wide = Tempfile.new([ "wide", ".png" ])
    Vips::Image.black(8001, 2).pngsave(wide.path, strip: true)
    error = assert_raises(ImageIngest::Reject) do
      ImageIngest.call!(Rack::Test::UploadedFile.new(wide.path, "image/png"), item: @item)
    end
    assert_equal "That image is too large to process (max 8000 × 8000)", error.message

    huge = Tempfile.new([ "huge", ".png" ])
    Vips::Image.black(8000, 5001).pngsave(huge.path, strip: true)
    pixels = assert_raises(ImageIngest::Reject) do
      ImageIngest.call!(Rack::Test::UploadedFile.new(huge.path, "image/png"), item: @item)
    end
    assert_equal "That image is too large to process (max 40 megapixels)", pixels.message
  end

  test "a gif with too many frames is rejected" do
    path = Tempfile.new([ "frames", ".gif" ]).path
    Vips::Image.black(2, 2).replicate(1, 101).gifsave(path, page_height: 2)
    error = assert_raises(ImageIngest::Reject) do
      ImageIngest.call!(Rack::Test::UploadedFile.new(path, "image/gif"), item: @item)
    end
    assert_equal "That animation has too many frames (max 100)", error.message
  end

  test "gps data is removed from the stored file" do
    upload = Rack::Test::UploadedFile.new(file_fixture("gps.jpg"), "image/jpeg")
    result = ImageIngest.call!(upload, item: @item)
    stored = Vips::Image.new_from_file(result.io.path)
    assert_empty stored.get_fields.grep(/GPS/i)
  end

  test "a corrupt file has a plain message" do
    error = assert_raises(ImageIngest::Reject) do
      ImageIngest.call!(upload_bytes("not-an-image", "bad.png", "image/png"), item: @item)
    end
    assert_equal "Swatch accepts JPEG, PNG, WebP or GIF images", error.message

    broken = assert_raises(ImageIngest::Reject) do
      ImageIngest.call!(upload_bytes("\xFF\xD8\xFF\xE0".b + ("\x00".b * 32), "bad.jpg", "image/jpeg"), item: @item)
    end
    assert_equal "We couldn't read that image", broken.message

    pdf = assert_raises(ImageIngest::Reject) do
      ImageIngest.call!(upload_bytes("%PDF-1.4\n", "scan.pdf", "image/png"), item: @item)
    end
    assert_equal "Swatch accepts JPEG, PNG, WebP or GIF images", pdf.message
  end

  test "the image budget blocks another upload" do
    singleton = Swatch::ImageStorage.singleton_class
    singleton.alias_method(:__bytes_used_original, :bytes_used)
    singleton.define_method(:bytes_used) { |_| Swatch::ImageStorage::BUDGET_BYTES }
    error = assert_raises(ImageIngest::Reject) do
      ImageIngest.call!(upload_png, item: @item)
    end
    assert_equal "Your image space is full (2 GB). Remove some images first", error.message
  ensure
    singleton.alias_method(:bytes_used, :__bytes_used_original)
    singleton.remove_method(:__bytes_used_original)
  end

  private
    def upload_png(filename: "lamp.png", type: "image/png")
      file = Tempfile.new([ "lamp", ".png" ])
      Vips::Image.black(12, 8).add(25).pngsave(file.path, strip: true)
      Rack::Test::UploadedFile.new(file.path, type, true, original_filename: filename)
    end

    def upload_bytes(contents, filename, type)
      file = Tempfile.new(filename)
      file.binmode
      file.write(contents)
      file.rewind
      Rack::Test::UploadedFile.new(file.path, type, true, original_filename: filename)
    end
end
