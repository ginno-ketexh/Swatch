# Swatch

Swatch is a personal design-inspiration library. You can save a title, a link, notes, and a colour, then browse them as cards. Search, accounts, and image uploads come in later milestones.

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

Then open http://localhost:3000. The browser asks you to sign in. Locally the name and password are both `swatch`, unless you set `OWNER_USERNAME` and `OWNER_PASSWORD` in `.env`. Those two values are only for your machine. Do not reuse them on Render.

http://localhost:3000/up should say `OK` and does not ask for a password. Render uses that address to check the app.

After you sign in you should see your library. If it is empty, choose **Add your first swatch**, fill in a title, and save. The new card shows up at the top. **Edit** changes it. **Remove** asks you to confirm first.

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

The live site is https://swatch-kr01.onrender.com. Opening it asks for the owner sign-in. Adding `/up` to that address says `OK` and does not ask for a password.

See `docs/DEPLOY_RENDER.md`. Production secrets stay on Render. Do not commit `.env` or `config/master.key`.
