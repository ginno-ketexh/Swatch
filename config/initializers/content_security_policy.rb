# Be sure to restart your server when you modify this file.
#
# Content Security Policy and clickjacking protection.
# Production serves Vite's compiled files from this same origin, so
# scripts and styles can stay on 'self'. Development also allows the
# Vite dev server (config/vite.json) so hot reload works.
# https://guides.rubyonrails.org/security.html#content-security-policy-header

require "json"

Rails.application.configure do
  config.content_security_policy do |policy|
    policy.default_src :self
    policy.base_uri :self
    policy.font_src :self
    image_sources = [ :self, :data, "blob:" ]
    account_id = ENV["R2_ACCOUNT_ID"].to_s
    if account_id.match?(/\A[A-Za-z0-9]+\z/)
      image_sources << "https://#{account_id}.r2.cloudflarestorage.com"
    end
    policy.img_src(*image_sources)
    policy.object_src :none
    policy.script_src :self
    policy.style_src :self
    policy.connect_src :self
    policy.form_action :self
    # Refuses to be embedded in another site's frame.
    policy.frame_ancestors :none

    if Rails.env.development?
      vite_port = JSON.parse(Rails.root.join("config/vite.json").read).dig("development", "port") || 3036
      vite_http = "http://localhost:#{vite_port}"
      vite_ws = "ws://localhost:#{vite_port}"
      # The Vite client injects a small inline script for React refresh.
      policy.script_src :self, :unsafe_inline, vite_http
      policy.style_src :self, :unsafe_inline, vite_http
      policy.connect_src :self, vite_http, vite_ws
    end
  end
end

# Same protection in every environment, including production.
Rails.application.config.action_dispatch.default_headers["X-Frame-Options"] = "DENY"
