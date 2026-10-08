require "test_helper"

class TagTest < ActiveSupport::TestCase
  test "names are stripped, collapsed, and kept as first spelled" do
    tag = Tag.create!(name: "  Brand   mark  ")

    assert_equal "Brand mark", tag.name
    again = Tag.find_or_create_by_name!(" brand   mark ")
    assert_equal tag.id, again.id
    assert_equal "Brand mark", again.name
  end

  test "unicode is normalised and letters from other languages are allowed" do
    composed = "Cafe\u0301"
    tag = Tag.create!(name: composed)

    assert_equal "Café", tag.name
    assert Tag.create!(name: "色").persisted?
  end

  test "blank, long, and odd characters are refused" do
    blank = Tag.new(name: "   ")
    assert_not blank.valid?
    assert_includes blank.errors[:name], "can't be blank"

    long = Tag.new(name: "a" * 31)
    assert_not long.valid?
    assert_includes long.errors[:name], "is too long (maximum is 30 characters)"

    odd = Tag.new(name: "brand,web")
    assert_not odd.valid?
    assert_includes odd.errors[:name], "can only use letters, numbers, spaces, and - _ & . '"
  end

  test "a case-only rename is allowed and a real clash is refused" do
    brand = Tag.create!(name: "brand")
    Tag.create!(name: "web")

    assert brand.update(name: "Brand")
    assert_equal "Brand", brand.reload.name

    clash = brand.dup
    clash.name = "WEB"
    assert_not clash.valid?
    assert_includes clash.errors[:name], "A tag with that name already exists"
  end

  test "a unique index clash finds the tag that won" do
    existing = Tag.create!(name: "Brand")
    raised = false
    original = Tag.method(:create!)
    Tag.define_singleton_method(:create!) do |*args, **kwargs, &block|
      unless raised
        raised = true
        raise ActiveRecord::RecordNotUnique
      end
      original.call(*args, **kwargs, &block)
    end

    found = Tag.find_or_create_by_name!("BRAND")
    assert_equal existing.id, found.id
    assert_equal "Brand", found.name
  ensure
    Tag.singleton_class.send(:remove_method, :create!)
  end

  test "an item can have at most 10 tags and deleting the item keeps the tag" do
    item = Item.create!(title: "Tagged")
    names = 10.times.map { |index| "tag#{index}" }
    assert item.replace_tag_names(names)
    assert_equal 10, item.tags.count

    extra = item.dup
    extra.title = "Too many"
    assert extra.save
    assert_not extra.replace_tag_names(names + [ "one-more" ])
    assert_includes extra.errors[:tags], "can have at most 10 tags"

    tag = Tag.find_by!(name: "tag0")
    item.destroy!
    assert Tag.exists?(tag.id)
    assert_equal 0, ItemTag.where(tag_id: tag.id, item_id: item.id).count
  end

  test "repeated names in one list become one tag and the first spelling wins" do
    item = Item.create!(title: "Once")
    assert item.replace_tag_names([ "Brand", " brand ", "BRAND" ])
    assert_equal [ "Brand" ], item.tags.map(&:name)
  end
end
