# Firebase Hosting deployment

Repository: https://github.com/imitation-ai/Curiosity-economy

Project: `curiosity-economy` (display name **Curiosity-economy**).

Live site: https://curiosity-economy.web.app

## Normal releases

Push or merge into `main`. The **Firebase Hosting** workflow runs Node tests,
Python typesetting tests, the manuscript publication guard, and a production
build. It saves the build as a 14-day artifact, then deploys that exact artifact
to Firebase Hosting. A final HTTP check verifies the reader, edition manifest,
and complete PDF bytes. Pull requests run the checks and build without cloud
credentials or deployment. The Actions page also offers **Run workflow** on
`main` to redeploy the current edition.

Production releases are serialized so one release cannot interrupt another.
Actions are pinned to commit hashes; Dependabot proposes action updates monthly.
The `production` GitHub environment records deployment history.

## Cloud authentication

Google Workload Identity Federation exchanges GitHub's short-lived identity for
the `github-hosting-deploy@curiosity-economy.iam.gserviceaccount.com` service
account. No service-account private key or Firebase login token is stored in
GitHub. The trust policy requires this repository's numeric ID, its owner's
numeric ID, `main`, this exact workflow path, and a push or manual dispatch.

The account has Firebase Hosting Admin, API Keys Viewer, and Service Usage
Consumer on this project. It cannot edit IAM policies. The build job has no
Google permissions, and the deploy job authenticates only after downloading
the successful build.

Two repository variables select the configured Google identity:

- `GOOGLE_WIF_PROVIDER`
- `GOOGLE_DEPLOY_SERVICE_ACCOUNT`

`bash scripts/setup-firebase-ci.sh` creates or updates this configuration using
an already authenticated `gcloud` administrator and `gh` repository
administrator. Firebase must first be added to the GCP project and the default
Hosting site initialized. This setup is an administrator operation, not part of
normal releases.

## Book and analytics updates

The pipeline deploys the committed `public/book.json` and `public/book/*.pdf`.
It does not connect to private Drive documents. To publish manuscript edits,
run `npm run sync` with authorized Google access, review the reader, then commit
the updated manifest and PDFs and push to `main`. The `.source-cache`, `.env`,
and generated Google credentials are ignored by Git.

Set the repository variable `VITE_BETTERSTACK_APPLICATION_TOKEN` to Better
Stack's **public frontend application token**, then run the workflow again.
Leave it unset to keep analytics disabled. Never put a management or ingestion
secret in a `VITE_` variable. Verify events in Better Stack after configuration.

## Failures and rollback

Open the failed workflow job in GitHub Actions to see the failing step. Failed
tests or builds prevent deployment. A failed post-deployment HTTP check means
the release may already be live; inspect the site before retrying.

For a durable rollback, revert the problematic commit on `main` and push. For
an immediate rollback, select the previous release in Firebase Console's
Hosting release history. A subsequent push will deploy `main` again.

References: [Google authentication action](https://github.com/google-github-actions/auth),
[Firebase Hosting](https://firebase.google.com/docs/hosting),
[Firebase IAM roles](https://firebase.google.com/docs/projects/iam/roles-predefined-product).
