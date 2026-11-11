// Builds the public site into dist/ as plain HTML pages that search engines
// can read: front page, one page per story, category pages, sitemap and RSS.
//
//   SITE_URL   full address of the site, e.g. https://example.com
//   BASE_PATH  folder the site is served from ("" or "/repo-name")
//   POSTS_FILE optional JSON file of posts, for testing without a database
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sanitizeHtml from "sanitize-html";
import { SUPABASE_URL, SUPABASE_KEY } from "./site/config.js";
import * as R from "./site/render.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "dist");
const base = (process.env.BASE_PATH || "").replace(/\/+$/, "");
const siteUrl = (process.env.SITE_URL || `http://localhost:8080${base}`).replace(/\/+$/, "");

async function api(query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, { headers: { apikey: SUPABASE_KEY } });
  if (!res.ok) throw new Error(`Supabase request failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function load() {
  if (process.env.POSTS_FILE) {
    const posts = JSON.parse(await readFile(process.env.POSTS_FILE, "utf8"));
    return { posts, settings: R.DEFAULT_SETTINGS };
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn("site/config.js is not filled in yet: building an empty site.");
    return { posts: [], settings: R.DEFAULT_SETTINGS };
  }
  const [posts, settingsRows] = await Promise.all([
    api("posts?select=*&status=eq.published&order=published_at.desc&limit=1000"),
    api("settings?select=*&limit=1"),
  ]);
  return { posts, settings: { ...R.DEFAULT_SETTINGS, ...(settingsRows[0] ?? {}) } };
}

const clean = (html) =>
  sanitizeHtml(html ?? "", {
    allowedTags: R.ALLOWED_TAGS,
    allowedAttributes: { a: ["href", "target", "rel"], img: ["src", "alt", "loading"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener" }),
      img: sanitizeHtml.simpleTransform("img", { loading: "lazy" }),
    },
  });

async function out(file, content) {
  const full = path.join(dist, file);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

const xml = (s) => R.esc(s);

const { posts, settings } = await load();
await rm(dist, { recursive: true, force: true });
await cp(path.join(here, "site"), dist, { recursive: true });
await out(".nojekyll", "");

const common = { settings, base, siteUrl, posts };

// Front page
await out(
  "index.html",
  R.page({
    ...common,
    pageType: "home",
    path: "/",
    sig: R.sigOf(posts),
    main: R.homeMain(posts, base),
    jsonLd: { "@context": "https://schema.org", "@type": "WebSite", name: settings.site_name, url: `${siteUrl}/` },
  }),
);

// Stories
for (const post of posts) {
  const more = posts.filter((p) => p.id !== post.id).slice(0, 3);
  const body = clean(post.body);
  const description = post.summary || R.textOf(body);
  await out(
    `news/${post.slug}/index.html`,
    R.page({
      ...common,
      pageType: "article",
      pageKey: post.slug,
      path: `/news/${encodeURIComponent(post.slug)}/`,
      title: post.title,
      description,
      image: post.cover_url,
      sig: R.sigOf([post, ...more]),
      main: R.articleMain(post, body, more, base, siteUrl),
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        headline: post.title,
        description,
        datePublished: post.published_at,
        dateModified: post.updated_at,
        mainEntityOfPage: `${siteUrl}/news/${encodeURIComponent(post.slug)}/`,
        ...(post.cover_url ? { image: [post.cover_url] } : {}),
        ...(post.author ? { author: { "@type": "Person", name: post.author } } : {}),
        publisher: { "@type": "Organization", name: settings.site_name },
      },
    }),
  );
}

// Categories
const categories = R.categoriesOf(posts);
for (const c of categories) {
  const list = posts.filter((p) => R.slugify(p.category) === c.slug);
  await out(
    `category/${c.slug}/index.html`,
    R.page({
      ...common,
      pageType: "category",
      pageKey: c.slug,
      path: `/category/${c.slug}/`,
      title: c.name,
      description: `${c.name} news from ${settings.site_name}`,
      sig: R.sigOf(list),
      main: R.homeMain(list, base, c.name),
    }),
  );
}

// Fallback page: also shows stories published since the last build.
await out(
  "404.html",
  R.page({ ...common, pageType: "404", path: null, title: "Not found", sig: "none", main: R.notFoundMain(base) }),
);

// Sitemap, RSS, robots
const urls = [
  { loc: `${siteUrl}/`, lastmod: posts[0]?.updated_at },
  ...posts.map((p) => ({ loc: `${siteUrl}/news/${encodeURIComponent(p.slug)}/`, lastmod: p.updated_at })),
  ...categories.map((c) => ({ loc: `${siteUrl}/category/${c.slug}/` })),
];
await out(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${xml(u.loc)}</loc>${u.lastmod ? `<lastmod>${xml(u.lastmod)}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`,
);
await out(
  "rss.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${xml(settings.site_name)}</title>
<link>${xml(siteUrl)}/</link>
<description>${xml(settings.tagline)}</description>
${posts
  .slice(0, 30)
  .map(
    (p) => `<item><title>${xml(p.title)}</title><link>${xml(`${siteUrl}/news/${encodeURIComponent(p.slug)}/`)}</link><guid>${xml(`${siteUrl}/news/${encodeURIComponent(p.slug)}/`)}</guid><pubDate>${new Date(p.published_at).toUTCString()}</pubDate><description>${xml(p.summary || R.textOf(p.body))}</description></item>`,
  )
  .join("\n")}
</channel></rss>
`,
);
await out("robots.txt", `User-agent: *\nAllow: /\nDisallow: ${base}/admin/\n\nSitemap: ${siteUrl}/sitemap.xml\n`);

console.log(`Built ${posts.length} stories and ${categories.length} categories for ${siteUrl}`);
