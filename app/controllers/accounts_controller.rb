class AccountsController < ApplicationController
  layout "auth"

  rate_limit to: 5, within: 15.minutes, only: :update_password,
    store: AuthRateLimit::STORE,
    name: "password-changes",
    scope: "account",
    by: -> { Current.user&.id },
    with: :render_password_limited

  def show
    load_sessions
  end

  def update_password
    current_password = params[:current_password].to_s
    unless Current.user.authenticate(current_password)
      fail_password("Current password is incorrect")
      return
    end

    new_password = params[:password].to_s
    confirmation = params[:password_confirmation].to_s
    errors = password_errors(new_password, confirmation)
    if errors.any?
      fail_password("Check the password fields and try again.", errors)
      return
    end

    user = Current.user
    user.password = new_password
    user.password_confirmation = confirmation
    unless user.save
      fail_password("Check the password fields and try again.", user.errors[:password] + user.errors[:password_confirmation])
      return
    end

    remembered = Current.session.remember?
    user.sessions.where.not(id: Current.session.id).delete_all
    start_new_session_for(user, remember: remembered)
    redirect_to account_path, notice: "Password changed", status: :see_other
  end

  def update_email
    unless Current.user.authenticate(params[:current_password].to_s)
      fail_email("Current password is incorrect")
      return
    end

    proposed = params[:email_address].to_s
    normalized = proposed.unicode_normalize(:nfc).strip.downcase
    if normalized == Current.user.email_address
      redirect_to account_path, notice: "That is already your sign-in email.", status: :see_other
      return
    end

    unless Current.user.update(email_address: proposed)
      fail_email("Check the email field and try again.", Current.user.errors[:email_address])
      return
    end

    redirect_to account_path, notice: "Sign-in email updated.", status: :see_other
  end

  def destroy_other_sessions
    Current.user.sessions.where.not(id: Current.session.id).delete_all
    redirect_to account_path, notice: "Signed out of the other devices.", status: :see_other
  end

  def destroy_session
    record = Current.user.sessions.find(params[:id])
    if record.id == Current.session.id
      terminate_session
      redirect_to sign_in_path, notice: "You're signed out.", status: :see_other
    else
      record.destroy!
      redirect_to account_path, notice: "Signed out of that device.", status: :see_other
    end
  end

  private
    def load_sessions
      @sessions = Current.user.sessions.order(last_seen_at: :desc).limit(50)
    end

    def password_errors(new_password, confirmation)
      errors = []
      errors << "Password must be at least 15 characters" if new_password.length < 15
      errors << "Password is too long" if new_password.bytesize > 72
      errors << "Password confirmation doesn't match" unless new_password == confirmation
      if errors.empty? && Current.user.authenticate(new_password)
        errors << "Password must be different from the current password"
      end
      errors
    end

    def fail_password(message, errors = [])
      @password_alert = message
      @password_errors = errors
      load_sessions
      render :show, status: :unprocessable_entity
    end

    def fail_email(message, errors = [])
      @email_alert = message
      @email_errors = errors
      @email_address = params[:email_address].to_s
      load_sessions
      render :show, status: :unprocessable_entity
    end

    def render_password_limited
      response.set_header("Retry-After", "900")
      @password_alert = "Too many attempts. Wait a few minutes and try again."
      @password_errors = []
      load_sessions
      render :show, status: :too_many_requests
    end
end
