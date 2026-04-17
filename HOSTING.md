# Hosting the classroom dashboard (web app)

The same Node server serves the static viewer and the Google Forms API. Professors only need a browser and your **HTTPS URL**.

## 1. Google Cloud Console

Create an OAuth **Web application** client. Set:

- **Authorized JavaScript origins:** `https://YOUR-HOST` (your public site, no trailing slash)
- **Authorized redirect URIs:** `https://YOUR-HOST/auth/google/callback`

Use the **exact** public URL your host gives you (Render, Fly.io, etc.).

## 2. Environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| `GOOGLE_CLIENT_ID` | yes | From Google Cloud |
| `GOOGLE_CLIENT_SECRET` | yes | From Google Cloud |
| `SESSION_SECRET` | yes in production | Long random string (32+ characters) |
| `DATABASE_URL` | recommended | PostgreSQL connection string so sign-ins survive server restarts (e.g. Render Postgres, Neon, Supabase). If omitted, sessions use files under `server/data/sessions` (fine for local Docker; ephemeral on some free hosts). |
| `GOOGLE_REDIRECT_URI` | optional | Defaults to `{PUBLIC_BASE}/auth/google/callback`. Set explicitly if auto-detection is wrong. |
| `PUBLIC_BASE_URL` | optional | Your public origin, e.g. `https://classroom-dashboard.onrender.com`. On Render, `RENDER_EXTERNAL_URL` is usually set for you. |
| `PORT` | optional | Set by the platform; defaults to `3847` locally. |

## 3. Deploy with Docker

Build from the **repository root** (where `Dockerfile` lives):

```bash
docker build -t classroom-dashboard .
docker run -p 8080:8080 -e PORT=8080 \
  -e GOOGLE_CLIENT_ID=... -e GOOGLE_CLIENT_SECRET=... \
  -e SESSION_SECRET=... -e DATABASE_URL=... \
  classroom-dashboard
```

## 4. Deploy on Render

1. Create a **PostgreSQL** instance (free tier is fine) and copy its **Internal Database URL** into `DATABASE_URL` on the web service.
2. **New → Blueprint** and connect this repo, or **New → Web Service** with Docker and this repo.
3. If not using a Blueprint, add the environment variables above manually. Match the Google redirect URI to your service URL.
4. After deploy, open `https://<your-service>.onrender.com/`.

Optional: commit `render.yaml` and use **Blueprint** to provision the web service; link `DATABASE_URL` to the Postgres resource in the Render dashboard if the blueprint does not wire it automatically.

## Notes

- **HTTPS:** `SESSION_SECRET` and `secure` cookies require `NODE_ENV=production` behind TLS (Render/Fly provide this).
- **Single service:** One deployment = one app URL; each signed-in professor has their own **session** (tokens in Postgres or session files).
