# Deploying Tripilot (Firebase + Cloud Run + Supabase)

Tripilot is designed for a zero-to-low-cost cloud stack:
- **Database**: Supabase PostgreSQL (either a dedicated project or a shared Postgres instance using `DB_SCHEMA=tripilot`)
- **Backend (`apps/api`)**: Google Cloud Run (Docker `prod` stage)
- **Frontend (`apps/web`)**: Firebase Hosting (Angular SPA + PWA) or Cloud Run Nginx container
- **Authentication**: Firebase Auth (Google Sign-In) + Personal API Tokens (`tp_pat_*`) for MCP agents

---

## Step 1: Supabase PostgreSQL

1. Use an existing Supabase project (or create a second free-tier project).
2. If sharing an existing Supabase database (e.g., alongside `fiance-dashboard`), run once in the Supabase SQL Editor:
   ```sql
   CREATE SCHEMA IF NOT EXISTS tripilot;
   ```
3. Copy your async PostgreSQL connection string (Transaction Pooler on port `6543` is supported out of the box with `statement_cache_size=0`):
   ```text
   postgresql+asyncpg://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```
4. Apply the initial Alembic schema migration:
   ```bash
   cd apps/api
   DATABASE_URL="postgresql+asyncpg://..." DB_SCHEMA=tripilot alembic upgrade head
   ```

---

## Step 2: Deploy Backend (`apps/api`) to Google Cloud Run

From `apps/api/`:

```bash
gcloud run deploy tripilot-api \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --set-env-vars "APP_ENV=PROD,DB_SCHEMA=tripilot,CORS_ORIGINS=https://<your-web-domain>" \
  --set-secrets "DATABASE_URL=tripilot-db-url:latest,GOOGLE_PLACES_API_KEY=tripilot-places-key:latest"
```

> [!NOTE]
> `apps/api/Dockerfile` defaults to the `prod` stage, runs as a non-root user, and binds dynamically to Cloud Run's `$PORT` (`8080`).

Ensure Cloud Run's service account has access to verify Firebase ID tokens (automatic when deployed in the same GCP project as Firebase, or provide `FIREBASE_CREDENTIALS_PATH`).

---

## Step 3: Enable Firebase Auth & Configure Frontend (`apps/web`)

1. In Firebase Console (`tripilot-515515` or your Firebase project):
   - Enable **Authentication -> Sign-in method -> Google**.
   - Register a **Web App** and copy its `firebaseConfig`.
2. Create `apps/web/public/runtime-config.js` (loaded before Angular boots, never needs a rebuild to change endpoints):
   ```js
   window.__TRIPILOT_CONFIG__ = {
     apiBaseUrl: 'https://tripilot-api-xxxxx-de.a.run.app',
     firebase: {
       apiKey: '...',
       authDomain: 'tripilot-515515.firebaseapp.com',
       projectId: 'tripilot-515515',
     },
   };
   ```
3. Build and deploy to Firebase Hosting:
   ```bash
   cd apps/web
   npm run build
   firebase deploy --only hosting
   ```

---

## Step 4: Connect Antigravity / Gemini via MCP

1. Sign in to your deployed Tripilot web app -> **Settings (`Profile`)** -> generate a **Personal API Token** (`tp_pat_...`).
2. Configure `packages/mcp` with:
   ```env
   TRIPPILOT_API_URL=https://tripilot-api-xxxxx-de.a.run.app
   TRIPPILOT_API_TOKEN=tp_pat_...
   ```
