module Api
  module V1
    class ItemsController < ApplicationController
      include ApiWriteLimit
      limit_api_writes only: %i[create update destroy]

      # The write budget lives on the shared store so tag edits count too.
      # Tests clear this constant. Keep it pointed at that same store.
      RATE_LIMIT_STORE = ApiWriteLimit::STORE

      rate_limit to: 120, within: 1.minute,
        only: :index,
        store: RATE_LIMIT_STORE,
        name: "item-reads",
        scope: "api-v1",
        with: :render_rate_limited

      before_action :set_item, only: %i[show update destroy]

      rescue_from ActiveRecord::RecordNotFound do
        render json: { error: "Not found" }, status: :not_found
      end

      rescue_from ActionController::InvalidAuthenticityToken do
        render json: { error: "Invalid authenticity token" }, status: :unprocessable_entity
      end

      rescue_from ActionController::ParameterMissing do
        render json: { errors: { item: [ "is missing" ] } }, status: :unprocessable_entity
      end

      def index
        result = LibraryQuery.new(
          params,
          items: Current.user.items,
          tags: Current.user.tags,
          user_id: Current.user.id
        ).call
        if result.error
          render json: { errors: result.error }, status: :unprocessable_entity
          return
        end

        render json: {
          items: result.items.map(&:as_api_json),
          next_cursor: result.next_cursor,
          total_count: result.total_count,
          ignored_tags: result.ignored_tags
        }
      end

      def show
        render json: @item.as_api_json
      end

      def create
        item = Current.user.items.new(item_params)
        saved = false
        Item.transaction do
          if tag_names_sent? && !item.replace_tag_names(tag_names_param)
            raise ActiveRecord::Rollback
          end
          saved = item.save
          raise ActiveRecord::Rollback unless saved
        end

        if saved
          render json: item.as_api_json, status: :created
        else
          render json: { errors: item.errors.to_hash }, status: :unprocessable_entity
        end
      end

      def update
        saved = false
        Item.transaction do
          if tag_names_sent? && !@item.replace_tag_names(tag_names_param)
            raise ActiveRecord::Rollback
          end
          saved = @item.update(item_params)
          raise ActiveRecord::Rollback unless saved
        end

        if saved
          render json: @item.as_api_json
        else
          render json: { errors: @item.errors.to_hash }, status: :unprocessable_entity
        end
      end

      def destroy
        @item.destroy!
        head :no_content
      end

      private
        def set_item
          @item = Current.user.items.with_attached_image.preload(:tags).find(params[:id])
        end

        def item_params
          params.require(:item).permit(:title, :source_url, :notes, :color)
        end

        def tag_names_sent?
          params[:item].key?(:tag_names)
        end

        def tag_names_param
          Array(params[:item][:tag_names])
        end
    end
  end
end
