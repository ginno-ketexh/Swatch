# Deploy Swatch on Render

This puts the app on the internet when `main` changes. You do it once in the Render website. After that, merging a pull request into `main` deploys a new version by itself.

The site will use HTTPS. Render provides the certificate. The app also redirects any plain HTTP visit to HTTPS.

## Before you start

You need a Render account and permission for Render to see the GitHub repository `ginno-ketexh/Swatch`.

You also need a secret the app uses to sign cookies. It must not be committed. On your own machine, in this project folder, run:

```sh
bin/rails secret
```

Copy the long string it prints. You will paste it into Render in a moment. Do not put it in a file in this repository, and do not paste it into the pull request.

## Apply the Blueprint

1. Sign in at [render.com](https://render.com).
2. Connect GitHub if Render asks you to. Grant access to the Swatch repository.
3. In the dashboard, open **Blueprints** and choose **New Blueprint Instance**.
4. Select the Swatch repository. Render reads `render.yaml` from the `main` branch.
5. Render will ask for one secret you generate. Do not put it in the repository.
   - `SECRET_KEY_BASE`: paste the string from `bin/rails secret`.
   Leave the other values as the file sets them. `DATABASE_URL` is filled in from the database Render creates. You do not type a database password. The owner account already exists, so the build does not ask for `OWNER_EMAIL`, `OWNER_PASSWORD`, or `OWNER_USERNAME`.
6. Approve the Blueprint.

Render then creates:

- a **free web service** named `swatch`
- a **free PostgreSQL database** named `swatch-db`

The first deploy takes a few minutes. When it finishes, Render shows a URL that ends in `.onrender.com`.

## Check that it is alive

1. Open the `.onrender.com` URL. You should see the Swatch sign-in page. Sign in with the email and password you already use. After that you should see your library.
2. Open the same URL with `/up` on the end, for example `https://swatch.onrender.com/up`. The page should say `OK` and nothing else. This address does not ask you to sign in, so Render can check the app without knowing your password.

If `/up` says `Unavailable`, the app started but cannot reach the database. Check that the Blueprint created `swatch-db` and that `DATABASE_URL` is listed on the web service.

## What happens on later merges

`render.yaml` sets `branch: main` and `autoDeployTrigger: commit`. Every push or merge to `main` starts a new deploy.

The build script `bin/render-build.sh` installs dependencies, builds the page assets, and then runs database migrations.

Migrations are in the build script because **the free plan cannot run a pre-deploy command**. Render’s `preDeployCommand` only works on paid compute plans. A paid plan is the better place for migrations: it runs them after the build and before traffic moves, and a failed migration cancels the deploy with the database change still in that step. On the free plan we run `db:migrate` as the last line of the build instead. If that line fails, the build fails and the previous version stays live.

One free-plan limit to know: if the migration succeeds and the new version then fails its `/up` check, Render keeps the previous version serving traffic, but the database migration has already run. Keep migrations backward compatible with the version that is still live.

When you move to a paid web service, delete the `db:migrate` line from `bin/render-build.sh` and set `preDeployCommand: bundle exec rails db:migrate` in `render.yaml`. Do not do both.

## If a deploy fails

Render keeps the last successful version running. The site does not go blank just because a new build failed. Read the deploy log, fix the problem in a new pull request, and merge again.

A deploy also fails fast, with a plain message, if `DATABASE_URL` or `SECRET_KEY_BASE` is missing. The message names the missing setting and does not print secret values.

The build also stops, before the new version goes live, if a swatch or tag still has no owner. The log says how many. No rows are changed or deleted. The previous version stays up.

Once an owner account exists, the build does not need `OWNER_EMAIL`, `OWNER_PASSWORD`, or `OWNER_USERNAME`. Leave them unset. See the next section.

`RAILS_MASTER_KEY` is the other way to supply the cookie secret, but only after you create encrypted credentials with `bin/rails credentials:edit`. This milestone does not commit a master key or a credentials file. Use `SECRET_KEY_BASE`.

## Free-plan limits

- The free web service **sleeps after about 15 minutes** with no visitors. The next visit wakes it up and can take half a minute or so. `/up` is how Render knows it woke up healthy.
- The free service has little memory (512 MB). The Blueprint sets one Puma process (`WEB_CONCURRENCY=1`) so it does not run out of memory on boot.
- The free database **expires 30 days** after you create it. You then have about 14 days to upgrade it to a paid plan. After that grace period, Render deletes the database and everything in it. There are no backups on the free database, and storage is capped (1 GB). Fine for learning. Not a place to keep a library you care about.
- Free web services have an ephemeral disk. Uploaded files on the instance disappear on the next deploy. This milestone does not store uploads yet.

## This deploy

You do not need to change anything on Render. The owner account is already there. A normal deploy does not read `OWNER_EMAIL`, `OWNER_PASSWORD`, or `OWNER_USERNAME`.

If the deploy log says it is refusing to require an owner, a swatch or tag has no owner. Nothing was deleted. The site you have now stays up. Do not delete rows by hand to force it through.

## If you forget your password

Add `OWNER_NEW_PASSWORD` in Render, choose **Save, rebuild, and deploy**, sign in with that new password, then delete `OWNER_NEW_PASSWORD` and deploy again. The log says to remove it. That step also signs you out of every device. Leave it unset the rest of the time.

You can also change your password at `/account` while you are signed in.

## HTTPS

The public URL is HTTPS. You do not buy a certificate. The Rails production settings `assume_ssl` and `force_ssl` match Render’s proxy: the proxy speaks HTTPS to the browser, and the app refuses an insecure connection.
