#!/usr/bin/env bash
# Build script for Render.
#
# The free web service plan cannot run a pre-deploy command, so database
# migrations run here, after the assets compile. If this script fails,
# Render does not switch traffic to the new build.
#
# Paid plans can move the migrate line to render.yaml preDeployCommand
# and delete it from this file. Do not run it in both places.
set -o errexit
set -o pipefail

bundle install
# Vite and Tailwind are dev dependencies. Include them even when
# NODE_ENV=production, or the asset build will fail.
npm ci --include=dev

# Dependencies are already installed above.
export VITE_RUBY_SKIP_ASSETS_PRECOMPILE_INSTALL=true
bundle exec rails assets:precompile
bundle exec rails assets:clean

# Last on purpose: a failure here stops the deploy before the new
# version goes live. See docs/DEPLOY_RENDER.md for the free-plan limit.
bundle exec rails db:migrate

# The owner account already exists, so this does not need OWNER_EMAIL,
# OWNER_PASSWORD, or OWNER_USERNAME. Set OWNER_NEW_PASSWORD only to
# replace a forgotten password. The migration above stops the build,
# and changes nothing, if a swatch or tag still has no owner. Render
# then keeps the previous version live.
bundle exec rails swatch:bootstrap_owner
