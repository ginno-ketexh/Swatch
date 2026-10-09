module Api
  module V1
    class ItemImagesController < ApplicationController
      include ApiWriteLimit
      include ImageDelivery

      limit_api_writes only: %i[update update_alt destroy]

      rate_limit to: 10, within: 1.minute,
        only: :update,
        store: ApiWriteLimit::STORE,
        name: "uploads",
        scope: "api-v1",
        by: -> { Current.user.id },
        with: :render_upload_limited

      rate_limit to: 600, within: 1.minute,
        only: :show,
        store: ApiWriteLimit::STORE,
        name: "image-reads",
        scope: "api-v1",
        by: -> { Current.user.id },
        with: :render_rate_limited

      before_action :set_item
      before_action :require_storage!, except: :show

      rescue_from ActiveRecord::RecordNotFound do
        render json: { error: "Not found" }, status: :not_found
      end

      rescue_from ActionController::InvalidAuthenticityToken do
        render json: { error: "Invalid authenticity token" }, status: :unprocessable_entity
      end

      rescue_from ImageIngest::Reject do |error|
        render json: { errors: { image: [ error.message ] } }, status: :unprocessable_entity
      end

      def show
        unless Swatch::ImageStorage.enabled?
          render json: { error: "Image uploads aren't set up yet" }, status: :service_unavailable
          return
        end
        return missing unless @item.image.attached?
        return missing unless VARIANTS.include?(params[:variant])

        deliver_image(@item.image, params[:variant], cache_max_age: 240)
      rescue Swatch::ImageStorage::Unavailable, Vips::Error, ActiveStorage::InvariableError
        unavailable
      rescue StandardError => error
        raise unless storage_outage?(error)

        unavailable
      end

      def update
        alt = params[:alt].to_s
        if alt.length > 250
          render json: { errors: { alt: [ "Description is too long (maximum is 250 characters)" ] } }, status: :unprocessable_entity
          return
        end

        result = ImageIngest.call!(params[:image], item: @item)
        previous = @item.image.blob if @item.image.attached?
        Item.transaction do
          @item.update!(image_alt: alt.strip.presence)
          @item.image.attach(result.to_attachable)
        end
        previous.purge if previous && previous.id != @item.reload.image.blob.id
        render json: @item.as_api_json
      rescue Swatch::ImageStorage::Unavailable
        unavailable
      rescue StandardError => error
        raise unless storage_outage?(error)

        unavailable
      end

      def update_alt
        unless @item.image.attached?
          render json: { errors: { alt: [ "Add an image before describing it" ] } }, status: :unprocessable_entity
          return
        end

        alt = params[:alt].to_s
        if alt.length > 250
          render json: { errors: { alt: [ "Description is too long (maximum is 250 characters)" ] } }, status: :unprocessable_entity
          return
        end

        @item.update!(image_alt: alt.strip.presence)
        render json: @item.as_api_json
      end

      def destroy
        unless @item.image.attached?
          render json: { error: "Image already removed" }, status: :not_found
          return
        end

        @item.image.purge
        @item.update!(image_alt: nil)
        head :no_content
      end

      private
        def set_item
          @item = Current.user.items.with_attached_image.preload(:tags).find(params[:item_id])
        end

        def require_storage!
          return if Swatch::ImageStorage.enabled?

          render json: { error: "Image uploads aren't set up yet" }, status: :service_unavailable
        end

        def missing
          render json: { error: "Not found" }, status: :not_found
        end

        def unavailable
          render json: { error: "The image store is unavailable. Try again in a moment." }, status: :service_unavailable
        end

        def render_upload_limited
          render json: { error: "Too many uploads. Wait a minute and try again." }, status: :too_many_requests
        end

        def storage_outage?(error)
          image_storage_outage?(error)
        end
    end
  end
end
