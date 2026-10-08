require "active_storage/service/configurator"
require Rails.root.join("lib/swatch/image_storage")

if Rails.env.production?
  Rails.application.config.active_storage.service = Swatch::ImageStorage.service_name
end

ActiveStorage::Service::Configurator.class_eval do
  private
    def resolve(class_name)
      return ActiveStorage::Service::OffService if class_name.to_s == "Off"

      require "active_storage/service/#{class_name.to_s.underscore}_service"
      ActiveStorage::Service.const_get(:"#{class_name.to_s.camelize}Service")
    rescue LoadError
      raise "Missing service adapter for #{class_name.inspect}"
    end
end

Rails.application.config.after_initialize do
  next unless Rails.env.production?
  next if Swatch::ImageStorage.enabled?

  missing = Swatch::ImageStorage.missing_settings
  Rails.logger.warn("Image uploads are off. Missing settings: #{missing.join(", ")}.")
end
