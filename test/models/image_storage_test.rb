require "test_helper"
require "open3"

class ImageStorageTest < ActiveSupport::TestCase
  FULL = {
    "R2_ACCOUNT_ID" => "abc123",
    "R2_ACCESS_KEY_ID" => "key",
    "R2_SECRET_ACCESS_KEY" => "secret-value",
    "R2_BUCKET" => "swatch-images"
  }.freeze

  test "uploads are on in development and test without R2 settings" do
    assert Swatch::ImageStorage.enabled?({}, rails_env: "development")
    assert Swatch::ImageStorage.enabled?({}, rails_env: "test")
    assert_equal :local, Swatch::ImageStorage.service_name({}, rails_env: "development")
    assert_equal :test, Swatch::ImageStorage.service_name({}, rails_env: "test")
  end

  test "production uses R2 only when every setting is present and never uses disk" do
    assert_equal :r2, Swatch::ImageStorage.service_name(FULL, rails_env: "production")
    assert Swatch::ImageStorage.enabled?(FULL, rails_env: "production")

    assert_equal :off, Swatch::ImageStorage.service_name({}, rails_env: "production")
    assert_not Swatch::ImageStorage.enabled?({}, rails_env: "production")
    assert_not_equal :local, Swatch::ImageStorage.service_name({}, rails_env: "production")
    assert_not_equal :test, Swatch::ImageStorage.service_name({}, rails_env: "production")
    assert_equal %w[R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET], Swatch::ImageStorage.missing_settings({})
  end

  test "the R2 config carries the checksum options and does not open a connection" do
    config = Swatch::ImageStorage.r2_configuration(FULL)

    assert_equal "when_required", config[:request_checksum_calculation]
    assert_equal "when_required", config[:response_checksum_validation]
    assert_equal "auto", config[:region]
    assert_equal true, config[:force_path_style]
    assert_equal "https://abc123.r2.cloudflarestorage.com", config[:endpoint]
    assert_not_includes config[:endpoint], "secret-value"

    loaded = ActiveStorage::Blob.services.send(:configurations).fetch(:r2)
    assert_equal "when_required", loaded[:request_checksum_calculation] || loaded["request_checksum_calculation"]
    assert_equal "when_required", loaded[:response_checksum_validation] || loaded["response_checksum_validation"]
    assert_equal true, loaded[:force_path_style] || loaded["force_path_style"]
  end

  test "usage is labelled in megabytes" do
    assert_equal "Images: 0 MB of 2 GB used", Swatch::ImageStorage.usage_label(users(:owner))
  end

  test "the off service refuses a file and is not disk" do
    service = ActiveStorage::Blob.services.fetch(:off)
    assert_equal "ActiveStorage::Service::OffService", service.class.name
    assert_raises(Swatch::ImageStorage::Unavailable) { service.upload("key", StringIO.new("x")) }
    assert_not service.class.name.include?("Disk")
  end

  test "production boots with uploads off and with R2 settings, and never selects disk" do
    off = boot_production({})
    assert_includes off, "RESULT service=off enabled=false disk=false"
    assert_includes off, "Missing settings: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET"
    assert_not_includes off, "secret-value"

    on = boot_production(FULL)
    assert_includes on, "RESULT service=r2 enabled=true disk=false"
    assert_not_includes on, "secret-value"
  end

  private
    def boot_production(extra)
      env = ENV.to_h.except(*Swatch::ImageStorage::SETTINGS)
      env["RAILS_ENV"] = "production"
      env["SECRET_KEY_BASE"] = "b" * 128
      env["DATABASE_URL"] = ENV["DATABASE_URL"].presence || "postgres:///swatch_development"
      env.merge!(extra)
      script = <<~RUBY
        puts "RESULT service=\#{Rails.application.config.active_storage.service} enabled=\#{Swatch::ImageStorage.enabled?} disk=\#{%i[local test].include?(Rails.application.config.active_storage.service)}"
      RUBY
      output, status = Open3.capture2e(env, "bundle", "exec", "rails", "runner", script, unsetenv_others: true, chdir: Rails.root.to_s)
      assert status.success?, output
      output
    end
end
