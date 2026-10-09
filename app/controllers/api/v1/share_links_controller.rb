module Api
  module V1
    class ShareLinksController < ApplicationController
      include ApiWriteLimit
      include ShareUrl

      limit_api_writes only: %i[create destroy]

      rescue_from ActiveRecord::RecordNotFound do
        render json: { error: "Not found" }, status: :not_found
      end

      rescue_from ActionController::InvalidAuthenticityToken do
        render json: { error: "Invalid authenticity token" }, status: :unprocessable_entity
      end

      def index
        links = Current.user.share_links.includes(:item, :tag)
        links = links.where(item_id: owned_item.id) if params[:item_id].present?
        links = links.where(tag_id: owned_tag.id) if params[:tag_id].present?
        links = filter_status(links).order(created_at: :desc, id: :desc)
        render json: links.map { |link| link.as_api_json(url: share_link_url(link)) }
      end

      def create
        choice = params[:expires_in].presence || "30d"
        unless ShareLink::EXPIRY_CHOICES.key?(choice)
          render json: { errors: { expires_in: [ "is not included in the list" ] } }, status: :unprocessable_entity
          return
        end
        if params[:item_id].present? && params[:tag_id].present?
          render json: { errors: { base: [ "Choose a swatch or a tag" ] } }, status: :unprocessable_entity
          return
        end

        link = Current.user.share_links.new(link_attributes)
        link.expires_at = ShareLink.expiry_time(choice)
        assign_target(link)
        if link.save
          render json: link.as_api_json(url: share_link_url(link)), status: :created
        else
          render json: { errors: link.errors.to_hash, error: link.errors.full_messages.first }, status: :unprocessable_entity
        end
      end

      def destroy
        Current.user.share_links.find(params[:id]).destroy!
        head :no_content
      end

      private
        def filter_status(links)
          case params[:status]
          when "expired" then links.expired
          when "all" then links
          else links.active
          end
        end

        def owned_item
          Current.user.items.find(params[:item_id])
        end

        def owned_tag
          Current.user.tags.find(params[:tag_id])
        end

        def assign_target(link)
          if params[:item_id].present?
            link.item = owned_item
          elsif params[:tag_id].present?
            link.tag = owned_tag
          end
        end

        def link_attributes
          {
            title: params[:title],
            include_notes: boolean_param(:include_notes),
            include_preview_image: boolean_param(:include_preview_image)
          }
        end

        def boolean_param(key)
          ActiveModel::Type::Boolean.new.cast(params[key]) == true
        end
    end
  end
end
