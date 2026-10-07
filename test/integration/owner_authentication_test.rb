require "test_helper"

class OwnerAuthenticationTest < ActionDispatch::IntegrationTest
  test "the health check stays open without a password" do
    get rails_health_check_path

    assert_response :success
    assert_equal "OK", response.body
  end

  test "missing basic auth is rejected without echoing a password" do
    get root_path

    assert_response :unauthorized
    assert_equal 'Basic realm="Swatch"', response.headers["WWW-Authenticate"]
    assert_equal "Authentication required", response.body
    assert_not_includes response.body, ENV.fetch("OWNER_PASSWORD")
  end

  test "a wrong password is rejected for the api as well" do
    get api_v1_items_path, headers: owner_headers("swatch", "wrong-password")

    assert_response :unauthorized
    assert_not_includes response.body, "wrong-password"
  end

  test "the right password opens the app shell" do
    get "/items/new", headers: owner_headers

    assert_response :success
    assert_select "#root"
  end
end
