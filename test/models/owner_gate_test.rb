require "test_helper"

class OwnerGateTest < ActiveSupport::TestCase
  test "matches the owner and rejects a wrong password" do
    env = { "OWNER_USERNAME" => "ada", "OWNER_PASSWORD" => "correct-horse" }

    assert OwnerGate.allow?(request_as("ada", "correct-horse"), env: env, rails_env: "test")
    assert_not OwnerGate.allow?(request_as("ada", "nope"), env: env, rails_env: "test")
    assert_not OwnerGate.allow?(request_as(nil, nil), env: env, rails_env: "test")
  end

  test "development can bypass the lock and production cannot" do
    env = { "OWNER_AUTH_DISABLED" => "1" }
    request = request_as(nil, nil)

    assert OwnerGate.allow?(request, env: env, rails_env: "development")
    assert_not OwnerGate.allow?(request, env: env, rails_env: "production")
  end

  test "production does not fall back to the local default password" do
    request = request_as("swatch", "swatch")

    assert_not OwnerGate.allow?(request, env: {}, rails_env: "production")
  end

  private
    def request_as(username, password)
      authorization = if username.nil? && password.nil?
        nil
      else
        ActionController::HttpAuthentication::Basic.encode_credentials(username.to_s, password.to_s)
      end
      Struct.new(:authorization).new(authorization)
    end
end
