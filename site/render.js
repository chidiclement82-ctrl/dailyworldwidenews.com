// Page templates shared by the build script (Node) and the browser.
// Everything here returns HTML strings and touches no DOM.

export const DEFAULT_SETTINGS = {
  site_name: "ICONDAILY",
  tagline: "Global Celebrity news, entertainment and culture",
  author: "",
  google_verification: "",
};

export const META_FIELDS =
  "id,slug,title,summary,category,author,cover_url,cover_alt,published_at,updated_at";

export const ALLOWED_TAGS = [
  "p", "br", "h2", "h3", "strong", "b", "em", "i", "u", "a",
  "ul", "ol", "li", "blockquote", "img", "figure", "figcaption",
];
export const ALLOWED_ATTR = ["href", "src", "alt", "target", "rel"];

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export function slugify(s) {
  return (
    String(s ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/, "") || "story"
  );
}

export function fmtDate(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(iso));
}

export function textOf(html, max = 160) {
  const t = String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : t;
}

export function categoriesOf(posts) {
  const seen = new Map();
  for (const p of posts) {
    const name = (p.category || "").trim();
    if (name && !seen.has(slugify(name))) seen.set(slugify(name), name);
  }
  return [...seen].map(([slug, name]) => ({ slug, name }));
}

/** A fingerprint of what a page shows, so the browser only redraws on change. */
export const sigOf = (posts) => posts.map((p) => p.id + p.updated_at).join("|");

const postUrl = (base, p) => `${base}/news/${encodeURIComponent(p.slug)}/`;
const catUrl = (base, name) => `${base}/category/${slugify(name)}/`;

function card(p, base, lead = false) {
  const img = p.cover_url
    ? `<a class="card-img" href="${postUrl(base, p)}" tabindex="-1" aria-hidden="true"><img src="${esc(p.cover_url)}" alt="" loading="${lead ? "eager" : "lazy"}"></a>`
    : "";
  return `<article class="card${lead ? " lead" : ""}${p.cover_url ? "" : " no-img"}">
  ${img}
  <div class="card-text">
    ${p.category ? `<a class="kicker" href="${catUrl(base, p.category)}">${esc(p.category)}</a>` : ""}
    <${lead ? "h2" : "h3"} class="card-title"><a href="${postUrl(base, p)}">${esc(p.title)}</a></${lead ? "h2" : "h3"}>
    ${p.summary ? `<p class="card-summary">${esc(p.summary)}</p>` : ""}
    <p class="meta"><time datetime="${esc(p.published_at)}">${fmtDate(p.published_at)}</time></p>
  </div>
</article>`;
}

export function homeMain(posts, base, heading = "") {
  const head = heading ? `<h1 class="section-head">${esc(heading)}</h1>` : "";
  if (!posts.length) {
    return `${head}<p class="empty">No stories have been published yet. Check back soon.</p>`;
  }
  const [lead, ...rest] = posts;
  return `${head}${card(lead, base, true)}
${rest.length ? `<div class="grid">${rest.map((p) => card(p, base)).join("\n")}</div>` : ""}`;
}

export function articleMain(post, bodyHtml, more, base, siteUrl) {
  const url = `${siteUrl}/news/${encodeURIComponent(post.slug)}/`;
  const share = encodeURIComponent(url);
  const text = encodeURIComponent(post.title);
  return `<article class="story">
  <header class="story-head">
    ${post.category ? `<a class="kicker" href="${catUrl(base, post.category)}">${esc(post.category)}</a>` : ""}
    <h1>${esc(post.title)}</h1>
    ${post.summary ? `<p class="deck">${esc(post.summary)}</p>` : ""}
    <p class="meta">${post.author ? `By <strong>${esc(post.author)}</strong> · ` : ""}<time datetime="${esc(post.published_at)}">${fmtDate(post.published_at)}</time></p>
  </header>
  ${post.cover_url ? `<figure class="story-cover"><img src="${esc(post.cover_url)}" alt="${esc(post.cover_alt)}"></figure>` : ""}
  <div class="story-body">${bodyHtml}</div>
  <p class="share">Share:
    <a href="https://wa.me/?text=${text}%20${share}" target="_blank" rel="noopener">WhatsApp</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${share}" target="_blank" rel="noopener">Facebook</a>
    <a href="https://twitter.com/intent/tweet?text=${text}&amp;url=${share}" target="_blank" rel="noopener">X</a>
  </p>
</article>
${more.length ? `<section class="more"><h2 class="section-head">More stories</h2><div class="grid">${more.map((p) => card(p, base)).join("\n")}</div></section>` : ""}`;
}

export function notFoundMain(base) {
  return `<div class="empty"><h1>Page not found</h1><p>That story may have been moved or removed.</p><p><a href="${base}/">Back to the front page</a></p></div>`;
}

export function navHtml(posts, base) {
  return `<a href="${base}/">Home</a>${categoriesOf(posts)
    .slice(0, 8)
    .map((c) => `<a href="${base}/category/${c.slug}/">${esc(c.name)}</a>`)
    .join("")}`;
}

// The emblem: a serif "i" whose dot is a star, inside a ring.
const BRAND_MARK = `<svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M22 28h13v18h6v4H23v-4h5V32h-6z"/><path class="brand-star" d="M31.5 8C32.6 15 34.5 16.900 41.500 18C34.5 19.100 32.600 21 31.5 28C30.400 21 28.500 19.100 21.500 18C28.500 16.900 30.400 15 31.5 8Z"/></svg>`;

/** A complete HTML document. Used by the build script only. */
export function page(o) {
  const s = o.settings;
  const base = o.base;
  const fullTitle = o.title ? `${o.title} | ${s.site_name}` : `${s.site_name}: ${s.tagline}`;
  const desc = o.description || s.tagline;
  const canonical = o.path != null ? `${o.siteUrl}${o.path}` : "";
  const ld = o.jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(o.jsonLd).replace(/</g, "\\u003c")}</script>`
    : "";
  return `<!doctype html>
<html lang="en" data-base="${esc(base)}" data-page="${esc(o.pageType)}" data-key="${esc(o.pageKey ?? "")}" data-sig="${esc(o.sig ?? "")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : `<meta name="robots" content="noindex">`}
<meta property="og:site_name" content="${esc(s.site_name)}">
<meta property="og:title" content="${esc(o.title || s.site_name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="${o.pageType === "article" ? "article" : "website"}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ""}
${o.image ? `<meta property="og:image" content="${esc(o.image)}">` : ""}
<meta name="twitter:card" content="${o.image ? "summary_large_image" : "summary"}">
${s.google_verification ? `<meta name="google-site-verification" content="${esc(s.google_verification)}">` : ""}
<link rel="alternate" type="application/rss+xml" title="${esc(s.site_name)}" href="${base}/rss.xml">
<link rel="icon" type="image/svg+xml" href="${base}/logo.svg">
<link rel="apple-touch-icon" href="${base}/logo.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800;900&display=swap">
<link rel="stylesheet" href="${base}/styles.css">
${ld}
<script type="module" src="${base}/live.js"></script>
</head>
<body>
<header class="masthead">
  <p class="dateline" data-today>&nbsp;</p>
  <a class="brand" href="${base}/">
    ${BRAND_MARK}
    <span class="site-name" data-site-name>${esc(s.site_name)}</span>
  </a>
  <p class="tagline" data-tagline>${esc(s.tagline)}</p>
  <nav class="nav" aria-label="Sections" data-nav>${navHtml(o.posts, base)}</nav>
</header>
<main id="main">
${o.main}
</main>
</body>
</html>
`;
}
