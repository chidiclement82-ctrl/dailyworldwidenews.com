# News site

A news website hosted on GitHub Pages. Stories, pictures and the editor login live in Supabase.

- `site/` holds the pages, styles and the editor (`site/admin/`).
- `build.mjs` turns the published stories into plain HTML pages, a sitemap and an RSS feed in `dist/`.
- `.github/workflows/pages.yml` rebuilds and publishes the site on every push and once an hour.
- `supabase/schema.sql` is the database setup.
- `site/config.js` holds the Supabase address and public key.

## Going live

1. Run `supabase/schema.sql` in the Supabase project and fill in `site/config.js`.
2. Push to a GitHub repository, then in **Settings → Pages** set **Source** to **GitHub Actions**.
3. Open `/admin/` on the site, create the editor account, and write.

To use your own domain, add it under **Settings → Pages → Custom domain**. The next build picks it up by itself.

## Trying it locally

```bash
npm install
```

```bash
node build.mjs
```
