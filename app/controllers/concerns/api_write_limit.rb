module ApiWriteLimit
  extend ActiveSupport::Concern

  STORE = ActiveSupport::Cache::MemoryStore.new

  class_methods do
    # Items can be created. Tags can only be renamed or deleted.
    # Pass the actions that exist so Rails does not look for a missing one.
    def limit_api_writes(only:)
      rate_limit to: 30, within: 1.minute,
        only: only,
        store: STORE,
        name: "writes",
        scope: "api-v1",
        with: :render_rate_limited
    end
  end

  private
    def render_rate_limited
      render json: { error: "Too many requests" }, status: :too_many_requests
    end
end
