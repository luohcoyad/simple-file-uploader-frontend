# Frontend

Simple Web interface for the File Manager API.

## Run locally

1. Install deps: `npm install`
2. Configure API base: copy `.env.example` to `.env` (or `.env.local`) and set `VITE_API_BASE`. Optional: set `VITE_MAX_FILE_SIZE_BYTES` (defaults to 50 MB).
3. Start dev server: `npm run dev` (Vite). For a built version: `npm run build` then `npm run preview`.
4. Ensure the backend is running at the URL you configured.
5. Open the served page and sign up/log in, upload, manage files.

## Deploy

1. Configure env vars for the build: set `VITE_API_BASE` (and optional `VITE_MAX_FILE_SIZE_BYTES`) in your hosting platform, or create `.env.production`.
2. Build static assets: `npm install` then `npm run build` to produce the `dist/` folder.
3. Deploy `dist/` to any static host (e.g., Netlify, Vercel, S3/CloudFront, GitHub Pages). Point the host to `dist/` as the publish directory.
4. If your host supports redirects, you can optionally serve `index.html` as the fallback for client-side routing (not required here because routes are shallow).
5. Verify by loading the deployed URL and confirming login/upload works against the configured API base.

## Lint

- Run `npm run lint` to check code style and catch common issues.
