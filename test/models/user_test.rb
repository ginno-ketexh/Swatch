require "test_helper"

class UserTest < ActiveSupport::TestCase
  test "email is stripped and downcased" do
    user = User.create!(email_address: "  Ginno@Example.com ", password: "password-password")

    assert_equal "ginno@example.com", user.email_address
  end

  test "email must be unique regardless of case" do
    error = assert_raises(ActiveRecord::RecordInvalid) do
      User.create!(email_address: "OWNER@example.com", password: "password-password")
    end

    assert_match "already been taken", error.message
  end

  test "password must be at least 15 characters and at most 72 bytes" do
    short = User.new(email_address: "short@example.com", password: "too-short")
    assert_not short.valid?
    assert_includes short.errors[:password], "must be at least 15 characters"

    long = User.new(email_address: "long@example.com", password: "a" * 73)
    assert_not long.valid?
    assert_includes long.errors[:password], "is too long"

    spaced = User.create!(email_address: "space@example.com", password: "  spaced-password")
    assert spaced.authenticate("  spaced-password")
    assert_not spaced.authenticate("spaced-password")
  end

  test "a new password must differ from the current one" do
    user = users(:owner)
    user.password = "password-password"

    assert_not user.valid?
    assert_includes user.errors[:password], "must be different from the current password"
  end

  test "mask email keeps the first letter only" do
    assert_equal "g***@…", User.mask_email("ginno@example.com")
    assert_equal "unknown", User.mask_email("not-an-email")
  end

  test "deleting a user deletes their swatches tags and sessions" do
    user = User.create!(email_address: "temp@example.com", password: "password-password")
    item = Item.create!(title: "Gone", user: user)
    tag = Tag.create!(name: "temp", user: user)
    session = user.sessions.create!(user_agent: "Test")

    user.destroy!

    assert_not Item.exists?(item.id)
    assert_not Tag.exists?(tag.id)
    assert_not Session.exists?(session.id)
  end
end
