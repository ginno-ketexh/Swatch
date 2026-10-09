require "test_helper"
require "vips"

class PublicSharesTest < ActionDispatch::IntegrationTest
  UNAVAILABLE = "This link isn't available. It may have expired or been turned off."

  setup do
    PublicShareLimit::STORE.clear
    @item = Item.create!(
      title: "Terracotta stair",
      notes: "Warm step",
      color: "#7C2D24",
      source_url: "https://example.com/stairs"
    )
    @item.image.attach(io: File.open(png_path), filename: "swatch-#{@item.id}.png", content_type: "image/png")
    @link = ShareLink.create!(user: @item.user, item: @item, expires_at: 30.days.from_now)
  end

  test "a public swatch hides notes, skips the session, and describes the picture" do
    sign_out
    get public_share_path(@link.token)

    assert_response :success
    assert_equal "Terracotta stair · Swatch", document_title
    assert_select "h1", "Terracotta stair"
    assert_select "main"
    assert_select "footer", /Shared with Swatch/
    assert_select "img[alt=?]", "Image for Terracotta stair"
    assert_select "a", text: "View full size"
    assert_includes response.body, "#7C2D24"
    assert_includes response.body, "example.com"
    assert_includes response.body, "opens in a new tab"
    assert_not_includes response.body, "Warm step"
    assert_nil response.headers["Set-Cookie"]
    assert_public_headers
    assert_equal "A swatch shared from Swatch", meta_content("og:description")
    assert_nil meta_content("og:image")
    assert_not_includes response.body, "twitter:card"

    get public_share_path(@link.token)
    assert_equal 2, @link.reload.views_count
  end

  test "notes and a chat preview are included only when the link says so" do
    @link.update!(include_notes: true, include_preview_image: true, title: "Stair public")
    get public_share_path(@link.token)

    assert_includes response.body, "Warm step"
    assert_select "h1", "Stair public"
    assert_equal "summary_large_image", meta_content("twitter:card")
    image = meta_content("og:image")
    assert_includes image, "/s/#{@link.token}/images/"
    assert_includes image, "/card_2x"
    assert_not_includes response.body, "Warm step\" content"
    assert_equal "A swatch shared from Swatch", meta_content("og:description")
  end

  test "a signed in owner still gets the public page and no new cookie" do
    get public_share_path(@link.token)
    assert_response :success
    assert_nil response.headers["Set-Cookie"]
    assert_not_includes response.body, "owner@example.com"
    assert_not_includes response.body, "/api/"
    assert_not_includes response.body, @item.image.blob.key
  end

  test "repeat visits with the same etag do not count another view" do
    get public_share_path(@link.token)
    etag = response.headers["ETag"]
    assert_includes response.headers["Cache-Control"], "private"
    assert_includes response.headers["Cache-Control"], "no-cache"
    assert_equal 1, @link.reload.views_count

    get public_share_path(@link.token), headers: { "If-None-Match" => etag }
    assert_response :not_modified
    assert_equal 1, @link.reload.views_count
  end

  test "unknown expired and revoked links look the same" do
    get public_share_path(@link.token)
    assert_response :success

    @link.update!(expires_at: 1.hour.ago)
    get public_share_path(@link.token)
    assert_response :not_found
    expired = response.body
    assert_includes Nokogiri::HTML(expired).text, UNAVAILABLE
    assert_not_includes expired, @link.token

    token = @link.token
    @link.destroy!
    get public_share_path(token)
    assert_response :not_found
    assert_equal expired, response.body
  end

  test "a token with the wrong shape does not query share links" do
    sqls = []
    subscriber = ActiveSupport::Notifications.subscribe("sql.active_record") do |*, payload|
      sqls << payload[:sql]
    end
    get "/s/not-a-valid-token"
    ActiveSupport::Notifications.unsubscribe(subscriber)

    assert_response :not_found
    assert_includes Nokogiri::HTML(response.body).text, UNAVAILABLE
    assert_equal 0, sqls.count { |sql| sql.include?("share_links") }
  end

  test "a tag collection stays inside that owner's swatches" do
    tag = Tag.create!(name: "packaging")
    @item.replace_tag_names([ "packaging", "secret-tag" ])
    other = Item.create!(title: "Other stair", user: users(:other))
    Tag.create!(name: "packaging", user: users(:other))
    other.replace_tag_names([ "packaging" ])
    hidden = Item.create!(title: "Not in the set")
    link = ShareLink.create!(
      user: users(:owner),
      tag: Tag.find_by!(name: "packaging", user: users(:owner)),
      include_preview_image: true
    )

    get public_share_path(link.token)
    assert_includes meta_content("og:image").to_s, "/card_2x"
    assert_response :success
    assert_includes response.body, "Terracotta stair"
    assert_not_includes response.body, "Other stair"
    assert_not_includes response.body, "Not in the set"
    assert_not_includes response.body, "secret-tag"
    assert_not_includes response.body, "owner@example.com"
    assert_includes response.body, "1 swatch shared from Swatch"
    assert_not_includes response.body, hidden.title

    empty = Tag.create!(name: "empty-set")
    bare = ShareLink.create!(user: users(:owner), tag: empty)
    get public_share_path(bare.token)
    assert_includes response.body, "Nothing here yet."
  end

  test "collection pages walk older and newer swatches" do
    tag = Tag.create!(name: "series")
    49.times do |index|
      item = Item.create!(title: format("Row %02d", index))
      item.replace_tag_names([ "series" ])
      item.update_columns(created_at: Time.zone.parse("2026-01-01") + index.hours, updated_at: Time.current)
    end
    link = ShareLink.create!(user: users(:owner), tag: tag)

    get public_share_path(link.token)
    assert_includes response.body, "Row 48"
    assert_not_includes response.body, "Row 00"
    older = response.body[/href="([^"]+)" aria-label="Older swatches, page 2"/, 1]
    assert older.present?

    get older
    assert_includes response.body, "Row 24"
    assert_select "a[aria-label=?]", "Older swatches, page 3"
    newer = response.body[/href="([^"]+)" aria-label="Newer swatches, page 1"/, 1]
    assert_not_includes newer.to_s, "after="

    get public_share_path(link.token, after: "not-a-cursor")
    assert_includes response.body, "Row 48"
  end

  test "a key from another link or a removed image is not available" do
    other = Item.create!(title: "Second")
    other_link = ShareLink.create!(user: users(:owner), item: other)
    foreign_key = @link.signed_key(@item)

    get public_share_image_path(other_link.token, foreign_key, "card")
    assert_response :not_found

    get public_share_item_path(other_link.token, foreign_key)
    assert_response :not_found

    @item.image.purge
    get public_share_image_path(@link.token, @link.signed_key(@item), "large")
    assert_response :not_found
  end

  test "images stream from disk and can redirect to a short lived url" do
    key = @link.signed_key(@item)
    views = @link.views_count
    get public_share_image_path(@link.token, key, "card")
    assert_response :success
    assert_equal "image/webp", response.media_type
    assert_includes response.headers["Cache-Control"], "max-age=60"
    assert_equal views, @link.reload.views_count

    with_remote_urls("https://acct.r2.cloudflarestorage.com/obj?X-Amz-Signature=secret-value") do
      get public_share_image_path(@link.token, key, "large")
    end
    assert_response :redirect
    assert_equal "https://acct.r2.cloudflarestorage.com/obj?X-Amz-Signature=secret-value", response.location
  end

  test "hostile text is escaped and a javascript source is not a link" do
    @item.update!(title: "<script>alert(1)</script>", notes: "\"><img onerror=alert(1)>", image_alt: "<script>alt</script>")
    @link.update!(include_notes: true, title: "\"><img onerror=alert(2)>")
    tag = Tag.create!(name: "safe")
    @item.replace_tag_names([ "safe" ])
    tag.update_columns(name: "<script>")
    link = ShareLink.create!(user: users(:owner), tag: tag, title: tag.name)

    get public_share_path(@link.token)
    assert_not_includes response.body, "<script>"
    assert_not_includes response.body, "<img onerror"
    assert_includes response.body, "&lt;script&gt;"

    get public_share_path(link.token)
    assert_not_includes response.body, "<script>"

    drop_source_constraint do
      @item.update_columns(source_url: "javascript:alert(1)")
      get public_share_path(@link.token)
      assert_no_match(/href="javascript:/, response.body)
    end
  end

  test "public limits throttle pages images and repeated misses" do
    PublicShareLimit::STORE.write("rate-limit:public_shares:public-pages:127.0.0.1", 60, expires_in: 1.minute)
    get public_share_path(@link.token)
    assert_response :too_many_requests
    assert_includes response.body, "Too many requests, try again in a minute"

    PublicShareLimit::STORE.clear
    PublicShareLimit::STORE.write("rate-limit:public_shares:public-images:127.0.0.1", 300, expires_in: 1.minute)
    get public_share_image_path(@link.token, @link.signed_key(@item), "card")
    assert_response :too_many_requests

    PublicShareLimit::STORE.clear
    20.times { get "/s/not-a-valid-token" }
    assert_response :not_found
    get public_share_path(@link.token)
    assert_response :success
    get "/s/still-not-valid"
    assert_response :too_many_requests
    assert_includes response.body, "Too many requests, try again in a minute"
  end

  test "robots and the signed in shell ask crawlers to skip private pages" do
    get "/robots.txt"
    assert_includes response.body, "Disallow: /api/"
    assert_includes response.body, "Disallow: /account"
    assert_not_includes response.body, "Disallow: /s/"

    get root_path
    assert_select "meta[name=robots][content=noindex]"

    get account_path
    assert_select "meta[name=robots][content=noindex]"

    sign_out
    get sign_in_path
    assert_select "meta[name=robots][content=noindex]"
  end

  test "renaming a tag updates the default title and a custom title stays" do
    tag = Tag.create!(name: "packaging")
    @item.replace_tag_names([ "packaging" ])
    plain = ShareLink.create!(user: users(:owner), tag: tag)
    custom = ShareLink.create!(user: users(:owner), tag: tag, title: "Lookbook")
    tag.update!(name: "boxes")

    get public_share_path(plain.token)
    assert_select "h1", "boxes"
    get public_share_path(custom.token)
    assert_select "h1", "Lookbook"

    tag.destroy!
    get public_share_path(plain.token)
    assert_response :not_found
  end

  test "the collection page does not load one query per swatch" do
    tag = Tag.create!(name: "batch")
    3.times do |index|
      item = Item.create!(title: "Batch #{index}", color: "#112233")
      item.replace_tag_names([ "batch" ])
      item.image.attach(io: File.open(png_path), filename: "swatch-#{item.id}.png", content_type: "image/png")
    end
    link = ShareLink.create!(user: users(:owner), tag: tag)

    sqls = []
    subscriber = ActiveSupport::Notifications.subscribe("sql.active_record") do |*, payload|
      sqls << payload[:sql]
    end
    get public_share_path(link.token)
    ActiveSupport::Notifications.unsubscribe(subscriber)

    assert_response :success
    item_reads = sqls.count { |sql| sql.match?(/from ["']?items["']?/i) && !sql.match?(/\bcount\s*\(/i) }
    assert_operator item_reads, :<=, 4
    assert_operator sqls.count { |sql| sql.include?("active_storage_blobs") }, :<=, 2
  end

  test "absolute share urls prefer RENDER_EXTERNAL_URL" do
    previous = ENV["RENDER_EXTERNAL_URL"]
    ENV["RENDER_EXTERNAL_URL"] = "https://swatch.example"
    post api_v1_share_links_path, params: { item_id: @item.id, expires_in: "1d" }, as: :json
    assert_response :created
    assert response.parsed_body["url"].start_with?("https://swatch.example/s/")
  ensure
    if previous
      ENV["RENDER_EXTERNAL_URL"] = previous
    else
      ENV.delete("RENDER_EXTERNAL_URL")
    end
  end

  private
    def assert_public_headers
      policy = response.headers["Content-Security-Policy"]
      assert_includes policy, "script-src 'none'"
      assert_equal "no-referrer", response.headers["Referrer-Policy"]
      assert_equal "noindex, nofollow, noarchive", response.headers["X-Robots-Tag"]
      assert_equal "DENY", response.headers["X-Frame-Options"]
    end

    def document_title
      Nokogiri::HTML(response.body).at("title").text
    end

    def meta_content(property)
      node = Nokogiri::HTML(response.body).at("meta[property='#{property}'], meta[name='#{property}']")
      node && node["content"]
    end

    def png_path
      file = Tempfile.new([ "lamp", ".png" ])
      Vips::Image.black(12, 8).add(25).pngsave(file.path, strip: true)
      file.path
    end

    def drop_source_constraint
      Item.connection.execute("ALTER TABLE items DROP CONSTRAINT IF EXISTS items_source_url_http")
      yield
    ensure
      Item.where("source_url IS NOT NULL AND source_url !~* '^https?://'").update_all(source_url: nil)
      Item.connection.execute(<<~SQL.squish)
        ALTER TABLE items ADD CONSTRAINT items_source_url_http
        CHECK (source_url IS NULL OR char_length(source_url::text) <= 2048 AND source_url::text ~* '^https?://[^[:space:]/]+'::text)
      SQL
    end

    def with_remote_urls(url)
      singleton = Swatch::ImageStorage.singleton_class
      singleton.alias_method(:__remote_original, :remote?)
      singleton.define_method(:remote?) { |_| true }
      ActiveStorage::Blob.alias_method(:__url_original, :url)
      ActiveStorage::Blob.define_method(:url) { |**| url }
      yield
    ensure
      singleton = Swatch::ImageStorage.singleton_class
      singleton.alias_method(:remote?, :__remote_original)
      singleton.remove_method(:__remote_original)
      ActiveStorage::Blob.alias_method(:url, :__url_original)
      ActiveStorage::Blob.remove_method(:__url_original)
    end
end
