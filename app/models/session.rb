class Session < ApplicationRecord
  IDLE_TIMEOUT = 24.hours
  REMEMBER_FOR = 30.days
  SEEN_EVERY = 5.minutes

  belongs_to :user

  before_validation :set_defaults, on: :create

  def expired?(now = Time.current)
    if remember?
      expires_at.nil? || expires_at <= now
    else
      last_seen_at.nil? || last_seen_at <= now - IDLE_TIMEOUT
    end
  end

  def touch_seen!(now = Time.current)
    return if last_seen_at && last_seen_at > now - SEEN_EVERY

    update_columns(last_seen_at: now)
  end

  def device_label
    agent = user_agent.to_s
    browser = if agent.include?("Edg/")
      "Edge"
    elsif agent.include?("Chrome/")
      "Chrome"
    elsif agent.include?("Firefox/")
      "Firefox"
    elsif agent.include?("Safari/")
      "Safari"
    else
      "Browser"
    end
    system = if agent.include?("Windows")
      "Windows"
    elsif agent.include?("Mac OS") || agent.include?("Macintosh")
      "macOS"
    elsif agent.include?("Android")
      "Android"
    elsif agent.include?("iPhone") || agent.include?("iPad")
      "iOS"
    elsif agent.include?("Linux")
      "Linux"
    else
      "an unknown system"
    end
    "#{browser} on #{system}"
  end

  private
    def set_defaults
      self.last_seen_at ||= Time.current
      self.remember = false if remember.nil?
      self.expires_at ||= remember? ? REMEMBER_FOR.from_now : IDLE_TIMEOUT.from_now
      self.user_agent = user_agent.to_s[0, 255].presence
    end
end
