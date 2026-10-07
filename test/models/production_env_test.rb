require "test_helper"

class ProductionEnvTest < ActiveSupport::TestCase
  test "reports database and secret when both are missing" do
    missing = Swatch::ProductionEnv.missing_settings({}, credentials_present: false)

    assert_includes missing, "DATABASE_URL"
    assert_includes missing.join, "SECRET_KEY_BASE"
  end

  test "accepts SECRET_KEY_BASE without a master key" do
    missing = Swatch::ProductionEnv.missing_settings(
      { "DATABASE_URL" => "postgres://example", "SECRET_KEY_BASE" => "generated" },
      credentials_present: false
    )

    assert_empty missing
  end

  test "accepts RAILS_MASTER_KEY only when encrypted credentials exist" do
    env = { "DATABASE_URL" => "postgres://example", "RAILS_MASTER_KEY" => "abc" }

    assert_empty Swatch::ProductionEnv.missing_settings(env, credentials_present: true)
    assert_not_empty Swatch::ProductionEnv.missing_settings(env, credentials_present: false)
  end

  test "failure message names the missing settings and not their values" do
    message = Swatch::ProductionEnv.failure_message([ "DATABASE_URL" ])

    assert_includes message, "cannot boot in production"
    assert_includes message, "DATABASE_URL"
    assert_not_includes message, "postgres://"
  end
end
