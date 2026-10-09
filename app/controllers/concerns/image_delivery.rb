module ImageDelivery
  extend ActiveSupport::Concern

  VARIANTS = %w[card card_2x large].freeze

  private
    def deliver_image(attachment, variant_name, cache_max_age:)
      blob = attachment.blob
      if blob.content_type == "image/gif" && variant_name.to_s == "large"
        send_image_object(blob, blob.content_type, cache_max_age)
        return
      end

      processed = attachment.variant(variant_name.to_sym).processed
      type = processed.content_type.presence || "image/webp"
      send_image_object(processed, type, cache_max_age)
    end

    def send_image_object(object, type, cache_max_age)
      response.set_header("Cache-Control", "private, max-age=#{cache_max_age}")
      service = object.try(:service) || object.blob.service
      if Swatch::ImageStorage.remote?(service)
        location = object.url(expires_in: 5.minutes, disposition: :inline)
        redirect_to location, allow_other_host: true
      else
        send_data object.download, type: type, disposition: "inline"
      end
    end

    def image_storage_outage?(error)
      error.class.name.start_with?("Aws::") || error.is_a?(ActiveStorage::Error)
    end
end
