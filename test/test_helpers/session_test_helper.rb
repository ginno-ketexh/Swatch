module SessionTestHelper
  def sign_in_as(user)
    sign_in_session(user.sessions.create!(user_agent: "Test"))
  end

  def sign_in_session(record)
    Current.session = record

    ActionDispatch::TestRequest.create.cookie_jar.tap do |cookie_jar|
      cookie_jar.signed[:session_id] = record.id
      cookies["session_id"] = cookie_jar[:session_id]
    end
  end

  def sign_out
    Current.session&.destroy!
    cookies.delete("session_id")
  end

  def current_session_id
    raw = cookies["session_id"]
    return if raw.blank?

    request = ActionDispatch::TestRequest.create
    request.set_header("HTTP_COOKIE", "session_id=#{raw}")
    request.cookie_jar.signed[:session_id]
  end
end

ActiveSupport.on_load(:action_dispatch_integration_test) do
  include SessionTestHelper
end
