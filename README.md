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

## Architecture & decisions

- Html/CSS/JavaScript + Vite with a single `app.js`; no framework or state library. State is kept in a plain object and DOM is updated imperatively.
- Authentication token is stored in `localStorage` and passed via `Authorization` header; backend cookies are also allowed via `credentials: "include"`.
- File uploads use `XMLHttpRequest` for progress reporting; other API calls use `fetch` with a request ID header.
- Thumbnails and previews are fetched per file; blob URLs are cached/revoked to avoid leaks.

## Trade-offs / known limitations

- No client-side routing or deep links; everything lives on one page.
- Minimal input validation and no form error highlighting beyond text feedback.
- No automated tests or type checking; regressions must be caught manually.
- Accessibility and internationalization are only partially covered.

## Future improvements (optional)

- Add tests (unit + e2e), stronger validation, and accessibility passes.
- Support drag-and-drop uploads and multiple file selection with batch progress.
