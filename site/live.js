// Keeps the pages fresh: the site is rebuilt on a schedule, and this script
// fills the gap so a story shows up the moment it is published.
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import * as R from "./render.js";

const root = document.documentElement;
const base = root.dataset.base || "";
const main = document.getElementById("main");

const api = async (query) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: SUPABASE_KEY },
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
};

function route() {
  if (root.dataset.page !== "404") {
    return { type: root.dataset.page, key: root.dataset.key || "" };
  }
  const path = location.pathname.slice(base.length);
  let m = path.match(/^\/news\/([^/]+)\/?$/);
  if (m) return { type: "article", key: decodeURIComponent(m[1]) };
  m = path.match(/^\/category\/([^/]+)\/?$/);
  if (m) return { type: "category", key: decodeURIComponent(m[1]) };
  return { type: "404", key: "" };
}

function show(html, sig, title) {
  if (root.dataset.sig === sig) return;
  main.innerHTML = html;
  root.dataset.sig = sig;
  if (title) document.title = title;
}

document.querySelectorAll("[data-today]").forEach((el) => {
  el.textContent = new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date());
});

async function run() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const r = route();
  if (r.type === "404") return;

  const [posts, settingsRows] = await Promise.all([
    api(`posts?select=${R.META_FIELDS}&status=eq.published&order=published_at.desc&limit=200`),
    api("settings?select=site_name,tagline&limit=1"),
  ]);
  const settings = { ...R.DEFAULT_SETTINGS, ...(settingsRows[0] ?? {}) };

  document.querySelectorAll("[data-site-name]").forEach((el) => (el.textContent = settings.site_name));
  document.querySelectorAll("[data-tagline]").forEach((el) => (el.textContent = settings.tagline));
  document.querySelectorAll("[data-nav]").forEach((el) => (el.innerHTML = R.navHtml(posts, base)));

  if (r.type === "home") {
    show(R.homeMain(posts, base), R.sigOf(posts));
    return;
  }

  if (r.type === "category") {
    const list = posts.filter((p) => R.slugify(p.category) === r.key);
    if (!list.length) return show(R.notFoundMain(base), "none", `Not found | ${settings.site_name}`);
    show(R.homeMain(list, base, list[0].category), R.sigOf(list), `${list[0].category} | ${settings.site_name}`);
    return;
  }

  if (r.type === "article") {
    const rows = await api(`posts?select=*&status=eq.published&slug=eq.${encodeURIComponent(r.key)}&limit=1`);
    const post = rows[0];
    if (!post) return show(R.notFoundMain(base), "none", `Not found | ${settings.site_name}`);
    const more = posts.filter((p) => p.id !== post.id).slice(0, 3);
    const sig = R.sigOf([post, ...more]);
    if (root.dataset.sig === sig) return;
    const { default: DOMPurify } = await import("https://cdn.jsdelivr.net/npm/dompurify@3.1.6/+esm");
    const body = DOMPurify.sanitize(post.body, { ALLOWED_TAGS: R.ALLOWED_TAGS, ALLOWED_ATTR: R.ALLOWED_ATTR });
    show(R.articleMain(post, body, more, base, location.origin + base), sig, `${post.title} | ${settings.site_name}`);
  }
}

run().catch((err) => console.warn("Live update skipped:", err.message));
