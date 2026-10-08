require "marcel"
require "vips"
require "image_processing/vips"

# Checks an upload and re-saves it without camera metadata.
# The original file is never stored.
class ImageIngest
  class Reject < StandardError; end

  MAX_EDGE = 8000
  MAX_PIXELS = 40_000_000
  MAX_GIF_FRAMES = 100
  STORED_EDGE = 2560
  TYPES = {
    "image/jpeg" => "jpg",
    "image/png" => "png",
    "image/webp" => "webp",
    "image/gif" => "gif"
  }.freeze

  Result = Struct.new(:io, :filename, :content_type, :width, :height, keyword_init: true) do
    def to_attachable
      {
        io: io,
        filename: filename,
        content_type: content_type,
        metadata: { "width" => width, "height" => height, "identified" => true }
      }
    end
  end

  def self.call!(upload, item:)
    new(upload, item).call!
  end

  def initialize(upload, item)
    @upload = upload
    @item = item
  end

  def call!
    raise Reject, "Choose an image" if @upload.blank?

    path = @upload.tempfile.path
    type = sniffed_type(path)
    raise Reject, "Swatch accepts JPEG, PNG, WebP or GIF images" if type.nil?
    raise Reject, "Swatch accepts JPEG, PNG, WebP or GIF images" if polyglot?(path)

    width, height, frames = dimensions(path)
    raise Reject, "That image is too large to process (max 8000 × 8000)" if width > MAX_EDGE || height > MAX_EDGE
    raise Reject, "That image is too large to process (max 40 megapixels)" if width * height > MAX_PIXELS
    raise Reject, "That animation has too many frames (max 100)" if frames > MAX_GIF_FRAMES

    stored = type == "image/gif" ? File.open(path, "rb") : resave(path, type)
    stored.rewind
    width, height = stored_dimensions(stored, width, height) unless type == "image/gif"
    byte_size = stored.size
    raise Reject, "That file is bigger than 10 MB" if byte_size > ImageUploadLimit::LIMIT

    ensure_budget!(byte_size)
    extension = TYPES.fetch(type)
    Result.new(
      io: stored,
      filename: "swatch-#{@item.id}.#{extension}",
      content_type: type,
      width: width,
      height: height
    )
  rescue Vips::Error, ImageProcessing::Error
    raise Reject, "We couldn't read that image"
  end

  private
    def sniffed_type(path)
      File.open(path, "rb") do |io|
        type = Marcel::Magic.by_magic(io)&.type
        TYPES.key?(type) ? type : nil
      end
    end

    def polyglot?(path)
      sample = File.binread(path, 65_536).to_s.downcase
      sample.include?("<script") || sample.include?("javascript:")
    end

    def dimensions(path)
      image = Vips::Image.new_from_file(path, fail: true)
      frames = begin
        image.get("n-pages")
      rescue Vips::Error
        1
      end
      [ image.width, image.height, frames.to_i ]
    end

    def stored_dimensions(stored, width, height)
      image = Vips::Image.new_from_file(stored.path, fail: true)
      [ image.width, image.height ]
    rescue Vips::Error
      [ width, height ]
    end

    def resave(path, type)
      pipeline = ImageProcessing::Vips.source(path).autorot.resize_to_limit(STORED_EDGE, STORED_EDGE)
      saver = { strip: true }
      saver[:Q] = 80 if type == "image/jpeg" || type == "image/webp"
      outfile = pipeline.saver(**saver).call
      outfile.rewind
      outfile
    end

    def ensure_budget!(incoming)
      current = @item.image.attached? ? @item.image.blob.byte_size : 0
      used = Swatch::ImageStorage.bytes_used(@item.user)
      return if used - current + incoming <= Swatch::ImageStorage::BUDGET_BYTES

      raise Reject, "Your image space is full (2 GB). Remove some images first"
    end
end
