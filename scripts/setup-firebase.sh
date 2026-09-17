#!/usr/bin/env bash
#
# setup-firebase.sh — Provision / configure a Firebase project for Spendly.
#
# What this automates (via the Firebase CLI):
#   1. Ensures you are logged in.
#   2. Creates the project (or reuses an existing one).
#   3. Registers a Web app and fetches its SDK config.
#   4. Creates the (default) Cloud Firestore database.
#   5. Deploys firestore.rules.
#   6. Writes/updates your local .env with the VITE_FIREBASE_* values and a
#      freshly generated SERVER_ENCRYPTION_KEY (existing values are preserved).
#
# What it CANNOT automate (Firebase CLI does not expose these — do them once in
# the console at https://console.firebase.google.com):
#   • Enable Authentication providers: Google, and Email/Password + Email link.
#     Authentication > Sign-in method.
#   • For the Spark (free) plan, Firestore location is chosen at creation time.
#
# Usage:
#   ./scripts/setup-firebase.sh <project-id> [--create] [--display-name "Name"]
#
# Requirements: Node.js (for `npx firebase-tools`), openssl, and a browser for
# the one-time `firebase login`.

set -euo pipefail

PROJECT_ID="${1:-}"
CREATE=false
DISPLAY_NAME="Spendly"
WEB_APP_NAME="Spendly Web"

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --create) CREATE=true ;;
    --display-name) DISPLAY_NAME="$2"; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

if [[ -z "$PROJECT_ID" ]]; then
  echo "Usage: $0 <project-id> [--create] [--display-name \"Name\"]" >&2
  exit 1
fi

FB="npx --yes firebase-tools"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

echo "==> Checking Firebase CLI login…"
$FB login --no-localhost >/dev/null 2>&1 || $FB login

if $CREATE; then
  echo "==> Creating project '$PROJECT_ID'…"
  $FB projects:create "$PROJECT_ID" --display-name "$DISPLAY_NAME" || {
    echo "    (project may already exist — continuing)"; }
fi

echo "==> Registering Web app…"
APP_ID="$($FB apps:list WEB --project "$PROJECT_ID" 2>/dev/null | awk -F'│' '/web/ {gsub(/ /,"",$3); print $3; exit}')"
if [[ -z "${APP_ID:-}" ]]; then
  $FB apps:create WEB "$WEB_APP_NAME" --project "$PROJECT_ID"
fi

echo "==> Fetching Web SDK config…"
SDK_JSON="$($FB apps:sdkconfig WEB --project "$PROJECT_ID" 2>/dev/null | sed -n '/{/,/}/p')"

get() { printf '%s' "$SDK_JSON" | grep -o "\"$1\": *\"[^\"]*\"" | head -1 | sed 's/.*: *"\(.*\)"/\1/'; }
API_KEY="$(get apiKey)"
AUTH_DOMAIN="$(get authDomain)"
STORAGE_BUCKET="$(get storageBucket)"
SENDER_ID="$(get messagingSenderId)"
APP_ID_CFG="$(get appId)"

echo "==> Creating Cloud Firestore database (if missing)…"
$FB firestore:databases:create "(default)" --project "$PROJECT_ID" --location nam5 2>/dev/null \
  || echo "    (database already exists — continuing)"

echo "==> Deploying Firestore rules…"
$FB deploy --only firestore:rules --project "$PROJECT_ID"

echo "==> Writing $ENV_FILE …"
# Preserve an existing SERVER_ENCRYPTION_KEY if present, otherwise generate one.
EXISTING_KEY=""
if [[ -f "$ENV_FILE" ]]; then
  EXISTING_KEY="$(grep '^SERVER_ENCRYPTION_KEY=' "$ENV_FILE" | head -1 | cut -d'"' -f2 || true)"
fi
ENC_KEY="${EXISTING_KEY:-$(openssl rand -hex 32)}"

cat > "$ENV_FILE" <<ENV
VITE_FIREBASE_API_KEY="$API_KEY"
VITE_FIREBASE_AUTH_DOMAIN="$AUTH_DOMAIN"
VITE_FIREBASE_PROJECT_ID="$PROJECT_ID"
VITE_FIREBASE_STORAGE_BUCKET="$STORAGE_BUCKET"
VITE_FIREBASE_MESSAGING_SENDER_ID="$SENDER_ID"
VITE_FIREBASE_APP_ID="$APP_ID_CFG"
VITE_FIREBASE_DATABASE_ID=""
VITE_FIREBASE_MEASUREMENT_ID=""
SERVER_ENCRYPTION_KEY="$ENC_KEY"
GEMINI_API_KEY=""
APP_URL="http://localhost:3000"
ENV

echo
echo "✅ Done. .env written for project '$PROJECT_ID'."
echo
echo "⚠️  Manual step (once, in the Firebase console):"
echo "    Authentication > Sign-in method > enable:"
echo "      • Google"
echo "      • Email/Password  (turn on 'Email link (passwordless sign-in)')"
echo
echo "Then run:  npm run dev"
