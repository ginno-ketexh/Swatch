module Authentication
  extend ActiveSupport::Concern

  included do
    before_action :require_authentication
    helper_method :authenticated?
  end

  class_methods do
    def allow_unauthenticated_access(**options)
      skip_before_action :require_authentication, **options
    end
  end

  private
    def authenticated?
      resume_session
    end

    def require_authentication
      resume_session || request_authentication
    end

    def resume_session
      Current.session ||= find_session_by_cookie
    end

    def find_session_by_cookie
      session_id = cookies.signed[:session_id]
      return if session_id.blank?

      record = Session.find_by(id: session_id)
      if record.nil?
        cookies.delete(:session_id)
        return
      end

      if record.expired?
        record.destroy
        cookies.delete(:session_id)
        return
      end

      record.touch_seen!
      record
    end

    def request_authentication
      if api_request?
        render json: { error: "Sign in required" }, status: :unauthorized
        response.headers["Cache-Control"] = "no-store"
        return
      end

      redirect_to sign_in_path(return_to: ReturnTo.sanitize(request.fullpath)), status: :found
    end

    def api_request?
      request.path.start_with?("/api/") || request.format.json?
    end

    def start_new_session_for(user, remember:)
      previous_id = cookies.signed[:session_id]
      reset_session
      Session.where(id: previous_id).delete_all if previous_id.present?
      user.sessions.where(remember: true).where(expires_at: ..Time.current).delete_all
      user.sessions.where(remember: false).where(last_seen_at: ..24.hours.ago).delete_all

      record = user.sessions.create!(
        ip_address: request.remote_ip,
        user_agent: request.user_agent.to_s[0, 255].presence,
        remember: remember,
        last_seen_at: Time.current,
        expires_at: remember ? 30.days.from_now : 24.hours.from_now
      )
      Current.session = record
      cookie = {
        value: record.id,
        httponly: true,
        same_site: :lax,
        secure: Rails.env.production?
      }
      cookie[:expires] = 30.days.from_now if remember
      cookies.signed[:session_id] = cookie
      record
    end

    def terminate_session
      Current.session&.destroy
      cookies.delete(:session_id)
      reset_session
      Current.session = nil
    end
end
