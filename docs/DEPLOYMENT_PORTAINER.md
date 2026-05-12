# Deployment via Portainer

## Recommended: Portainer Stack from Git

This avoids manual `scp`, manual archive uploads, and repeated command-line deploys.

1. Push this project to a Git repository.
2. In Portainer open **Stacks**.
3. Click **Add stack**.
4. Choose **Repository**.
5. Set:
   - **Name**: `liquipedia`
   - **Repository URL**: your Git repository URL
   - **Compose path**: `docker-compose.yml`
   - **Branch**: your deploy branch, for example `main`
6. In **Environment variables** add:
   - `ADMIN_PASSWORD=63016`
   - `ADMIN_SESSION_SECRET=liquipedia-admin-session-secret`
   - `ADMIN_COOKIE_SECURE=false`
7. Deploy the stack.

For future updates:

1. Push code changes to Git.
2. Open the stack in Portainer.
3. Click **Pull and redeploy** or **Update the stack**.

If Portainer shows a webhook URL for the stack, save it. Future deploys can be triggered by opening that webhook URL or from GitHub Actions.

## Important Notes

- Do not use **Duplicate/Edit** for normal code deploys. It recreates a container from the existing image and may not rebuild the app.
- Use **Stack update**, **Pull and redeploy**, or **Rebuild image**.
- Keep the PostgreSQL volume. Do not delete the `liquipedia_postgres_data` volume unless you intentionally want to wipe the database.
- If the site is served over plain HTTP, keep `ADMIN_COOKIE_SECURE=false`.
- Use `ADMIN_COOKIE_SECURE=true` only after the site is behind HTTPS.

## What Must Exist in the Image

The app requires these runtime paths inside the `web` container:

- `/app/public` for homepage images.
- `/app/scripts/hltv_playwright.mjs` for HLTV scraping.
- Playwright Chromium under `/root/.cache/ms-playwright`.

The Dockerfile copies and installs these. If HLTV says Playwright browser is missing, rebuild the image instead of only recreating the container.

## Fallback: Current PowerShell Deploy Script

From local PowerShell:

```powershell
cd C:\Users\Sa1z1ngr0z\Desktop\liquipedia
.\scripts\deploy-web.ps1
```

This is a fallback, not the preferred long-term flow. It uploads a `tar.gz`, rebuilds the `web` image without cache, recreates `liquipedia-web`, and verifies Playwright Chromium inside the container.

