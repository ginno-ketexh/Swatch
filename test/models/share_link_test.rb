require "test_helper"

class ShareLinkTest < ActiveSupport::TestCase
  test "token is 36 base58 characters and the scope is one target" do
    item = Item.create!(title: "Lamp")
    link = ShareLink.create!(user: item.user, item: item, expires_at: 30.days.from_now)

    assert_equal 36, link.token.length
    assert_match ShareLink::TOKEN_FORMAT, link.token

    blank = ShareLink.new(user: item.user)
    assert_not blank.valid?
    assert_includes blank.errors[:base], "Choose a swatch or a tag"

    tag = Tag.create!(name: "both")
    both = ShareLink.new(user: item.user, item: item, tag: tag)
    assert_not both.valid?
  end

  test "the swatch or tag must belong to the link owner" do
    foreign = Item.create!(title: "Secret", user: users(:other))
    link = ShareLink.new(user: users(:owner), item: foreign)

    assert_not link.valid?
    assert_includes link.errors[:item], "must belong to you"
  end

  test "the fiftieth link is kept and the next is refused" do
    item = Item.create!(title: "Cap")
    50.times { ShareLink.create!(user: item.user, item: item) }
    extra = ShareLink.new(user: item.user, item: item)

    assert_not extra.save
    assert_includes extra.errors[:base], "You have 50 share links. Remove some first."
    assert_equal 50, item.user.share_links.count
  end

  test "expired links do not count toward the cap" do
    item = Item.create!(title: "Cap")
    50.times { ShareLink.create!(user: item.user, item: item, expires_at: 1.day.ago) }

    extra = ShareLink.create!(user: item.user, item: item)

    assert extra.persisted?
    assert extra.active?
    assert_equal 1, item.user.share_links.active.count
  end

  test "expiry status and a blank title" do
    item = Item.create!(title: "Lamp")
    active = ShareLink.create!(user: item.user, item: item, title: "  ", expires_at: 1.day.from_now)
    expired = ShareLink.create!(user: item.user, item: item, expires_at: 1.day.ago)
    forever = ShareLink.create!(user: item.user, item: item, expires_at: nil)

    assert_nil active.title
    assert_equal "Lamp", active.public_title
    assert active.active?
    assert_not expired.active?
    assert forever.active?
    assert_equal [ active.id, forever.id ].sort, item.user.share_links.active.pluck(:id).sort
    assert_equal [ expired.id ], item.user.share_links.expired.pluck(:id)
  end

  test "deleting the swatch or the tag deletes the link" do
    item = Item.create!(title: "Gone")
    link = ShareLink.create!(user: item.user, item: item)
    item.destroy!
    assert_not ShareLink.exists?(link.id)

    tag = Tag.create!(name: "gone")
    tagged = ShareLink.create!(user: tag.user, tag: tag)
    tag.destroy!
    assert_not ShareLink.exists?(tagged.id)
  end

  test "views increment without moving updated_at, and last viewed waits a minute" do
    item = Item.create!(title: "Lamp")
    link = ShareLink.create!(user: item.user, item: item)
    stamp = link.updated_at

    link.record_view!
    link.reload
    assert_equal 1, link.views_count
    assert_equal stamp.to_i, link.updated_at.to_i
    seen = link.last_viewed_at

    link.record_view!
    link.reload
    assert_equal 2, link.views_count
    assert_equal seen.to_i, link.last_viewed_at.to_i
    assert_equal stamp.to_i, link.updated_at.to_i

    travel 2.minutes do
      link.record_view!
      link.reload
      assert_equal 3, link.views_count
      assert_operator link.last_viewed_at, :>, seen
      assert_equal stamp.to_i, link.updated_at.to_i
    end
  end
end
