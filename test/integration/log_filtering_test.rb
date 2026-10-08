require "test_helper"

class LogFilteringTest < ActionDispatch::IntegrationTest
  SECRETS = {
    "password" => "super-secret-password",
    "token" => "super-secret-token",
    "secret" => "super-secret-secret",
    "api_key" => "super-secret-key"
  }.freeze

  test "request logs do not include passwords, tokens, secrets, or keys" do
    output = StringIO.new
    sink = ActiveSupport::Logger.new(output)
    sink.level = Logger::DEBUG
    Rails.logger.broadcast_to(sink)

    get root_path, params: SECRETS

    logged = output.string
    assert_includes logged, "[FILTERED]"
    SECRETS.each_value do |secret|
      assert_not_includes logged, secret
    end
  ensure
    Rails.logger.stop_broadcasting_to(sink) if sink
  end

  test "sign-in logs do not include the password or the email" do
    sign_out
    output = StringIO.new
    sink = ActiveSupport::Logger.new(output)
    sink.level = Logger::DEBUG
    Rails.logger.broadcast_to(sink)

    post session_path, params: { email_address: "owner@example.com", password: "password-password" }

    logged = output.string
    assert_includes logged, "[FILTERED]"
    assert_not_includes logged, "password-password"
    assert_not_includes logged, "owner@example.com"
  ensure
    Rails.logger.stop_broadcasting_to(sink) if sink
  end
end
