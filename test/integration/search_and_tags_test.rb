require "test_helper"

class SearchAndTagsTest < ActionDispatch::IntegrationTest
  setup do
    Api::V1::ItemsController::RATE_LIMIT_STORE.clear
  end

  test "search matches every word across title notes and url, and an exact colour" do
    match = Item.create!(title: "Terracotta stair", source_url: "https://dribbble.com/tiles", notes: "Warm plaster", color: "#7C2D24")
    Item.create!(title: "Other", notes: "plaster only", color: "#112233")
    Item.create!(title: "Plain", notes: "nothing", color: "#7C2D24")

    get api_v1_items_path, params: { q: "  terracotta   plaster  " }
    assert_response :success
    assert_equal [ match.id ], response.parsed_body["items"].map { |item| item["id"] }
    assert_equal 1, response.parsed_body["total_count"]

    get api_v1_items_path, params: { q: "dribbble" }
    assert_equal [ match.id ], response.parsed_body["items"].map { |item| item["id"] }

    get api_v1_items_path, params: { q: "7c2d24" }
    ids = response.parsed_body["items"].map { |item| item["id"] }
    assert_includes ids, match.id
    assert_equal 2, ids.size

    get api_v1_items_path, params: { q: "   " }
    assert_equal 3, response.parsed_body["total_count"]
  end

  test "search treats odd input as literal text and stays inside the limits" do
    kept = Item.create!(title: "100% cotton", notes: "a_b and \\ path", color: "#ABCDEF")
    Item.create!(title: "plain cloth")
    script = Item.create!(title: "Note", notes: "<script>alert(1)</script>")
    quoted = Item.create!(title: "Quote", notes: "she said \"hello\"")
    drop = Item.create!(title: "Safe", notes: "still here")
    Item.create!(title: "Café tile", notes: "🧵 thread")

    get api_v1_items_path, params: { q: "%" }
    assert_response :success
    assert_equal [ kept.id ], response.parsed_body["items"].map { |item| item["id"] }

    get api_v1_items_path, params: { q: "_" }
    assert_equal [ kept.id ], response.parsed_body["items"].map { |item| item["id"] }

    get api_v1_items_path, params: { q: "\\" }
    assert_equal [ kept.id ], response.parsed_body["items"].map { |item| item["id"] }

    get api_v1_items_path, params: { q: "<script>" }
    assert_equal [ script.id ], response.parsed_body["items"].map { |item| item["id"] }
    assert_includes response.parsed_body["items"].first["notes"], "<script>alert(1)</script>"

    get api_v1_items_path, params: { q: "\"hello\"" }
    assert_equal [ quoted.id ], response.parsed_body["items"].map { |item| item["id"] }

    before = Item.count
    get api_v1_items_path, params: { q: "'; DROP TABLE items; --" }
    assert_response :success
    assert_equal before, Item.count
    assert Item.exists?(drop.id)

    get api_v1_items_path, params: { q: "tile\u0000" }
    assert_response :success
    assert_equal [ "Café tile" ], response.parsed_body["items"].map { |item| item["title"] }

    get api_v1_items_path, params: { q: "🧵" }
    assert_equal [ "Café tile" ], response.parsed_body["items"].map { |item| item["title"] }

    get api_v1_items_path, params: { q: "a" * 101 }
    assert_response :unprocessable_entity
    assert_equal [ "is too long (maximum is 100 characters)" ], response.parsed_body["errors"]["q"]

    noisy = ([ "alpha" ] * 8 + [ "missing-word" ]).join(" ")
    Item.create!(title: noisy.split.first(8).join(" "))
    get api_v1_items_path, params: { q: noisy }
    assert_response :success
    assert_equal 1, response.parsed_body["total_count"]
  end

  test "tag filters are AND, ignore unknown names, and stop after five" do
    both = Item.create!(title: "Both")
    brand_only = Item.create!(title: "Brand only")
    both.replace_tag_names([ "Brand", "Web" ])
    brand_only.replace_tag_names([ "brand" ])

    get api_v1_items_path, params: { tags: [ "brand", "WEB" ] }
    assert_response :success
    assert_equal [ both.id ], response.parsed_body["items"].map { |item| item["id"] }
    assert_equal [], response.parsed_body["ignored_tags"]

    get api_v1_items_path, params: { tags: [ "brand", "missing" ] }
    assert_equal [ both.id, brand_only.id ].sort, response.parsed_body["items"].map { |item| item["id"] }.sort
    assert_equal [ "missing" ], response.parsed_body["ignored_tags"]

    get api_v1_items_path, params: { tags: %w[a b c d e f] }
    assert_response :unprocessable_entity
    assert_equal [ "can filter by at most 5 tags" ], response.parsed_body["errors"]["tags"]
  end

  test "sort and cursors walk a filtered set without gaps" do
    %w[Cedar birch Ash].each_with_index do |title, index|
      item = Item.create!(title: title, notes: "wood")
      item.replace_tag_names([ "timber" ])
      item.update_columns(created_at: Time.zone.parse("2026-01-0#{index + 1}"), updated_at: Time.zone.parse("2026-01-0#{index + 1}"))
    end
    Item.create!(title: "Ash", notes: "second")
    Item.create!(title: "Metal", notes: "wood")

    %w[newest oldest az].each do |sort|
      seen = []
      cursor = nil
      6.times do
        get api_v1_items_path, params: { q: "wood", tags: [ "timber" ], sort: sort, per_page: 1, cursor: cursor }
        assert_response :success, sort
        page = response.parsed_body
        break if page["items"].empty?

        seen.concat(page["items"].map { |item| item["id"] })
        cursor = page["next_cursor"]
        break if cursor.nil?
      end

      assert_equal seen.uniq, seen
      assert_equal 3, seen.size
    end

    get api_v1_items_path, params: { sort: "az", per_page: 10 }
    titles = response.parsed_body["items"].map { |item| item["title"] }
    assert_equal titles.map(&:downcase).sort, titles.map(&:downcase)

    newest = nil
    get api_v1_items_path, params: { sort: "newest", per_page: 1 }
    newest = response.parsed_body["next_cursor"]
    get api_v1_items_path, params: { sort: "az", cursor: newest }
    assert_response :unprocessable_entity
    assert_equal [ "is invalid" ], response.parsed_body["errors"]["cursor"]

    get api_v1_items_path, params: { sort: "sideways" }
    assert_response :success
    assert response.parsed_body["items"].first["title"].present?
  end

  test "item json includes sorted tags without an n plus one" do
    items = 3.times.map do |index|
      item = Item.create!(title: "Row #{index}")
      item.replace_tag_names([ "zeta", "alpha" ])
      item
    end

    sqls = capture_sql do
      get api_v1_items_path, params: { q: "Row", sort: "az" }
    end

    assert_response :success
    body = response.parsed_body
    assert_equal [ "alpha", "zeta" ], body["items"].first["tags"].map { |tag| tag["name"] }
    assert_equal items.size, body["total_count"]
    tag_reads = sqls.count { |sql| sql.match?(/FROM "tags"/i) }
    assert_operator tag_reads, :<=, 3
    assert_operator tag_reads, :>, 0
  end

  test "tag names replace the set and omit means leave them" do
    post api_v1_items_path,
      params: { item: { title: "Lamp", tag_names: [ "Brand", " brand ", "Web" ] } },
      as: :json
    assert_response :created
    created = response.parsed_body
    assert_equal [ "Brand", "Web" ], created["tags"].map { |tag| tag["name"] }

    patch api_v1_item_path(created["id"]),
      params: { item: { title: "Library lamp" } },
      as: :json
    assert_equal [ "Brand", "Web" ], response.parsed_body["tags"].map { |tag| tag["name"] }

    patch api_v1_item_path(created["id"]),
      params: { item: { tag_names: [] } },
      as: :json
    assert_equal [], response.parsed_body["tags"]
    assert Tag.exists?(name: "Brand")

    patch api_v1_item_path(created["id"]),
      params: { item: { tag_names: [ "bad,name" ] } },
      as: :json
    assert_response :unprocessable_entity
    assert response.parsed_body["errors"]["tags"].present?
  end

  test "a hostile tag name is stored only as text when validation is skipped" do
    tag = Tag.create!(name: "ok")
    tag.update_columns(name: "<img src=x onerror=alert(1)>")
    item = Item.create!(title: "Hostile")
    ItemTag.create!(item: item, tag: tag)

    get api_v1_item_path(item.id)
    assert_response :success
    assert_equal "application/json", response.media_type
    assert_equal "<img src=x onerror=alert(1)>", response.parsed_body["tags"].first["name"]
  end

  test "tags can be listed, renamed, and deleted without deleting swatches" do
    item = Item.create!(title: "Kept")
    item.replace_tag_names([ "brand" ])
    tag = Tag.find_by!(name: "brand")

    get api_v1_tags_path
    assert_response :success
    listed = response.parsed_body.find { |row| row["id"] == tag.id }
    assert_equal "brand", listed["name"]
    assert_equal 1, listed["items_count"]

    patch api_v1_tag_path(tag.id), params: { tag: { name: "Brand" } }, as: :json
    assert_response :success
    assert_equal "Brand", response.parsed_body["name"]

    other = Tag.create!(name: "web")
    patch api_v1_tag_path(tag.id), params: { tag: { name: "web" } }, as: :json
    assert_response :unprocessable_entity
    assert_equal [ "A tag with that name already exists" ], response.parsed_body["errors"]["name"]

    delete api_v1_tag_path(other.id), as: :json
    assert_response :no_content
    assert Item.exists?(item.id)
    assert_not Tag.exists?(other.id)

    delete api_v1_tag_path(tag.id), as: :json
    assert_response :no_content
    assert Item.exists?(item.id)
    assert_not ItemTag.exists?(item_id: item.id)

    delete api_v1_tag_path(tag.id), as: :json
    assert_response :not_found
    assert_equal({ "error" => "Not found" }, response.parsed_body)
  end

  test "tag writes share the item write budget and need a csrf token" do
    30.times do |index|
      post api_v1_items_path, params: { item: { title: "Rate #{index}" } }, as: :json
      assert_response :created
    end
    tag = Tag.create!(name: "late")
    patch api_v1_tag_path(tag.id), params: { tag: { name: "later" } }, as: :json
    assert_response :too_many_requests

    Api::V1::ItemsController::RATE_LIMIT_STORE.clear
    120.times do
      get api_v1_items_path
      assert_response :success
    end
    get api_v1_items_path
    assert_response :too_many_requests
    assert_equal "Too many requests", response.parsed_body["error"]

    Api::V1::ItemsController::RATE_LIMIT_STORE.clear
    with_forgery_protection do
      patch api_v1_tag_path(tag.id), params: { tag: { name: "nope" } }, as: :json
      assert_response :unprocessable_entity
      assert_equal "Invalid authenticity token", response.parsed_body["error"]

      delete api_v1_tag_path(tag.id), as: :json
      assert_response :unprocessable_entity
      assert Tag.exists?(tag.id)
    end
  end

  test "new tag routes ask for the owner and the manage page is the app shell" do
    sign_out
    get api_v1_tags_path
    assert_response :unauthorized
    assert_equal "Sign in required", response.parsed_body["error"]

    sign_in_as(users(:owner))
    get "/tags"
    assert_response :success
    assert_select "#root[data-version=?]", Swatch::VERSION
  end

  private
    def capture_sql
      sqls = []
      subscriber = ActiveSupport::Notifications.subscribe("sql.active_record") do |*, payload|
        sqls << payload[:sql]
      end
      yield
      sqls
    ensure
      ActiveSupport::Notifications.unsubscribe(subscriber) if subscriber
    end

    def with_forgery_protection
      previous = ActionController::Base.allow_forgery_protection
      ActionController::Base.allow_forgery_protection = true
      yield
    ensure
      ActionController::Base.allow_forgery_protection = previous
    end
end
