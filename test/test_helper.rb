ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"
require_relative "test_helpers/session_test_helper"

ActiveModel::SecurePassword.min_cost = true

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    setup do
      AuthRateLimit::STORE.clear
      Api::V1::ItemsController::RATE_LIMIT_STORE.clear
      PublicShareLimit::STORE.clear
      next if is_a?(ActionDispatch::IntegrationTest)

      Current.session = users(:owner).sessions.create!(user_agent: "Test")
    end
  end
end

module ActionDispatch
  class IntegrationTest
    setup do
      sign_in_as(users(:owner))
    end
  end
end
