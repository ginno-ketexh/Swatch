module Api
  module V1
    class ItemsController < ApplicationController
      RATE_LIMIT_STORE = ActiveSupport::Cache::MemoryStore.new

      rate_limit to: 30, within: 1.minute,
        only: %i[create update destroy],
        store: RATE_LIMIT_STORE,
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
        per_page = page_size
        scope = Item.order(created_at: :desc, id: :desc)

        if params[:cursor].present?
          decoded = ItemCursor.decode(params[:cursor])
          unless decoded
            render json: { errors: { cursor: [ "is invalid" ] } }, status: :unprocessable_entity
            return
          end

          created_at, id = decoded
          scope = scope.where("(items.created_at, items.id) < (?, ?)", created_at, id)
        end

        rows = scope.limit(per_page + 1).to_a
        page = rows.first(per_page)
        next_cursor = rows.size > per_page ? ItemCursor.encode(page.last) : nil

        render json: { items: page.map(&:as_api_json), next_cursor: next_cursor }
      end

      def show
        render json: @item.as_api_json
      end

      def create
        item = Item.new(item_params)
        if item.save
          render json: item.as_api_json, status: :created
        else
          render json: { errors: item.errors.to_hash }, status: :unprocessable_entity
        end
      end

      def update
        if @item.update(item_params)
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
          @item = Item.find(params[:id])
        end

        def item_params
          params.require(:item).permit(:title, :source_url, :notes, :color)
        end

        def page_size
          raw = params[:per_page].presence
          return 20 if raw.nil?

          value = Integer(raw, 10)
          return 20 if value <= 0

          [ value, 50 ].min
        rescue ArgumentError, TypeError
          20
        end

        def render_rate_limited
          render json: { error: "Too many requests" }, status: :too_many_requests
        end
    end
  end
end
