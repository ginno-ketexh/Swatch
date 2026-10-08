require "test_helper"
require "rake"

class OwnerBootstrapTest < ActiveSupport::TestCase
  setup do
    @log = StringIO.new
    @logger = Logger.new(@log)
    @env = {}
  end

  test "creates the owner and masks the log" do
    clear_library!
    OwnerBootstrap.call!(env: {
      "OWNER_EMAIL" => "  Ginno@Example.com ",
      "OWNER_PASSWORD" => "correct-horse-battery"
    }, logger: @logger)

    owner = User.find_by!(email_address: "ginno@example.com")
    assert owner.authenticate("correct-horse-battery")
    assert_includes @log.string, "Owner account created for g***@…"
    assert_not_includes @log.string, "correct-horse-battery"
    assert_not_includes @log.string, "ginno@example.com"
    assert_not_includes @log.string, "Ginno@Example.com"
  end

  test "a short password fails without creating a user" do
    clear_library!
    error = assert_raises(OwnerBootstrap::Error) do
      OwnerBootstrap.call!(env: {
        "OWNER_EMAIL" => "ginno@example.com",
        "OWNER_PASSWORD" => "short"
      }, logger: @logger)
    end

    assert_equal "OWNER_PASSWORD must be at least 15 characters", error.message
    assert_equal 0, User.count
    assert_not_includes @log.string, "short"
  end

  test "missing email or an invalid email fails the build" do
    clear_library!
    missing = assert_raises(OwnerBootstrap::Error) do
      OwnerBootstrap.call!(env: { "OWNER_PASSWORD" => "correct-horse-battery" }, logger: @logger)
    end
    assert_equal "OWNER_EMAIL is missing", missing.message

    invalid = assert_raises(OwnerBootstrap::Error) do
      OwnerBootstrap.call!(env: {
        "OWNER_EMAIL" => "not-an-email",
        "OWNER_PASSWORD" => "correct-horse-battery"
      }, logger: @logger)
    end
    assert_equal "OWNER_EMAIL is not a valid email address", invalid.message
    assert_equal 0, User.count
  end

  test "a second run does not create another account or change the password" do
    digest = users(:owner).password_digest
    OwnerBootstrap.call!(env: {
      "OWNER_EMAIL" => "someone@example.com",
      "OWNER_PASSWORD" => "another-long-password"
    }, logger: @logger)

    assert_equal 2, User.count
    assert_equal digest, users(:owner).reload.password_digest
    assert_not_includes @log.string, "Owner account created"
  end

  test "backfill assigns rows and merges a duplicate tag" do
    owner = users(:owner)
    item = Item.create!(title: "Old lamp", user: owner)
    other_item = Item.create!(title: "Loose", user: owner)
    item.update_column(:user_id, nil)
    other_item.update_column(:user_id, nil)

    keeper = Tag.create!(name: "Brand", user: owner)
    item.tags << keeper
    orphan = Tag.create!(name: "brand", user: users(:other))
    orphan.update_column(:user_id, nil)
    ItemTag.create!(item: item, tag: orphan)
    loose = Tag.create!(name: "web", user: users(:other))
    loose.update_column(:user_id, nil)

    OwnerBootstrap.call!(env: {}, logger: @logger)

    assert_equal owner.id, item.reload.user_id
    assert_equal owner.id, other_item.reload.user_id
    assert_equal owner.id, loose.reload.user_id
    assert_not Tag.exists?(orphan.id)
    assert_equal [ keeper.id ], item.tags.reload.map(&:id)
  end

  test "a new password replaces the old one and signs out every device" do
    session = users(:owner).sessions.create!(user_agent: "Phone")
    OwnerBootstrap.call!(env: { "OWNER_NEW_PASSWORD" => "a-brand-new-password" }, logger: @logger)

    assert users(:owner).reload.authenticate("a-brand-new-password")
    assert_not Session.exists?(session.id)
    assert_includes @log.string, "Owner password reset; remove OWNER_NEW_PASSWORD from Render now"
    assert_not_includes @log.string, "a-brand-new-password"
  end

  test "a matching new password only reminds you to remove it" do
    session = users(:owner).sessions.create!(user_agent: "Phone")
    OwnerBootstrap.call!(env: { "OWNER_NEW_PASSWORD" => "password-password" }, logger: @logger)

    assert Session.exists?(session.id)
    assert_includes @log.string, "Remove OWNER_NEW_PASSWORD from Render now."
    assert_not_includes @log.string, "Owner password reset"
  end

  test "an invalid new password leaves the account alone" do
    digest = users(:owner).password_digest
    error = assert_raises(OwnerBootstrap::Error) do
      OwnerBootstrap.call!(env: { "OWNER_NEW_PASSWORD" => "short" }, logger: @logger)
    end

    assert_equal "OWNER_NEW_PASSWORD must be at least 15 characters", error.message
    assert_equal digest, users(:owner).reload.password_digest
  end

  test "running before migrations exist fails clearly" do
    connection = Object.new
    def connection.table_exists?(*) = false
    def connection.column_exists?(*) = false

    error = assert_raises(OwnerBootstrap::Error) do
      OwnerBootstrap.call!(env: {}, logger: @logger, connection: connection)
    end
    assert_equal "Run database migrations before creating the owner account.", error.message
  end

  test "the rake task exits when the owner email is missing" do
    previous_email = ENV.delete("OWNER_EMAIL")
    previous_password = ENV.delete("OWNER_PASSWORD")
    clear_library!
    load_swatch_tasks
    Rake::Task["swatch:bootstrap_owner"].reenable

    output = capture_io do
      error = assert_raises(SystemExit) { Rake::Task["swatch:bootstrap_owner"].invoke }
      assert_equal 1, error.status
    end

    assert_includes output.join, "OWNER_EMAIL is missing"
  ensure
    ENV["OWNER_EMAIL"] = previous_email if previous_email
    ENV["OWNER_PASSWORD"] = previous_password if previous_password
  end

  test "reset owner password prompts without echo" do
    load_swatch_tasks
    Rake::Task["swatch:reset_owner_password"].reenable
    called = false
    $stdin.define_singleton_method(:noecho) do |&_block|
      called = true
      "brand-new-password-1\n"
    end

    capture_io { Rake::Task["swatch:reset_owner_password"].invoke }

    assert called
    assert users(:owner).reload.authenticate("brand-new-password-1")
  ensure
    ENV.delete("OWNER_NEW_PASSWORD")
    if $stdin.singleton_methods(false).include?(:noecho)
      $stdin.singleton_class.send(:remove_method, :noecho)
    end
  end

  private
    def clear_library!
      ItemTag.delete_all
      Item.delete_all
      Tag.delete_all
      Session.delete_all
      User.delete_all
    end

    def load_swatch_tasks
      Rails.application.load_tasks unless Rake::Task.task_defined?("swatch:bootstrap_owner")
    end
end
