# Shown on the home page so a deployed copy can be told apart from another.
# Bump the VERSION file at the repository root when a milestone ships.

module Swatch
  VERSION = Rails.root.join("VERSION").read.strip.freeze
end
