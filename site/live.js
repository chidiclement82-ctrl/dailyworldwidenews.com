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

// The last stories seen are kept on the visitor's device, so the next page
// can be drawn at once while the fresh copy loads.
const cache = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(`icondaily:${key}`));
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`icondaily:${key}`, JSON.stringify(value));
    } catch {
      /* storage unavailable: the page still works */
    }
  },
};

let purify;
async function clean(html) {
  purify ??= (await import("https://cdn.jsdelivr.net/npm/dompurify@3.1.6/+esm")).default;
  return purify.sanitize(html, { ALLOWED_TAGS: R.ALLOWED_TAGS, ALLOWED_ATTR: R.ALLOWED_ATTR });
}

function paintChrome(posts, settings) {
  document.querySelectorAll("[data-site-name]").forEach((el) => (el.textContent = settings.site_name));
  document.querySelectorAll("[data-tagline]").forEach((el) => (el.textContent = settings.tagline));
  document.querySelectorAll("[data-nav]").forEach((el) => (el.innerHTML = R.navHtml(posts, base)));
}

function paintList(r, posts, settings) {
  if (r.type === "home") return show(R.homeMain(posts, base), R.sigOf(posts));
  const list = posts.filter((p) => R.slugify(p.category) === r.key);
  if (!list.length) return show(R.notFoundMain(base), "none", `Not found | ${settings.site_name}`);
  show(R.homeMain(list, base, list[0].category), R.sigOf(list), `${list[0].category} | ${settings.site_name}`);
}

async function paintArticle(post, posts, settings) {
  const more = posts.filter((p) => p.id !== post.id).slice(0, 3);
  const sig = R.sigOf([post, ...more]);
  if (root.dataset.sig === sig) return;
  const body = await clean(post.body);
  show(R.articleMain(post, body, more, base, location.origin + base), sig, `${post.title} | ${settings.site_name}`);
}

async function run() {
  const r = route();
  if (r.type === "404") return show(R.notFoundMain(base), "none");
  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  // 1. Draw straight away from what this device saw last time.
  const saved = cache.get("list");
  if (saved) {
    paintChrome(saved.posts, saved.settings);
    if (r.type === "article") {
      const savedPost = cache.get(`post:${r.key}`);
      if (savedPost) await paintArticle(savedPost, saved.posts, saved.settings);
    } else {
      paintList(r, saved.posts, saved.settings);
    }
  }

  // 2. Fetch the current stories and redraw only if something changed.
  const wanted = [
    api(`posts?select=${R.META_FIELDS}&status=eq.published&order=published_at.desc&limit=200`),
    api("settings?select=site_name,tagline&limit=1"),
  ];
  if (r.type === "article") {
    wanted.push(api(`posts?select=*&status=eq.published&slug=eq.${encodeURIComponent(r.key)}&limit=1`));
  }
  const [posts, settingsRows, postRows] = await Promise.all(wanted);
  const settings = { ...R.DEFAULT_SETTINGS, ...(settingsRows[0] ?? {}) };
  cache.set("list", { posts, settings });
  paintChrome(posts, settings);

  if (r.type !== "article") return paintList(r, posts, settings);
  const post = postRows[0];
  if (!post) return show(R.notFoundMain(base), "none", `Not found | ${settings.site_name}`);
  cache.set(`post:${r.key}`, post);
  await paintArticle(post, posts, settings);
}

run().catch((err) => {
  console.warn("Live update skipped:", err.message);
  // Nothing on screen yet and no connection: say so instead of loading forever.
  if (root.dataset.sig === "loading") {
    show(
      `<div class="empty"><p>The stories could not be loaded. Check your connection and refresh the page.</p></div>`,
      "offline",
    );
  }
});
