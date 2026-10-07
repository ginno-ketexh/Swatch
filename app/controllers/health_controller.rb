# Tells the host whether this instance can serve traffic.
#
# The response is only "OK" or "Unavailable". Database errors often include
# the connection URL, so the exception message is never written to the
# response or the log.
class HealthController < ActionController::Base
  def show
    if database_reachable?
      render plain: "OK", status: :ok
    else
      render plain: "Unavailable", status: :service_unavailable
    end
  end

  private
    def database_reachable?
      probe_database
      true
    rescue StandardError
      # The exception text can contain the database URL, so it is not logged.
      Rails.logger.error("Health check failed: database unreachable")
      false
    end

    def probe_database
      ActiveRecord::Base.with_connection do |connection|
        connection.select_value("SELECT 1")
      end
    end
end
