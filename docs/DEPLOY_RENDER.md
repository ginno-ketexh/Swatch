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
5. Render will ask for three secrets you choose or generate. Do not put them in the repository.
   - `SECRET_KEY_BASE`: paste the string from `bin/rails secret`.
   - `OWNER_EMAIL`: the email you will use to sign in.
   - `OWNER_PASSWORD`: a password of at least 15 characters. This is not the database password. It is only used to create the first account, and you can remove it after you sign in.
   Leave the other values as the file sets them. `DATABASE_URL` is filled in from the database Render creates. You do not type a database password.
   Render ignores new secret keys on a Blueprint that already exists. If the site is already running, add `OWNER_EMAIL` by hand. See "Switching from the password pop-up to real sign-in" below.
6. Approve the Blueprint.

Render then creates:

- a **free web service** named `swatch`
- a **free PostgreSQL database** named `swatch-db`

The first deploy takes a few minutes. When it finishes, Render shows a URL that ends in `.onrender.com`.

## Check that it is alive

1. Open the `.onrender.com` URL. You should see the Swatch sign-in page. Sign in with `OWNER_EMAIL` and `OWNER_PASSWORD`. After that you should see your library.
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

The build also stops, before the new version goes live, if this is the first time accounts exist and `OWNER_EMAIL` or `OWNER_PASSWORD` is missing or not valid. The log names the setting and never prints the value. The previous version stays up. Fix the value, then use **Manual Deploy** and **Deploy latest commit**.

Once an owner account exists, the build no longer needs those two settings. You can delete them. See the next section.

`RAILS_MASTER_KEY` is the other way to supply the cookie secret, but only after you create encrypted credentials with `bin/rails credentials:edit`. This milestone does not commit a master key or a credentials file. Use `SECRET_KEY_BASE`.

## Free-plan limits

- The free web service **sleeps after about 15 minutes** with no visitors. The next visit wakes it up and can take half a minute or so. `/up` is how Render knows it woke up healthy.
- The free service has little memory (512 MB). The Blueprint sets one Puma process (`WEB_CONCURRENCY=1`) so it does not run out of memory on boot.
- The free database **expires 30 days** after you create it. You then have about 14 days to upgrade it to a paid plan. After that grace period, Render deletes the database and everything in it. There are no backups on the free database, and storage is capped (1 GB). Fine for learning. Not a place to keep a library you care about.
- Free web services have an ephemeral disk. Uploaded files on the instance disappear on the next deploy. This milestone does not store uploads yet.

## Switching from the password pop-up to real sign-in

The live site used to ask for a name and password in the browser's grey pop-up. This version uses a Swatch sign-in page instead.

Render does not add new secret keys from `render.yaml` onto a service that is already running. Add `OWNER_EMAIL` yourself before you merge. Keep `OWNER_USERNAME` until the new version is up, so a failed build can still serve the old pop-up.

Before you merge:

1. Render, then the `swatch` web service, then **Environment**. Add `OWNER_EMAIL` and set it to the email you want to sign in with.
2. Check `OWNER_PASSWORD` is at least 15 characters. That value becomes your first Swatch password, so change it there now if you want a different one. Leave `OWNER_USERNAME` in place for now.

Merge, then watch the deploy log:

3. Look for `Owner account created for g***@…`. If the build fails with a message about `OWNER_EMAIL` or `OWNER_PASSWORD`, nothing broke. The old version is still live with the old pop-up. Fix the value and click **Manual Deploy**, then **Deploy latest commit**.

After it is live:

4. Open https://swatch-kr01.onrender.com. You should see the Swatch sign-in page, not the grey pop-up. Sign in. Your swatches and tags should all be there.
5. Visit `/up`. It still says `OK` without signing in.
6. In Render, then **Environment**, delete `OWNER_USERNAME`, `OWNER_PASSWORD`, and `OWNER_EMAIL`. Choose **Save, rebuild, and deploy**. The build skips account creation once you exist.
7. Optional: change your password at `/account`.

If you forget the password later, add `OWNER_NEW_PASSWORD` in Render, choose **Save, rebuild, and deploy**, sign in with that new password, then delete `OWNER_NEW_PASSWORD` and deploy again. The log says to remove it. That step also signs you out of every device.

## HTTPS

The public URL is HTTPS. You do not buy a certificate. The Rails production settings `assume_ssl` and `force_ssl` match Render’s proxy: the proxy speaks HTTPS to the browser, and the app refuses an insecure connection.
