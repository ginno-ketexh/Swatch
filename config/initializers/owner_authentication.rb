# Required here because this initializer runs before Zeitwerk is ready to
# load lib/. The files are ignored by the autoloader in config/application.rb.
require Rails.root.join("lib/owner_gate")
require Rails.root.join("lib/owner_authentication_middleware")

# Sits in front of every request, including files in public/, so the
# temporary owner lock covers the whole app except /up.
Rails.application.config.middleware.insert_before 0, OwnerAuthenticationMiddleware
