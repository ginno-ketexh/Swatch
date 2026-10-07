class OwnerGate
  def self.allow?(request, env: ENV, rails_env: Rails.env)
    if !production?(rails_env) && env["OWNER_AUTH_DISABLED"] == "1"
      return true
    end

    username, password = credentials(env, rails_env)
    return false if username.to_s.empty? || password.to_s.empty?

    given_user, given_password = ActionController::HttpAuthentication::Basic.user_name_and_password(request)
    secure_match?(given_user, username) && secure_match?(given_password, password)
  end

  def self.credentials(env, rails_env)
    if production?(rails_env)
      [ env["OWNER_USERNAME"], env["OWNER_PASSWORD"] ]
    else
      [ env.fetch("OWNER_USERNAME", "swatch"), env.fetch("OWNER_PASSWORD", "swatch") ]
    end
  end

  def self.secure_match?(given, expected)
    return false if given.nil? || expected.nil?

    ActiveSupport::SecurityUtils.secure_compare(
      Digest::SHA256.hexdigest(given.to_s),
      Digest::SHA256.hexdigest(expected.to_s)
    )
  end

  def self.production?(rails_env)
    rails_env.to_s == "production"
  end
end
