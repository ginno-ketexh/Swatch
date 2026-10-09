# Milestones

This is the list of Swatch milestones. Status lives in this file.

| Milestone | Name | Status |
| --- | --- | --- |
| M1 | Blank App Deployment | Done |
| M2 | Save & List Items | Done |
| M3 | Interactive React Screen | Done |
| M4 | Search, Tags & Filters | Done |
| M5 | User Authentication & Authorization | Done |
| M6 | Image Uploads | Done |
| M7 | Public Share Page & Polish | Done |

## M1 — Blank App Deployment

Done. Merged in pull request #1 on 2026-10-07.

| Story | Name | Status |
| --- | --- | --- |
| M1-01 | Project skeleton | Done |
| M1-02 | Health check | Done |
| M1-03 | CI | Done |
| M1-04 | Render deploy | Done |
| M1-05 | Environment settings | Done |
| M1-06 | Plain-language explainer | Not started |

M1-06 is a plain-language explainer. It is written separately and was not part of pull request #1.

## M2 — Save & List Items

Done. Merged in pull request #9 on 2026-10-07. The live site is https://swatch-kr01.onrender.com.

| Story | Name | Status |
| --- | --- | --- |
| M2-01 | Item record | Done |
| M2-02 | JSON API | Done |
| M2-03 | List page | Done |
| M2-04 | Add and edit form | Done |
| M2-05 | Delete with confirmation | Done |
| M2-06 | Plain-language explainer | Not started |

M2-06 is a plain-language explainer. It is written separately and was not part of pull request #9.

## M3 — Interactive React Screen

Done. Merged in pull request #11 on 2026-10-08.

| Story | Name | Status |
| --- | --- | --- |
| M3-01 | Detail side panel | Done |
| M3-02 | Grid / list view toggle | Done |
| M3-03 | Quick edit in place | Done |
| M3-04 | Keyboard navigation | Done |
| M3-05 | Smooth feedback | Done |
| M3-06 | Plain-language explainer | Not started |

M3-06 is a plain-language explainer. It is written separately and was not part of pull request #11.

## M4 — Search, Tags & Filters

Done. Merged in pull request #13 on 2026-10-08.

| Story | Name | Status |
| --- | --- | --- |
| M4-01 | Search my library | Done |
| M4-02 | Tag my swatches | Done |
| M4-03 | Filter by tags | Done |
| M4-04 | Sort and combine filters | Done |
| M4-05 | Manage my tags | Done |
| M4-06 | Plain-language explainer | Not started |

M4-06 is a plain-language explainer. It is written separately and was not part of pull request #13.

## M5 — User Authentication & Authorization

Done. Sign-in merged in pull request #15 on 2026-10-08. Requiring an owner on every swatch and tag merged in pull request #16 on 2026-10-08.

| Story | Name | Status |
| --- | --- | --- |
| M5-01 | Sign in and sign out | Done |
| M5-02 | Your owner account and a safe switch-over | Done |
| M5-03 | The whole app is private, except the heartbeat | Done |
| M5-04 | Your swatches and tags belong to you | Done |
| M5-05 | Your account and a way back in | Done |
| M5-06 | Plain-language explainer | Not started |

M5-06 is a plain-language explainer. It is written separately and was not part of pull request #15 or #16.

## M6 — Image Uploads

Done. Merged in pull request #18 on 2026-10-08. Verified live on Render with Cloudflare R2: a photo was still there after a refresh and after a redeploy.

| Story | Name | Status |
| --- | --- | --- |
| M6-01 | Permanent, private image storage | Done |
| M6-02 | Add an image to a swatch | Done |
| M6-03 | See my images | Done |
| M6-04 | Replace, remove, or describe an image | Done |
| M6-05 | Colour from my image | Done |
| M6-06 | Plain-language explainer | Not started |

M6-06 is a plain-language explainer. It is written separately and was not part of pull request #18.

## M7 — Public Share Page & Polish

Done. The public share page merged in pull request #20 on 2026-10-09. Follow-up fixes merged in pull request #21 on 2026-10-09.

| Story | Name | Status |
| --- | --- | --- |
| M7-01 | Share one swatch with a link | Done |
| M7-02 | Share a tag as a collection | Done |
| M7-03 | The public share page | Done |
| M7-04 | See and turn off my shared links | Done |
| M7-05 | Polish | Done |
| M7-06 | Plain-language explainer | Not started |

M7-06 is a plain-language explainer. It is written separately and was not part of pull request #20 or #21.

All seven milestones (M1 through M7) are complete.

## Still to do

These were left out of the milestones on purpose.

- Share the whole library, or a hand-picked set of swatches. Search or filter on a public page. Change a link after it is created (turn it off and make a new one). Passwords on links. Embed a page on another site. Download the original picture. A custom domain. Keep-awake pings. View numbers beyond a simple counter.
- Email a password-reset link, and two-factor sign-in. The account can already change its password while signed in.
- Turn on branch protection for `main`, using the steps in `docs/BRANCH_PROTECTION.md`.
- The free Render database expires around 2026-11-06. After that there is a short grace period, then Render deletes it. There are no backups on the free plan.
- `docs/CURSOR_SESSION.md` still describes the M1 session from 2026-10-07. It is out of date.
