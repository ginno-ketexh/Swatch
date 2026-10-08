# Stops production from booting when a required setting is missing, with a
# message that says what to set. Development and test do not use this.

module Swatch
  module ProductionEnv
    def self.missing_settings(env, credentials_present:)
      missing = []
      missing << "DATABASE_URL" if env["DATABASE_URL"].to_s.strip.empty?

      has_secret_key = !env["SECRET_KEY_BASE"].to_s.strip.empty?
      has_master_key = !env["RAILS_MASTER_KEY"].to_s.strip.empty? && credentials_present
      unless has_secret_key || has_master_key
        missing << "SECRET_KEY_BASE (or RAILS_MASTER_KEY, once config/credentials.yml.enc exists)"
      end

      # Booting does not read OWNER_EMAIL, OWNER_PASSWORD, or OWNER_USERNAME.
      # Once an owner account exists, the build does not need them either.
      missing
    end

    def self.failure_message(missing)
      <<~MSG

        Swatch cannot boot in production.
        Missing required settings: #{missing.join(", ")}.
        Set them as environment variables on Render. See docs/DEPLOY_RENDER.md.
        Do not commit secret values to the repository.

      MSG
    end
  end
end

if Rails.env.production?
  missing = Swatch::ProductionEnv.missing_settings(
    ENV,
    credentials_present: Rails.root.join("config/credentials.yml.enc").exist?
  )
  abort Swatch::ProductionEnv.failure_message(missing) if missing.any?
end
