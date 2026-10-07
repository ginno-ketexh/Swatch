require "test_helper"

class ItemsApiTest < ActionDispatch::IntegrationTest
  setup do
    Api::V1::ItemsController::RATE_LIMIT_STORE.clear
  end

  test "index is newest first, one query, and paginates with an opaque cursor" do
    older = Item.create!(title: "Older", source_url: "https://older.example/a", color: "#112233")
    newer = Item.create!(title: "Newer", notes: "Keep me")
    same_time = Time.zone.parse("2026-03-01 12:00:00")
    older.update_columns(created_at: same_time, updated_at: same_time)
    newer.update_columns(created_at: same_time, updated_at: same_time)

    sqls = []
    subscriber = ActiveSupport::Notifications.subscribe("sql.active_record") do |*, payload|
      sqls << payload[:sql]
    end
    get api_v1_items_path, params: { per_page: 1 }, headers: owner_headers
    ActiveSupport::Notifications.unsubscribe(subscriber)

    assert_response :success
    body = response.parsed_body
    assert_equal [ "Newer" ], body["items"].map { |item| item["title"] }
    assert_equal "Keep me", body["items"].first["notes"]
    assert body["next_cursor"].present?
    assert_not_includes body["next_cursor"], "Newer"
    item_sqls = sqls.select { |sql| sql.match?(/from ["']?items["']?/i) }
    assert_equal 1, item_sqls.size

    get api_v1_items_path, params: { per_page: 1, cursor: body["next_cursor"] }, headers: owner_headers

    assert_response :success
    next_body = response.parsed_body
    assert_equal [ "Older" ], next_body["items"].map { |item| item["title"] }
    assert_equal "older.example", next_body["items"].first["source_domain"]
    assert_nil next_body["next_cursor"]
  end

  test "per page defaults to 20 and never goes past 50" do
    21.times { |index| Item.create!(title: "Row #{index}") }

    get api_v1_items_path, headers: owner_headers
    assert_equal 20, response.parsed_body["items"].size
    assert response.parsed_body["next_cursor"].present?

    get api_v1_items_path, params: { per_page: 100 }, headers: owner_headers
    assert_equal 21, response.parsed_body["items"].size
  end

  test "a huge page size is capped at 50" do
    51.times { |index| Item.create!(title: "Cap #{index}") }

    get api_v1_items_path, params: { per_page: 100 }, headers: owner_headers

    assert_equal 50, response.parsed_body["items"].size
    assert response.parsed_body["next_cursor"].present?
  end

  test "an invalid cursor is a field error" do
    get api_v1_items_path, params: { cursor: "not-a-cursor" }, headers: owner_headers

    assert_response :unprocessable_entity
    assert_equal [ "is invalid" ], response.parsed_body["errors"]["cursor"]
  end

  test "show create update and destroy" do
    post api_v1_items_path,
      params: { item: { title: "  Lamp  ", source_url: "https://lamps.example/a", notes: "brass", color: "#aabbcc", admin: true } },
      headers: owner_headers,
      as: :json

    assert_response :created
    created = response.parsed_body
    assert_equal "Lamp", created["title"]
    assert_equal "#AABBCC", created["color"]
    assert_not created.key?("admin")

    get api_v1_item_path(created["id"]), headers: owner_headers
    assert_response :success
    assert_equal "brass", response.parsed_body["notes"]

    patch api_v1_item_path(created["id"]),
      params: { item: { title: "Library lamp" } },
      headers: owner_headers,
      as: :json
    assert_response :success
    assert_equal "Library lamp", response.parsed_body["title"]

    delete api_v1_item_path(created["id"]), headers: owner_headers, as: :json
    assert_response :no_content
    assert_not Item.exists?(created["id"])
  end

  test "invalid input is a field error and does not leak a trace" do
    post api_v1_items_path,
      params: { item: { title: "   ", source_url: "JavaScript:alert(1)" } },
      headers: owner_headers,
      as: :json

    assert_response :unprocessable_entity
    assert_includes response.parsed_body["errors"]["title"], "can't be blank"
    assert_includes response.parsed_body["errors"]["source_url"], "must be an http or https URL"
    assert_not_includes response.body, "Trace"
    assert_not_includes response.body, "JavaScript"
  end

  test "a missing item is json not found without an exception message" do
    get api_v1_item_path("999999"), headers: owner_headers

    assert_response :not_found
    assert_equal({ "error" => "Not found" }, response.parsed_body)
    assert_not_includes response.body, "Couldn't find"
  end

  test "writes are rate limited" do
    30.times do |index|
      post api_v1_items_path, params: { item: { title: "Rate #{index}" } }, headers: owner_headers, as: :json
      assert_response :created
    end

    post api_v1_items_path, params: { item: { title: "Too many" } }, headers: owner_headers, as: :json

    assert_response :too_many_requests
    assert_equal({ "error" => "Too many requests" }, response.parsed_body)
    assert_not Item.exists?(title: "Too many")
  end

  test "a write without a csrf token is rejected" do
    with_forgery_protection do
      post api_v1_items_path, params: { item: { title: "No token" } }, headers: owner_headers, as: :json

      assert_response :unprocessable_entity
      assert_equal "Invalid authenticity token", response.parsed_body["error"]
      assert_not Item.exists?(title: "No token")
    end
  end

  test "a write with the csrf token from the page is accepted" do
    with_forgery_protection do
      get root_path, headers: owner_headers
      token = css_select('meta[name="csrf-token"]').first["content"]

      post api_v1_items_path,
        params: { item: { title: "With token" } },
        headers: owner_headers.merge("X-CSRF-Token" => token),
        as: :json

      assert_response :created
      assert_equal "With token", response.parsed_body["title"]
    end
  end

  test "a write with the wrong csrf token is rejected" do
    with_forgery_protection do
      get root_path, headers: owner_headers

      post api_v1_items_path,
        params: { item: { title: "Bad token" } },
        headers: owner_headers.merge("X-CSRF-Token" => "not-the-token"),
        as: :json

      assert_response :unprocessable_entity
      assert_not Item.exists?(title: "Bad token")
    end
  end

  test "deep links to the form serve the app shell" do
    item = Item.create!(title: "Edit me")

    get "/items/#{item.id}/edit", headers: owner_headers

    assert_response :success
    assert_select "#root[data-version=?]", Swatch::VERSION
  end

  test "a swatch detail path serves the app shell" do
    get "/items/4", headers: owner_headers

    assert_response :success
    assert_select "#root[data-version=?]", Swatch::VERSION
  end

  private
    def with_forgery_protection
      previous = ActionController::Base.allow_forgery_protection
      ActionController::Base.allow_forgery_protection = true
      yield
    ensure
      ActionController::Base.allow_forgery_protection = previous
    end
end
