require "test_helper"

class OwnershipTest < ActionDispatch::IntegrationTest
  test "another person's swatches and tags are invisible" do
    mine = Item.create!(title: "My lamp", user: users(:owner))
    mine.replace_tag_names([ "brand" ])
    secret = Item.create!(title: "Secret stair", user: users(:other))
    secret.replace_tag_names([ "brand" ])
    foreign_tag = secret.tags.first

    get api_v1_items_path, params: { q: "stair" }
    assert_response :success
    assert_empty response.parsed_body["items"]

    get api_v1_items_path, params: { tags: [ "brand" ] }
    ids = response.parsed_body["items"].map { |item| item["id"] }
    assert_includes ids, mine.id
    assert_not_includes ids, secret.id

    get api_v1_tags_path
    names = response.parsed_body.map { |tag| tag["id"] }
    assert_not_includes names, foreign_tag.id

    get api_v1_item_path(secret)
    assert_response :not_found
    patch api_v1_item_path(secret), params: { item: { title: "Stolen" } }, as: :json
    assert_response :not_found
    delete api_v1_item_path(secret), as: :json
    assert_response :not_found
    assert_equal "Secret stair", secret.reload.title

    patch api_v1_tag_path(foreign_tag), params: { tag: { name: "stolen" } }, as: :json
    assert_response :not_found
    delete api_v1_tag_path(foreign_tag), as: :json
    assert_response :not_found
    assert Tag.exists?(foreign_tag.id)
  end

  test "a save cannot move a swatch or a tag to someone else" do
    post api_v1_items_path, params: { item: { title: "Mine", user_id: users(:other).id, tag_names: [ "brand" ] } }, as: :json
    assert_response :created
    item = Item.find(response.parsed_body["id"])
    assert_equal users(:owner).id, item.user_id
    assert_equal [ users(:owner).id ], item.tags.map(&:user_id)

    Tag.create!(name: "brand", user: users(:other))
    assert_equal 2, Tag.where("lower(name) = ?", "brand").count
    assert_equal 1, users(:owner).tags.where("lower(name) = ?", "brand").count
  end

  test "lookups go through the signed in user" do
    root = Rails.root.join("app")
    offenders = Dir.glob(root.join("**/*.rb")).filter_map do |path|
      next if path.include?("/models/")

      source = File.read(path)
      path if source.match?(/\bItem\.find\b/) || source.match?(/\bTag\.find\b/)
    end

    assert_empty offenders
  end
end
