require "test_helper"

class AccountsTest < ActionDispatch::IntegrationTest
  PASSWORD = "password-password"

  test "the account page lists this device and can change the password" do
    get account_path
    assert_response :success
    assert_select "title", "Account · Swatch"
    assert_select "h1", "Account"
    assert_select "h2", "Change password"
    assert_match "Only this device", response.body
    assert_match users(:owner).email_address, response.body

    patch account_password_path, params: {
      current_password: "wrong-password",
      password: "a-brand-new-password",
      password_confirmation: "a-brand-new-password"
    }
    assert_response :unprocessable_entity
    assert_match "Current password is incorrect", response.body
    assert users(:owner).reload.authenticate(PASSWORD)

    patch account_password_path, params: {
      current_password: PASSWORD,
      password: "short",
      password_confirmation: "short"
    }
    assert_response :unprocessable_entity
    assert_match "Password must be at least 15 characters", response.body

    other = users(:owner).sessions.create!(user_agent: "Mozilla/5.0 (Macintosh) Chrome/120.0")
    patch account_password_path, params: {
      current_password: PASSWORD,
      password: "a-brand-new-password",
      password_confirmation: "a-brand-new-password"
    }
    assert_redirected_to account_path
    follow_redirect!
    assert_select "[role=status]", "Password changed"
    assert users(:owner).reload.authenticate("a-brand-new-password")
    assert_not Session.exists?(other.id)
    assert_not_includes response.body, "a-brand-new-password"
  end

  test "password confirmation mismatch and the same password are rejected" do
    patch account_password_path, params: {
      current_password: PASSWORD,
      password: "a-brand-new-password",
      password_confirmation: "a-different-password"
    }
    assert_response :unprocessable_entity
    assert_select "li", text: "Password confirmation doesn't match"

    patch account_password_path, params: {
      current_password: PASSWORD,
      password: PASSWORD,
      password_confirmation: PASSWORD
    }
    assert_response :unprocessable_entity
    assert_match "must be different from the current password", response.body
  end

  test "password changes are rate limited" do
    5.times do
      patch account_password_path, params: { current_password: "wrong-password", password: "a-brand-new-password", password_confirmation: "a-brand-new-password" }
      assert_response :unprocessable_entity
    end

    patch account_password_path, params: { current_password: PASSWORD, password: "a-brand-new-password", password_confirmation: "a-brand-new-password" }
    assert_response :too_many_requests
    assert_equal "900", response.headers["Retry-After"]
    assert_match "Too many attempts", response.body
    assert users(:owner).reload.authenticate(PASSWORD)
  end

  test "email can change and a hostile value is escaped" do
    patch account_email_path, params: { email_address: "owner@example.com", current_password: PASSWORD }
    assert_redirected_to account_path
    follow_redirect!
    assert_select "[role=status]", "That is already your sign-in email."

    patch account_email_path, params: { email_address: "new-owner@example.com", current_password: "wrong-password" }
    assert_response :unprocessable_entity
    assert_match "Current password is incorrect", response.body

    patch account_email_path, params: { email_address: users(:other).email_address, current_password: PASSWORD }
    assert_response :unprocessable_entity
    assert_match "already been taken", response.body

    patch account_email_path, params: { email_address: "new-owner@example.com", current_password: PASSWORD }
    assert_redirected_to account_path
    assert_equal "Sign-in email updated.", flash[:notice]
    assert_not_includes flash[:notice], "new-owner@example.com"
    follow_redirect!
    assert_match "Your sign-in email is new-owner@example.com", response.body
    assert_select "input[name=email_address][value=?]", "new-owner@example.com"
  end

  test "sessions can be signed out and someone else's session is not found" do
    phone = users(:owner).sessions.create!(user_agent: "Mozilla/5.0 (iPhone) Safari/17.0")
    foreign = users(:other).sessions.create!(user_agent: "Mozilla/5.0 (Windows NT 10.0) Firefox/120.0")

    get account_path
    assert_match "Sign out everywhere else", response.body
    assert_match "Sign out Safari on iOS", response.body
    assert_no_match "Firefox on Windows", response.body

    delete account_session_path(phone)
    assert_redirected_to account_path
    assert_not Session.exists?(phone.id)

    delete account_session_path(foreign.id)
    assert_response :not_found
    assert Session.exists?(foreign.id)

    delete account_session_path(current_session_id)
    assert_redirected_to sign_in_path
    follow_redirect!
    assert_select "[role=status]", "You're signed out."
  end

  test "sign out everywhere else keeps this device" do
    other = users(:owner).sessions.create!(user_agent: "Phone")
    delete account_other_sessions_path
    assert_redirected_to account_path
    assert_not Session.exists?(other.id)
    assert Session.exists?(current_session_id)
  end
end
