# Local dev setup — server credentials

The Express server (`server.ts`) uses the Firebase Admin SDK to reach Firestore for
`/api/analyze`, `/api/scan-receipt`, `/api/parse-statement`, and `/api/admin/*`.

The Admin SDK needs Google credentials. Without them, every one of those endpoints
returns **500 Internal Server Error** (`Could not load the default credentials`),
while the client-side Firebase SDK keeps working — which is exactly the confusing
"app works but API calls fail" symptom.

## Providing credentials (pick one)

1. **Application Default Credentials (recommended for dev)**

   ```bash
   brew install --cask google-cloud-sdk
   gcloud auth application-default login
   gcloud auth application-default set-quota-project spendly-dev-21016
   ```

   Sign in with the Google account that owns the dev Firebase project
   (`VITE_FIREBASE_PROJECT_ID` in `.env`).

2. **Service account key file**

   Firebase console → Project settings → Service accounts → Generate new private key,
   save the JSON outside the repo, then:

   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
   ```

After either option, restart the dev server. On startup it now runs a Firestore
connectivity probe and logs whether credentials are working.

## Admin endpoints

`/api/admin/*` additionally require an `admins/{uid}` document in Firestore for
your signed-in user, otherwise they return 403.
