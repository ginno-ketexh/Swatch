require "test_helper"

class AuthenticationTest < ActionDispatch::IntegrationTest
  include ActiveSupport::Testing::TimeHelpers

  PASSWORD = "password-password"

  test "sign in and sign out" do
    sign_out

    get sign_in_path
    assert_response :success
    assert_select "title", "Sign in · Swatch"
    assert_select "label", "Email"
    assert_select "input[type=email][autocomplete=username]"
    assert_select "input[autocomplete=current-password]"
    assert_select "button", "Show password"

    post session_path, params: { email_address: "  Owner@Example.com ", password: PASSWORD }
    assert_redirected_to "/"

    follow_redirect!
    assert_response :success
    assert_select "#root[data-email=?]", "owner@example.com"

    delete session_path
    assert_redirected_to sign_in_path
    follow_redirect!
    assert_select "[role=status]", "You're signed out."
    assert_select "input[type=password]"
  end

  test "a wrong password and an unknown email look the same" do
    sign_out
    post session_path, params: { email_address: "missing@example.com", password: "not-the-password" }
    unknown = response.body
    assert_response :unprocessable_entity

    AuthRateLimit::STORE.clear
    post session_path, params: { email_address: users(:owner).email_address, password: "not-the-password" }
    assert_response :unprocessable_entity
    assert_equal comparable_page(unknown).gsub("missing@example.com", "EMAIL"),
      comparable_page(response.body).gsub("owner@example.com", "EMAIL")
    assert_select "#sign-in-error", text: /don't match/
    assert_select "input[type=email][value=?]", "owner@example.com"
    assert_select "input[type=password][value]", count: 0
  end

  test "empty and oversized passwords do not sign in" do
    sign_out
    post session_path, params: { email_address: users(:owner).email_address, password: "" }
    assert_response :unprocessable_entity
    assert_select "#sign-in-error", text: /don't match/

    AuthRateLimit::STORE.clear
    post session_path, params: { email_address: users(:owner).email_address, password: "a" * 73 }
    assert_response :unprocessable_entity
    assert_select "#sign-in-error", text: /don't match/
  end

  test "sign in is rate limited by email and by address" do
    sign_out
    5.times do
      post session_path, params: { email_address: "owner@example.com", password: "wrong-password" }
      assert_response :unprocessable_entity
    end
    post session_path, params: { email_address: "owner@example.com", password: "wrong-password" }
    assert_response :too_many_requests
    assert_equal "900", response.headers["Retry-After"]
    assert_match "Too many attempts. Wait a few minutes and try again.", response.body

    AuthRateLimit::STORE.clear
    10.times do |index|
      post session_path, params: { email_address: "person#{index}@example.com", password: "wrong-password" }
      assert_response :unprocessable_entity
    end
    post session_path, params: { email_address: "someone-else@example.com", password: "wrong-password" }
    assert_response :too_many_requests
    assert_equal "180", response.headers["Retry-After"]
  end

  test "sign in rotates the session and a second device stays signed in" do
    other = users(:owner).sessions.create!(user_agent: "Phone")
    old_id = current_session_id

    post session_path, params: { email_address: users(:owner).email_address, password: PASSWORD, remember: "0" }
    assert_redirected_to "/"
    assert_not_equal old_id, current_session_id
    assert_not Session.exists?(old_id)
    assert Session.exists?(other.id)

    cookie = Array(response.headers["Set-Cookie"]).join("\n")
    session_cookie = cookie.lines.grep(/session_id/).join
    assert_no_match(/expires=/i, session_cookie)

    AuthRateLimit::STORE.clear
    post session_path, params: { email_address: users(:owner).email_address, password: PASSWORD, remember: "1" }
    remembered = Array(response.headers["Set-Cookie"]).join("\n").lines.grep(/session_id/).join
    assert_match(/expires=/i, remembered)
  end

  test "return_to stays on this site" do
    sign_out
    [ "//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/sign-in" ].each do |target|
      AuthRateLimit::STORE.clear
      post session_path, params: {
        email_address: users(:owner).email_address,
        password: PASSWORD,
        return_to: target
      }
      assert_redirected_to "/"
    end

    AuthRateLimit::STORE.clear
    post session_path, params: {
      email_address: users(:owner).email_address,
      password: PASSWORD,
      return_to: "/tags?view=list"
    }
    assert_redirected_to "/tags?view=list"
  end

  test "an expired or tampered cookie signs you out" do
    expired = users(:owner).sessions.create!(remember: false, last_seen_at: 25.hours.ago)
    sign_in_session(expired)
    get root_path
    assert_response :found
    assert_redirected_to sign_in_path(return_to: "/")
    assert_not Session.exists?(expired.id)

    cookies["session_id"] = "tampered"
    get root_path
    assert_response :found
  end

  test "last seen is not written on every request" do
    record = users(:owner).sessions.create!(user_agent: "Test", last_seen_at: Time.current)
    sign_in_session(record)
    stamp = record.reload.last_seen_at

    get root_path
    assert_equal stamp.to_i, record.reload.last_seen_at.to_i

    travel 6.minutes
    get root_path
    assert_operator record.reload.last_seen_at, :>, stamp
  end

  test "signed out pages redirect and the api says sign in required" do
    sign_out
    item = Item.create!(title: "Hidden", user: users(:owner))

    {
      "/" => "/",
      "/tags" => "/tags",
      "/items/new" => "/items/new",
      "/items/#{item.id}" => "/items/#{item.id}",
      "/items/#{item.id}/edit" => "/items/#{item.id}/edit",
      "/account" => "/account"
    }.each do |path, return_to|
      get path
      assert_response :found, path
      assert_redirected_to sign_in_path(return_to: return_to)
    end

    get "/items/#{item.id}?view=list&tags=brand"
    assert_redirected_to sign_in_path(return_to: "/items/#{item.id}?view=list&tags=brand")

    get api_v1_items_path
    assert_response :unauthorized
    assert_equal({ "error" => "Sign in required" }, response.parsed_body)
    assert_equal "no-store", response.headers["Cache-Control"]

    get api_v1_tags_path
    assert_response :unauthorized
    post api_v1_items_path, params: { item: { title: "Nope" } }, as: :json
    assert_response :unauthorized
    assert_not Item.exists?(title: "Nope")

    get rails_health_check_path
    assert_response :success
    assert_equal "OK", response.body
  end

  test "there is no sign up" do
    get "/sign-up"
    assert_response :not_found

    post "/users"
    assert_response :not_found
  end

  test "sign in sign out and account forms require a csrf token" do
    with_forgery_protection do
      sign_out
      post session_path, params: { email_address: users(:owner).email_address, password: PASSWORD }
      assert_response :unprocessable_entity

      get sign_in_path
      token = css_select('meta[name="csrf-token"]').first["content"]
      post session_path, params: {
        email_address: users(:owner).email_address,
        password: PASSWORD,
        authenticity_token: token
      }
      assert_redirected_to "/"

      delete session_path
      assert_response :unprocessable_entity
      get root_path
      token = css_select('meta[name="csrf-token"]').first["content"]
      delete session_path, params: { authenticity_token: token }
      assert_redirected_to sign_in_path
    end
  end

  test "a signed in visit to the sign in page goes to the return path" do
    get sign_in_path(return_to: "/tags")
    assert_redirected_to "/tags"
  end

  private
    def comparable_page(body)
      body.gsub(/name="authenticity_token" value="[^"]+"/, "TOKEN")
    end

    def with_forgery_protection
      previous = ActionController::Base.allow_forgery_protection
      ActionController::Base.allow_forgery_protection = true
      yield
    ensure
      ActionController::Base.allow_forgery_protection = previous
    end
end
