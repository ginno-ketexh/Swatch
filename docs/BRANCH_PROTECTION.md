# Protect the main branch

Do this yourself in GitHub after the first pull request has run its checks. Nothing in the repository turns this on for you.

The goal: nobody, including you, can push straight to `main`. A change gets in only through a pull request that is approved and whose checks are green.

## Steps

1. Open the Swatch repository on GitHub.
2. Go to **Settings → Branches**.
3. Click **Add branch ruleset** (or **Add classic branch protection rule** if that is what you see).
4. Apply it to the branch named `main`.
5. Turn on these options:
   - **Require a pull request before merging.**
   - **Require approvals.** Set it to 1. That approval is you, reviewing the milestone.
   - **Require status checks to pass before merging.**
   - **Block force pushes.**
6. In the list of status checks, search for and require these four. They show up only after the GitHub Actions workflow has run at least once on a pull request:
   - `RuboCop`
   - `Frontend`
   - `Rails tests`
   - `Security`
7. Save the rule.

If a check name is missing, open the pull request, wait until the “CI” workflow finishes, then come back to this screen and search again.

After this is on, merging still happens by hand. The agent that opened a milestone pull request will not merge it.
