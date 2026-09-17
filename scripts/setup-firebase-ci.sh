#!/usr/bin/env bash
# One-time setup. Requires project IAM/admin access and repository administration.
# No service-account key is created. Re-running restores this pipeline's bindings.
set -euo pipefail

PROJECT_ID=curiosity-economy
REPOSITORY=imitation-ai/Curiosity-economy
POOL_ID=github-hosting
PROVIDER_ID=curiosity-economy
ACCOUNT_ID=github-hosting-deploy
ACCOUNT_EMAIL="$ACCOUNT_ID@$PROJECT_ID.iam.gserviceaccount.com"

command -v gcloud >/dev/null
command -v gh >/dev/null
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
REPOSITORY_ID=$(gh api "repos/$REPOSITORY" --jq '.id')
OWNER_ID=$(gh api "repos/$REPOSITORY" --jq '.owner.id')
if [[ "$REPOSITORY_ID" != '1374226504' || "$OWNER_ID" != '163344646' ]]; then
  echo 'Repository identity changed; review the federation policy before continuing.' >&2
  exit 1
fi

gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  cloudresourcemanager.googleapis.com firebase.googleapis.com firebasehosting.googleapis.com \
  --project="$PROJECT_ID" --quiet

ACCOUNTS=$(gcloud iam service-accounts list --project="$PROJECT_ID" --filter="email=$ACCOUNT_EMAIL" --format='value(email)')
if [[ -z "$ACCOUNTS" ]]; then
  gcloud iam service-accounts create "$ACCOUNT_ID" --project="$PROJECT_ID" \
    --display-name='GitHub Firebase Hosting deployment' --quiet
fi

for ROLE in roles/firebasehosting.admin roles/serviceusage.apiKeysViewer roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$ACCOUNT_EMAIL" \
    --role="$ROLE" --condition=None --quiet --format=none
done

POOLS=$(gcloud iam workload-identity-pools list --project="$PROJECT_ID" --location=global --filter="name:/$POOL_ID" --format='value(name)')
if [[ -z "$POOLS" ]]; then
  gcloud iam workload-identity-pools create "$POOL_ID" --project="$PROJECT_ID" --location=global \
    --display-name='GitHub Hosting' --quiet
fi

CONDITION="assertion.repository_id == '$REPOSITORY_ID' && assertion.repository_owner_id == '$OWNER_ID' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == '$REPOSITORY/.github/workflows/firebase-hosting.yml@refs/heads/main' && (assertion.event_name == 'push' || assertion.event_name == 'workflow_dispatch')"
PROVIDERS=$(gcloud iam workload-identity-pools providers list --project="$PROJECT_ID" --location=global \
  --workload-identity-pool="$POOL_ID" --filter="name:/$PROVIDER_ID" --format='value(name)')
PROVIDER_COMMAND=create-oidc
if [[ -n "$PROVIDERS" ]]; then PROVIDER_COMMAND=update-oidc; fi
gcloud iam workload-identity-pools providers "$PROVIDER_COMMAND" "$PROVIDER_ID" \
  --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \
  --issuer-uri='https://token.actions.githubusercontent.com' \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' \
  --attribute-condition="$CONDITION" --quiet

gcloud iam service-accounts add-iam-policy-binding "$ACCOUNT_EMAIL" --project="$PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_ID/attribute.repository_id/$REPOSITORY_ID" \
  --quiet --format=none

gh variable set GOOGLE_WIF_PROVIDER --repo "$REPOSITORY" \
  --body "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_ID/providers/$PROVIDER_ID"
gh variable set GOOGLE_DEPLOY_SERVICE_ACCOUNT --repo "$REPOSITORY" --body "$ACCOUNT_EMAIL"
echo 'Deployment identity configured. No private key was generated.'
