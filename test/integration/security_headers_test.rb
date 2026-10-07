require "test_helper"

class SecurityHeadersTest < ActionDispatch::IntegrationTest
  test "responses deny framing and send a content security policy" do
    get root_path, headers: owner_headers

    assert_response :success
    assert_equal "DENY", response.headers["X-Frame-Options"]

    policy = response.headers["Content-Security-Policy"]
    assert_includes policy, "default-src 'self'"
    assert_includes policy, "frame-ancestors 'none'"
    assert_not_includes policy, "localhost:3036"
  end
end
