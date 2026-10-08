Rails.application.routes.draw do
  # Health check for Render. 200 only when the app and the database
  # both respond. See HealthController.
  get "up" => "health#show", as: :rails_health_check

  get "sign-in", to: "sessions#new", as: :sign_in
  post "session", to: "sessions#create", as: :session
  delete "session", to: "sessions#destroy"

  get "account", to: "accounts#show", as: :account
  patch "account/password", to: "accounts#update_password", as: :account_password
  patch "account/email", to: "accounts#update_email", as: :account_email
  delete "account/sessions/others", to: "accounts#destroy_other_sessions", as: :account_other_sessions
  delete "account/sessions/:id", to: "accounts#destroy_session", as: :account_session

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  namespace :api do
    namespace :v1 do
      resources :items, only: %i[index show create update destroy]
      resources :tags, only: %i[index update destroy]
    end
  end

  # The React router owns these URLs. A refresh or a pasted link still
  # has to reach the same HTML shell, behind the owner login.
  root "home#index"
  get "tags", to: "home#index"
  get "items/new", to: "home#index"
  get "items/:id/edit", to: "home#index", constraints: { id: /\d+/ }
  get "items/:id", to: "home#index", constraints: { id: /\d+/ }
end
