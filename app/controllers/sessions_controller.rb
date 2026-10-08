class SessionsController < ApplicationController
  layout "auth"

  allow_unauthenticated_access only: %i[new create]

  rate_limit to: 10, within: 3.minutes, only: :create,
    store: AuthRateLimit::STORE,
    name: "sign-in-ip",
    scope: "sign-in",
    with: :render_ip_limited

  rate_limit to: 5, within: 15.minutes, only: :create,
    store: AuthRateLimit::STORE,
    name: "sign-in-email",
    scope: "sign-in",
    by: :sign_in_email_key,
    with: :render_email_limited

  def new
    if authenticated?
      redirect_to ReturnTo.sanitize(params[:return_to]), status: :see_other
      return
    end

    @email_address = ""
    @return_to = ReturnTo.sanitize(params[:return_to])
  end

  def create
    @return_to = ReturnTo.sanitize(params[:return_to])
    @email_address = normalized_email
    password = params[:password].to_s

    if password.empty? || password.bytesize > 72
      render_sign_in_failure
      return
    end

    user = User.authenticate_by(email_address: @email_address, password: password)
    if user
      start_new_session_for(user, remember: ActiveModel::Type::Boolean.new.cast(params[:remember]))
      redirect_to @return_to, status: :see_other
    else
      render_sign_in_failure
    end
  end

  def destroy
    terminate_session
    redirect_to sign_in_path, notice: "You're signed out.", status: :see_other
  end

  private
    def normalized_email
      params[:email_address].to_s.unicode_normalize(:nfc).strip.downcase[0, 254]
    end

    def sign_in_email_key
      normalized_email
    end

    def render_sign_in_failure
      @alert = "That email and password don't match. Try again."
      render :new, status: :unprocessable_entity
    end

    def render_ip_limited
      render_limited("180")
    end

    def render_email_limited
      render_limited("900")
    end

    def render_limited(retry_after)
      response.set_header("Retry-After", retry_after)
      @email_address = normalized_email
      @return_to = ReturnTo.sanitize(params[:return_to])
      @alert = "Too many attempts. Wait a few minutes and try again."
      render :new, status: :too_many_requests
    end
end
