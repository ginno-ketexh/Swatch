# Swatch

Swatch is a personal design-inspiration library. You can save a title, a link, notes, and a colour, then browse them as cards. Image uploads and a public share page come in later milestones.

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

Then open http://localhost:3000. Sign in with the email `owner@example.com` and the password `swatch-dev-password`. That password is only for the sample library on your machine. Do not reuse it on Render.

http://localhost:3000/up should say `OK` and does not ask you to sign in. Render uses that address to check the app.

After you sign in you should see your library. Click a card to read the notes in a side panel, and use **Grid** or **List** to change the layout. Press **?** to see the keyboard shortcuts. If the library is empty, choose **Add your first swatch**, fill in a title, and save. The new card shows up at the top. **Edit** changes it. **Remove** asks you to confirm first.

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

The live site is https://swatch-kr01.onrender.com. Opening it shows the Swatch sign-in page. Adding `/up` to that address says `OK` and does not ask you to sign in.

See `docs/DEPLOY_RENDER.md`. Production secrets stay on Render. Do not commit `.env` or `config/master.key`.
