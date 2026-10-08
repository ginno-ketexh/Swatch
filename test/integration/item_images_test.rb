require "test_helper"
require "rake"
require "vips"

class ItemImagesTest < ActionDispatch::IntegrationTest
  setup do
    ApiWriteLimit::STORE.clear
  end

  test "put patch and delete an image and the json points at our paths" do
    item = Item.create!(title: "Lamp")
    put api_v1_item_image_path(item), params: { image: png_upload, alt: "  Brass base  " }

    assert_response :success
    body = response.parsed_body
    assert_equal "Brass base", body["image"]["alt"]
    assert_equal "image/png", body["image"]["content_type"]
    assert_equal "swatch-#{item.id}.png", item.reload.image.blob.filename.to_s
    assert_match %r{/api/v1/items/#{item.id}/image/card\?v=}, body["image"]["urls"]["card"]
    assert_no_match(/holiday|secret/, body["image"]["urls"].values.join)

    get body["image"]["urls"]["card"]
    assert_response :success
    assert_equal "image/webp", response.media_type
    assert_includes response.headers["Cache-Control"], "private"
    assert_includes response.headers["Cache-Control"], "max-age=240"

    patch api_v1_item_image_path(item), params: { alt: "Updated" }, as: :json
    assert_response :success
    assert_equal "Updated", response.parsed_body["image"]["alt"]

    delete api_v1_item_image_path(item)
    assert_response :no_content
    assert_not item.reload.image.attached?
    assert_nil item.image_alt
  end

  test "index includes image json without a query per swatch" do
    3.times do |index|
      item = Item.create!(title: "Row #{index}")
      item.image.attach(io: File.open(png_path), filename: "swatch-#{item.id}.png", content_type: "image/png")
    end

    queries = []
    ActiveSupport::Notifications.subscribed(->(*, payload) { queries << payload[:sql] }, "sql.active_record") do
      get api_v1_items_path
    end

    assert_response :success
    images = response.parsed_body["items"].map { |item| item.fetch("image") }
    assert_equal 3, images.compact.size
    assert images.compact.all? { |image| image["urls"]["card"].include?("/image/card?v=") }
    blob_reads = queries.count { |sql| sql.include?("active_storage_blobs") }
    assert_operator blob_reads, :<=, 2
  end

  test "missing length and an oversized length are refused before the file is stored" do
    item = Item.create!(title: "Lamp")
    status, _headers, body = ImageUploadLimit.new(->(_) { [ 200, {}, [ "reached" ] ] }).call(
      "REQUEST_METHOD" => "PUT",
      "PATH_INFO" => "/api/v1/items/#{item.id}/image",
      "CONTENT_LENGTH" => ""
    )
    assert_equal 411, status
    assert_includes body.join, "missing its size"

    status, _headers, body = ImageUploadLimit.new(->(_) { [ 200, {}, [ "reached" ] ] }).call(
      "REQUEST_METHOD" => "PUT",
      "PATH_INFO" => "/api/v1/items/#{item.id}/image",
      "CONTENT_LENGTH" => (11 * 1024 * 1024).to_s
    )
    assert_equal 413, status
    assert_includes body.join, "That file is bigger than 10 MB"
    assert_not item.image.attached?
  end

  test "a description over 250 characters is rejected" do
    item = attach_png
    patch api_v1_item_image_path(item), params: { alt: "a" * 251 }, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body["errors"]["alt"].join, "250"
  end

  test "signed out, another person's swatch, a missing image, and active storage routes" do
    item = Item.create!(title: "Theirs", user: users(:other))
    put api_v1_item_image_path(item), params: { image: png_upload }
    assert_response :not_found

    sign_out
    own = Item.create!(title: "Mine", user: users(:owner))
    put api_v1_item_image_path(own), params: { image: png_upload }
    assert_response :unauthorized

    sign_in_as(users(:owner))
    get api_v1_item_image_variant_path(own, "card")
    assert_response :not_found
    kept = attach_png
    get "/api/v1/items/#{kept.id}/image/poster"
    assert_response :not_found
    get "/rails/active_storage/disk/anything"
    assert_response :not_found
  end

  test "too many uploads and too many writes are both limited" do
    item = Item.create!(title: "Lamp")
    10.times { put api_v1_item_image_path(item), params: { image: png_upload } }
    put api_v1_item_image_path(item), params: { image: png_upload }
    assert_response :too_many_requests
    assert_equal "Too many uploads. Wait a minute and try again.", response.parsed_body["error"]

    ApiWriteLimit::STORE.clear
    30.times { |index| post api_v1_items_path, params: { item: { title: "Write #{index}" } }, as: :json }
    put api_v1_item_image_path(item), params: { image: png_upload }
    assert_response :too_many_requests
    assert_equal "Too many requests", response.parsed_body["error"]
  end

  test "a missing token is rejected when protection is on" do
    ActionController::Base.allow_forgery_protection = true
    item = Item.create!(title: "Lamp")
    put api_v1_item_image_path(item), params: { image: png_upload }
    assert_response :unprocessable_entity
    assert_equal "Invalid authenticity token", response.parsed_body["error"]
  ensure
    ActionController::Base.allow_forgery_protection = false
  end

  test "uploads are refused when storage is off and the image field stays in json" do
    with_storage(false) do
      item = Item.create!(title: "Lamp")
      put api_v1_item_image_path(item), params: { image: png_upload }
      assert_response :service_unavailable
      assert_equal "Image uploads aren't set up yet", response.parsed_body["error"]

      get api_v1_item_path(item)
      assert_response :success
      assert_nil response.parsed_body["image"]
    end
  end

  test "a remote store redirects without putting the signature in the log" do
    item = attach_gif
    output = StringIO.new
    sink = ActiveSupport::Logger.new(output)
    Rails.logger.broadcast_to(sink)
    with_remote_urls("https://acct.r2.cloudflarestorage.com/obj?X-Amz-Signature=secret-value") do
      get api_v1_item_image_variant_path(item, "large", v: item.image.blob.id)
    end

    assert_response :redirect
    assert_includes response.headers["Cache-Control"], "private"
    assert_includes response.headers["Cache-Control"], "max-age=240"
    assert_not_includes output.string, "secret-value"
  ensure
    Rails.logger.stop_broadcasting_to(sink) if sink
  end

  test "deleting a swatch removes its image" do
    item = attach_png
    blob_id = item.image.blob.id
    delete api_v1_item_path(item)
    assert_response :no_content
    assert_nil ActiveStorage::Blob.find_by(id: blob_id)
  end

  test "the account page shows how much image space is used" do
    get account_path
    assert_response :success
    assert_match "Images: 0 MB of 2 GB used", response.body
  end

  test "orphaned files older than a day are purged and a switched-off store skips them" do
    old = ActiveStorage::Blob.create_and_upload!(io: StringIO.new("orphan"), filename: "old.bin", content_type: "application/octet-stream")
    old.update!(created_at: 2.days.ago)
    fresh = ActiveStorage::Blob.create_and_upload!(io: StringIO.new("fresh"), filename: "fresh.bin", content_type: "application/octet-stream")

    capture_io { Rails.application.load_tasks unless Rake::Task.task_defined?("swatch:purge_orphaned_blobs") }
    Rake::Task["swatch:purge_orphaned_blobs"].reenable
    capture_io { Rake::Task["swatch:purge_orphaned_blobs"].invoke }
    assert_nil ActiveStorage::Blob.find_by(id: old.id)
    assert ActiveStorage::Blob.find_by(id: fresh.id)

    kept = ActiveStorage::Blob.create_and_upload!(io: StringIO.new("kept"), filename: "kept.bin", content_type: "application/octet-stream")
    kept.update!(created_at: 2.days.ago)
    with_storage(false) do
      Rake::Task["swatch:purge_orphaned_blobs"].reenable
      capture_io { Rake::Task["swatch:purge_orphaned_blobs"].invoke }
    end
    assert ActiveStorage::Blob.find_by(id: kept.id)
  end

  private
    def png_path
      file = Tempfile.new([ "lamp", ".png" ])
      Vips::Image.black(12, 8).add(25).pngsave(file.path, strip: true)
      file.path
    end

    def png_upload
      Rack::Test::UploadedFile.new(png_path, "image/png")
    end

    def attach_png
      item = Item.create!(title: "Kept")
      item.image.attach(io: File.open(png_path), filename: "swatch-#{item.id}.png", content_type: "image/png")
      item
    end

    def attach_gif
      path = Tempfile.new([ "anim", ".gif" ]).path
      Vips::Image.black(4, 4).gifsave(path)
      item = Item.create!(title: "Move")
      item.image.attach(io: File.open(path), filename: "swatch-#{item.id}.gif", content_type: "image/gif")
      item
    end

    def with_storage(enabled)
      stub_singleton(Swatch::ImageStorage, :enabled?) { |*| enabled }
      yield
    ensure
      restore_singleton(Swatch::ImageStorage, :enabled?)
    end

    def with_remote_urls(url)
      stub_singleton(Swatch::ImageStorage, :remote?) { |_| true }
      ActiveStorage::Blob.alias_method(:__url_original, :url)
      ActiveStorage::Blob.define_method(:url) { |**| url }
      yield
    ensure
      restore_singleton(Swatch::ImageStorage, :remote?)
      ActiveStorage::Blob.alias_method(:url, :__url_original)
      ActiveStorage::Blob.remove_method(:__url_original)
    end

    def stub_singleton(mod, name, &replacement)
      mod.singleton_class.alias_method(:"__#{name}_original", name)
      mod.singleton_class.define_method(name, &replacement)
    end

    def restore_singleton(mod, name)
      original = :"__#{name}_original"
      return unless mod.singleton_class.method_defined?(original)

      mod.singleton_class.alias_method(name, original)
      mod.singleton_class.remove_method(original)
    end
end
