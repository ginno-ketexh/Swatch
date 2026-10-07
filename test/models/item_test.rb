require "test_helper"

class ItemTest < ActiveSupport::TestCase
  test "strips the title and keeps a normal item" do
    item = Item.create!(
      title: "  Hello  ",
      source_url: "  HTTPS://Example.com/path  ",
      notes: "  a note  ",
      color: "  #aabbcc  "
    )

    assert_equal "Hello", item.title
    assert_equal "https://Example.com/path", item.source_url
    assert_equal "a note", item.notes
    assert_equal "#AABBCC", item.color
    assert_equal "Example.com", item.source_domain
  end

  test "rejects a whitespace-only title" do
    item = Item.new(title: "   ")

    assert_not item.valid?
    assert_includes item.errors[:title], "can't be blank"
  end

  test "rejects a title longer than 120 characters" do
    item = Item.new(title: "a" * 121)

    assert_not item.valid?
    assert_includes item.errors[:title], "is too long (maximum is 120 characters)"
    assert Item.new(title: "a" * 120).valid?
  end

  test "rejects javascript and data urls, including mixed-case schemes" do
    javascript = Item.new(title: "Bad", source_url: "JavaScript:alert(1)")
    data = Item.new(title: "Bad", source_url: "data:text/html,hi")
    ftp = Item.new(title: "Bad", source_url: "ftp://example.com/file")

    assert_not javascript.valid?
    assert_not data.valid?
    assert_not ftp.valid?
    assert_includes javascript.errors[:source_url], "must be an http or https URL"
  end

  test "accepts http and https and treats a blank link as empty" do
    assert Item.new(title: "Ok", source_url: "http://example.com").valid?
    assert Item.new(title: "Ok", source_url: "https://example.com/a").valid?

    item = Item.create!(title: "Ok", source_url: "  ")
    assert_nil item.source_url
  end

  test "rejects notes longer than 2000 characters and blank notes" do
    assert_not Item.new(title: "Ok", notes: "a" * 2001).valid?
    assert Item.new(title: "Ok", notes: "a" * 2000).valid?

    item = Item.create!(title: "Ok", notes: "   ")
    assert_nil item.notes
  end

  test "stores a lowercase hex colour in uppercase and rejects other shapes" do
    item = Item.create!(title: "Ok", color: "#aabbcc")
    assert_equal "#AABBCC", item.color

    assert_not Item.new(title: "Ok", color: "#abc").valid?
    assert_not Item.new(title: "Ok", color: "aabbcc").valid?
    assert_not Item.new(title: "Ok", color: "#GGGGGG").valid?

    blank = Item.create!(title: "Ok", color: "  ")
    assert_nil blank.color
  end

  test "the database rejects values the model would reject" do
    item = Item.create!(title: "Kept")

    {
      source_url: "javascript:alert(1)",
      color: "#aabbcc",
      notes: "a" * 2001,
      title: "   "
    }.each do |attribute, value|
      assert_raises(ActiveRecord::StatementInvalid) do
        Item.transaction(requires_new: true) do
          item.update_columns(attribute => value)
        end
      end
    end
  end

  test "seeds do nothing outside development" do
    assert_no_difference -> { Item.count } do
      load Rails.root.join("db/seeds.rb")
    end
  end
end
