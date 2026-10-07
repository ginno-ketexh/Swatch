# Swatch

Swatch is a personal design-inspiration library. This repository is the blank starting point: a home page, a health check, and the wiring to run it locally and on Render. Saving links and images comes in a later milestone.

The plan and where each milestone stands are in [MILESTONES.md](MILESTONES.md).

## Run it locally

You need three things installed:

- Ruby 3.3.6 (the version in `.ruby-version`)
- Node.js 22.14.0 (the version in `.node-version`)
- PostgreSQL 16

The first time, from this folder:

```sh
bin/setup
```

That installs the Ruby and JavaScript dependencies, creates the databases, and starts the app. After that, the one command that starts it is:

```sh
bin/dev
```

Then open http://localhost:3000. You should see “Swatch” and the version number. http://localhost:3000/up should say `OK`.

`bin/dev` starts two processes: the Rails server and the Vite dev server (the thing that builds the React page). Leave that terminal open while you use the app. Ctrl-C stops both.

### PostgreSQL with Docker instead

If you do not want to install PostgreSQL yourself, start only the database with Docker, then tell the app how to reach it.

```sh
docker compose up -d
```

Copy `.env.example` to `.env` and set these three lines (this password is only for the local container):

```sh
POSTGRES_HOST=localhost
POSTGRES_USER=swatch
POSTGRES_PASSWORD=swatch
```

Then run `bin/setup` as above.

## Checks

```sh
bin/rails test
npm test
npm run lint
npm run typecheck
bin/rubocop
bin/brakeman --no-pager
bin/bundler-audit check --update
npm audit --audit-level=high
```

GitHub runs the same checks on every pull request. See `docs/BRANCH_PROTECTION.md` for how to require them before a merge.

## Deploy

See `docs/DEPLOY_RENDER.md`. Production secrets stay on Render. Do not commit `.env` or `config/master.key`.
