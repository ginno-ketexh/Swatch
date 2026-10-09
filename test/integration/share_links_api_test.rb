require "test_helper"

class ShareLinksApiTest < ActionDispatch::IntegrationTest
  setup do
    ApiWriteLimit::STORE.clear
  end

  test "creates lists and deletes a swatch link" do
    item = Item.create!(title: "Terracotta stair", notes: "Warm")

    post api_v1_share_links_path, params: { item_id: item.id }, as: :json

    assert_response :created
    body = response.parsed_body
    assert_match %r{/s/[1-9A-HJ-NP-Za-km-z]{36}\z}, body["url"]
    assert_equal "item", body["kind"]
    assert_equal "Terracotta stair", body["target_title"]
    assert_nil body["title"]
    assert_equal false, body["include_notes"]
    assert_equal false, body["include_preview_image"]
    assert body["expires_at"].present?
    assert_equal "active", body["status"]
    assert_equal item.user_id, ShareLink.find(body["id"]).user_id
    assert_not_equal "stolen", ShareLink.find(body["id"]).token

    get api_v1_share_links_path, params: { item_id: item.id }
    assert_response :success
    assert_equal [ body["id"] ], response.parsed_body.map { |link| link["id"] }

    delete api_v1_share_link_path(body["id"])
    assert_response :no_content
    assert_not ShareLink.exists?(body["id"])
  end

  test "options, a blank title, and an unknown expiry" do
    item = Item.create!(title: "Lamp")

    post api_v1_share_links_path, params: {
      item_id: item.id,
      title: "   ",
      include_notes: true,
      include_preview_image: true,
      expires_in: "never",
      token: "a" * 36,
      user_id: users(:other).id
    }, as: :json

    assert_response :created
    body = response.parsed_body
    assert_nil body["title"]
    assert_equal true, body["include_notes"]
    assert_equal true, body["include_preview_image"]
    assert_nil body["expires_at"]
    link = ShareLink.find(body["id"])
    assert_not_equal "a" * 36, link.token
    assert_equal users(:owner).id, link.user_id

    post api_v1_share_links_path, params: { item_id: item.id, expires_in: "2d" }, as: :json
    assert_response :unprocessable_entity
    assert_equal [ "is not included in the list" ], response.parsed_body["errors"]["expires_in"]

    post api_v1_share_links_path, params: { item_id: item.id, title: "x" * 81 }, as: :json
    assert_response :unprocessable_entity
    assert_equal [ "is too long (maximum is 80 characters)" ], response.parsed_body["errors"]["title"]

    post api_v1_share_links_path, params: { item_id: item.id, tag_id: Tag.create!(name: "both").id }, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body["errors"]["base"], "Choose a swatch or a tag"
  end

  test "another person's swatch or link is not found" do
    foreign = Item.create!(title: "Secret", user: users(:other))
    foreign_tag = Tag.create!(name: "secret", user: users(:other))

    post api_v1_share_links_path, params: { item_id: foreign.id }, as: :json
    assert_response :not_found

    get api_v1_share_links_path, params: { item_id: foreign.id }
    assert_response :not_found
    assert_not_equal [], response.parsed_body

    get api_v1_share_links_path, params: { tag_id: foreign_tag.id }
    assert_response :not_found

    theirs = ShareLink.create!(user: users(:other), item: foreign)
    delete api_v1_share_link_path(theirs)
    assert_response :not_found
    assert ShareLink.exists?(theirs.id)
  end

  test "the fiftieth link blocks the next create" do
    item = Item.create!(title: "Cap")
    50.times { ShareLink.create!(user: users(:owner), item: item) }

    post api_v1_share_links_path, params: { item_id: item.id }, as: :json
    assert_response :unprocessable_entity
    assert_equal "You have 50 share links. Remove some first.", response.parsed_body["error"]
  end

  test "expired links do not block a new one" do
    item = Item.create!(title: "Cap")
    50.times { ShareLink.create!(user: users(:owner), item: item, expires_at: 1.day.ago) }

    post api_v1_share_links_path, params: { item_id: item.id }, as: :json
    assert_response :created
    assert_equal 1, users(:owner).share_links.active.count
  end

  test "signed out requests are refused and a missing token is refused" do
    item = Item.create!(title: "Lamp")
    sign_out

    get api_v1_share_links_path
    assert_response :unauthorized

    with_forgery_protection do
      sign_in_as(users(:owner))
      post api_v1_share_links_path, params: { item_id: item.id }, as: :json
      assert_response :unprocessable_entity
      assert_equal "Invalid authenticity token", response.parsed_body["error"]
    end
  end

  test "creating counts toward the shared write limit" do
    item = Item.create!(title: "Lamp")
    PublicShareLimit::STORE.clear
    key = "rate-limit:api-v1:writes:127.0.0.1"
    ApiWriteLimit::STORE.write(key, 30, expires_in: 1.minute)

    post api_v1_share_links_path, params: { item_id: item.id }, as: :json
    assert_response :too_many_requests
    assert_equal "Too many requests", response.parsed_body["error"]
  end

  test "index can show expired links and hides them by default" do
    item = Item.create!(title: "Lamp")
    live = ShareLink.create!(user: users(:owner), item: item, expires_at: 1.day.from_now)
    old = ShareLink.create!(user: users(:owner), item: item, expires_at: 1.day.ago)

    get api_v1_share_links_path
    assert_equal [ live.id ], response.parsed_body.map { |link| link["id"] }

    get api_v1_share_links_path, params: { status: "expired" }
    assert_equal [ old.id ], response.parsed_body.map { |link| link["id"] }

    get api_v1_share_links_path, params: { status: "all" }
    assert_equal [ old.id, live.id ].sort, response.parsed_body.map { |link| link["id"] }.sort
  end

  test "a shared swatch is flagged once for the page" do
    shared = Item.create!(title: "Shared one")
    Item.create!(title: "Plain")
    ShareLink.create!(user: users(:owner), item: shared)

    get api_v1_items_path
    flags = response.parsed_body["items"].to_h { |item| [ item["title"], item["shared"] ] }
    assert_equal true, flags["Shared one"]
    assert_equal false, flags["Plain"]

    get api_v1_item_path(shared)
    assert_equal true, response.parsed_body["shared"]
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
