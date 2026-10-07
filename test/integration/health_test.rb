require "test_helper"

class HealthTest < ActionDispatch::IntegrationTest
  test "returns ok when the database answers" do
    get rails_health_check_path

    assert_response :ok
    assert_equal "text/plain", response.media_type
    assert_equal "OK", response.body
    assert_not_includes response.body, "PostgreSQL"
    assert_not_includes response.body, Rails::VERSION::STRING
  end

  test "returns service unavailable when the database is down" do
    secret = "super-secret-db-password"
    original = HealthController.instance_method(:probe_database)
    HealthController.define_method(:probe_database) do
      raise ActiveRecord::ConnectionNotEstablished,
        "could not connect to postgres://swatch:#{secret}@db.internal:5432/swatch (config/database.yml:12)"
    end

    get rails_health_check_path

    assert_response :service_unavailable
    assert_equal "text/plain", response.media_type
    assert_equal "Unavailable", response.body
    assert_not_includes response.body, secret
    assert_not_includes response.body, "database.yml"
    assert_not_includes response.body, "ConnectionNotEstablished"
    assert_not_includes response.body, "postgres://"
  ensure
    HealthController.define_method(:probe_database, original) if original
  end
end
