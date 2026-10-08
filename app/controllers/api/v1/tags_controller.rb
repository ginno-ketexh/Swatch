module Api
  module V1
    class TagsController < ApplicationController
      include ApiWriteLimit
      limit_api_writes only: %i[update destroy]

      before_action :set_tag, only: %i[update destroy]

      rescue_from ActiveRecord::RecordNotFound do
        render json: { error: "Not found" }, status: :not_found
      end

      rescue_from ActionController::InvalidAuthenticityToken do
        render json: { error: "Invalid authenticity token" }, status: :unprocessable_entity
      end

      rescue_from ActionController::ParameterMissing do
        render json: { errors: { tag: [ "is missing" ] } }, status: :unprocessable_entity
      end

      def index
        rows = Current.user.tags.left_joins(:item_tags)
          .select("tags.*, COUNT(item_tags.id) AS items_count")
          .group("tags.id")
          .order(Arel.sql("lower(tags.name) ASC"))
          .limit(500)

        render json: rows.map { |tag| tag.as_api_json(items_count: tag.items_count.to_i) }
      end

      def update
        if @tag.update(tag_params)
          render json: @tag.as_api_json(items_count: @tag.item_tags.count)
        else
          render json: { errors: @tag.errors.to_hash }, status: :unprocessable_entity
        end
      end

      def destroy
        @tag.destroy!
        head :no_content
      end

      private
        def set_tag
          @tag = Current.user.tags.find(params[:id])
        end

        def tag_params
          params.require(:tag).permit(:name)
        end
    end
  end
end
