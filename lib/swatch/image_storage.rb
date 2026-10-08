module Swatch
  module ImageStorage
    SETTINGS = %w[R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET].freeze
    BUDGET_BYTES = 2 * 1024 * 1024 * 1024

    class Unavailable < StandardError; end

    def self.enabled?(env = ENV, rails_env: Rails.env)
      return true unless rails_env.to_s == "production"

      missing_settings(env).empty?
    end

    def self.missing_settings(env = ENV)
      SETTINGS.select { |name| env[name].to_s.strip.empty? }
    end

    # Production uses R2 when the four settings are present, and a service
    # that refuses to store files when they are not. Development and test
    # stay on Disk. Production never uses Disk: Render wipes that disk.
    def self.service_name(env = ENV, rails_env: Rails.env)
      case rails_env.to_s
      when "test" then :test
      when "development" then :local
      else
        enabled?(env, rails_env: rails_env) ? :r2 : :off
      end
    end

    def self.r2_configuration(env = ENV)
      account = env["R2_ACCOUNT_ID"].to_s.gsub(/[^A-Za-z0-9]/, "")
      {
        service: "S3",
        access_key_id: env["R2_ACCESS_KEY_ID"].to_s,
        secret_access_key: env["R2_SECRET_ACCESS_KEY"].to_s,
        region: "auto",
        bucket: env["R2_BUCKET"].to_s,
        endpoint: "https://#{account}.r2.cloudflarestorage.com",
        force_path_style: true,
        request_checksum_calculation: "when_required",
        response_checksum_validation: "when_required"
      }
    end

    def self.bytes_used(user)
      ActiveStorage::Blob
        .joins(:attachments)
        .where(
          active_storage_attachments: {
            record_type: "Item",
            name: "image",
            record_id: user.items.select(:id)
          }
        )
        .sum(:byte_size)
    end

    def self.usage_label(user)
      megabytes = (bytes_used(user) / 1_048_576.0).round
      "Images: #{megabytes} MB of 2 GB used"
    end

    def self.remote?(service)
      service.class.name == "ActiveStorage::Service::S3Service"
    end
  end
end
