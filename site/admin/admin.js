import { SUPABASE_URL, SUPABASE_KEY } from "../config.js";
import { ALLOWED_TAGS, ALLOWED_ATTR, esc, fmtDate, slugify, categoriesOf } from "../render.js";

const $ = (id) => document.getElementById(id);
const views = ["v-auth", "v-note", "v-app"];
const pages = ["v-list", "v-edit", "v-settings"];
const showView = (id) => views.forEach((v) => ($(v).hidden = v !== id));
const showPage = (id) => pages.forEach((p) => ($(p).hidden = p !== id));

function note(title, text, withSignOut = false) {
  $("note-title").textContent = title;
  $("note-text").textContent = text;
  $("note-out").hidden = !withSignOut;
  showView("v-note");
}
function say(id, text, isError = false) {
  $(id).textContent = text;
  $(id).classList.toggle("err", isError);
}
async function busy(button, work) {
  button.disabled = true;
  try {
    return await work();
  } finally {
    button.disabled = false;
  }
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  note("Almost ready", "The site is not connected to its database yet. Once that is done you can sign in here.");
  throw new Error("Not configured");
}

const [{ createClient }, { default: DOMPurify }] = await Promise.all([
  import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm"),
  import("https://cdn.jsdelivr.net/npm/dompurify@3.1.6/+esm"),
]);
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

let posts = [];
let settings = {};
let current = null; // story being edited, or null for a new one
let coverUrl = "";

// ---- Signing in -------------------------------------------------------------
let creating = false;
function setAuthMode(create) {
  creating = create;
  $("auth-title").textContent = create ? "Create your editor account" : "Sign in to your newsroom";
  $("auth-go").textContent = create ? "Create account" : "Sign in";
  $("auth-swap").textContent = create ? "Already have an account? Sign in" : "First time here? Create your editor account";
  $("a-pass-hint").textContent = create ? "at least 8 characters" : "";
  $("a-pass").autocomplete = create ? "new-password" : "current-password";
  say("auth-msg", "");
}
$("auth-swap").onclick = () => setAuthMode(!creating);

$("auth-form").onsubmit = (e) => {
  e.preventDefault();
  busy($("auth-go"), async () => {
    const email = $("a-email").value.trim();
    const password = $("a-pass").value;
    if (creating) {
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: location.origin + location.pathname },
      });
      if (error) return say("auth-msg", error.message, true);
      if (data.session) return enter();
      setAuthMode(false);
      say("auth-msg", "Check your email and click the confirmation link. Then come back to this page and sign in.");
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) {
        const text = /confirm/i.test(error.message)
          ? "Please click the confirmation link in your email first."
          : "That email and password do not match.";
        return say("auth-msg", text, true);
      }
      enter();
    }
  });
};

const signOut = async () => {
  await db.auth.signOut();
  showView("v-auth");
};
$("nav-out").onclick = signOut;
$("note-out").onclick = signOut;

async function enter() {
  const { data: isEditor, error } = await db.rpc("claim_admin");
  if (error) return note("Something went wrong", error.message, true);
  if (!isEditor) {
    return note(
      "Not the editor",
      "This site already has an editor, and it is not this account. Sign out, then sign in with the email you used the very first time.",
      true,
    );
  }
  showView("v-app");
  await Promise.all([loadSettings(), loadPosts()]);
  openList();
}

// ---- Stories list -----------------------------------------------------------
async function loadPosts() {
  const { data, error } = await db
    .from("posts")
    .select("id,slug,title,category,status,published_at,updated_at")
    .order("updated_at", { ascending: false });
  if (error) return alert(error.message);
  posts = data;
}

function openList() {
  $("rows").innerHTML = posts.length
    ? posts
        .map(
          (p) => `<li>
      <div class="t"><strong>${esc(p.title)}</strong>
      <span>${p.status === "published" ? `Published ${fmtDate(p.published_at)}` : `Last saved ${fmtDate(p.updated_at)}`}${p.category ? ` · ${esc(p.category)}` : ""}</span></div>
      <span class="pill${p.status === "published" ? " live" : ""}">${p.status === "published" ? "Live" : "Draft"}</span>
      <button data-edit="${esc(p.id)}">Edit</button>
    </li>`,
        )
        .join("")
    : `<li><div class="t"><span>No stories yet. Write your first one.</span></div></li>`;
  showPage("v-list");
}
$("nav-list").onclick = async () => {
  await loadPosts();
  openList();
};
$("rows").onclick = (e) => {
  const id = e.target.closest("[data-edit]")?.dataset.edit;
  if (id) openEditor(id);
};
$("new-story").onclick = () => openEditor(null);

// ---- Editor -----------------------------------------------------------------
function setCover(url) {
  coverUrl = url || "";
  $("cover-img").hidden = !coverUrl;
  $("cover-clear").hidden = !coverUrl;
  if (coverUrl) $("cover-img").src = coverUrl;
  $("cover-pick").textContent = coverUrl ? "Change picture" : "Choose picture";
}

async function openEditor(id) {
  current = null;
  if (id) {
    const { data, error } = await db.from("posts").select("*").eq("id", id).single();
    if (error) return alert(error.message);
    current = data;
  }
  const p = current ?? {};
  $("f-title").value = p.title ?? "";
  $("f-summary").value = p.summary ?? "";
  $("f-category").value = p.category ?? "";
  $("f-author").value = p.author ?? settings.author ?? "";
  $("f-cover-alt").value = p.cover_alt ?? "";
  $("f-body").innerHTML = DOMPurify.sanitize(p.body ?? "", { ALLOWED_TAGS, ALLOWED_ATTR });
  setCover(p.cover_url);
  $("cats").innerHTML = categoriesOf(posts).map((c) => `<option value="${esc(c.name)}">`).join("");
  const live = p.status === "published";
  $("save-publish").textContent = live ? "Update live story" : "Publish";
  $("save-draft").textContent = live ? "Take offline (back to draft)" : "Save as draft";
  $("edit-delete").hidden = !current;
  say("edit-msg", "");
  showPage("v-edit");
  window.scrollTo(0, 0);
}

document.execCommand("defaultParagraphSeparator", false, "p");
const body = $("f-body");
document.querySelector(".tools").addEventListener("mousedown", (e) => {
  if (e.target.closest("button")) e.preventDefault(); // keep the text selection
});
document.querySelector(".tools").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  body.focus();
  if (b.dataset.cmd) document.execCommand(b.dataset.cmd);
  if (b.dataset.block) document.execCommand("formatBlock", false, b.dataset.block);
});
body.addEventListener("paste", (e) => {
  e.preventDefault();
  document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
});
$("tool-link").onclick = () => {
  const url = prompt("Paste the web address for the link:", "https://");
  if (!url || !/^(https?:\/\/|mailto:)/i.test(url)) return;
  body.focus();
  document.execCommand("createLink", false, url);
};

/** Shrinks a photo in the browser so uploads are quick, then stores it. */
async function uploadImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((done) => canvas.toBlob(done, "image/jpeg", 0.85));
  const name = `${crypto.randomUUID()}.jpg`;
  const { error } = await db.storage.from("media").upload(name, blob, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
  });
  if (error) throw error;
  return db.storage.from("media").getPublicUrl(name).data.publicUrl;
}

$("cover-pick").onclick = () => $("cover-file").click();
$("cover-clear").onclick = () => setCover("");
$("cover-file").onchange = (e) =>
  busy($("cover-pick"), async () => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      setCover(await uploadImage(file));
    } catch (err) {
      say("edit-msg", `The picture could not be uploaded: ${err.message}`, true);
    }
  });

let savedRange = null;
$("tool-img").onclick = () => {
  const sel = getSelection();
  savedRange = sel.rangeCount && body.contains(sel.anchorNode) ? sel.getRangeAt(0) : null;
  $("body-file").click();
};
$("body-file").onchange = (e) =>
  busy($("tool-img"), async () => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const url = await uploadImage(file);
      const alt = prompt("Describe the picture in a few words:", "") ?? "";
      body.focus();
      if (savedRange) {
        getSelection().removeAllRanges();
        getSelection().addRange(savedRange);
      }
      document.execCommand("insertHTML", false, `<img src="${esc(url)}" alt="${esc(alt)}"><p><br></p>`);
    } catch (err) {
      say("edit-msg", `The picture could not be uploaded: ${err.message}`, true);
    }
  });

async function save(status, button) {
  const title = $("f-title").value.trim();
  if (!title) return say("edit-msg", "Please add a headline first.", true);
  const html = DOMPurify.sanitize(body.innerHTML, { ALLOWED_TAGS, ALLOWED_ATTR });
  if (status === "published" && !body.textContent.trim() && !/<img/i.test(html)) {
    return say("edit-msg", "The story is empty. Write something before publishing.", true);
  }
  const now = new Date().toISOString();
  const row = {
    title,
    summary: $("f-summary").value.trim(),
    category: $("f-category").value.trim(),
    author: $("f-author").value.trim(),
    cover_url: coverUrl,
    cover_alt: $("f-cover-alt").value.trim(),
    body: html,
    status,
    updated_at: now,
    published_at: current?.published_at ?? (status === "published" ? now : null),
  };
  await busy(button, async () => {
    let result;
    if (current) {
      result = await db.from("posts").update(row).eq("id", current.id).select().single();
    } else {
      const slug = slugify(title);
      result = await db.from("posts").insert({ ...row, slug }).select().single();
      if (result.error?.code === "23505") {
        const unique = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
        result = await db.from("posts").insert({ ...row, slug: unique }).select().single();
      }
    }
    if (result.error) return say("edit-msg", `Could not save: ${result.error.message}`, true);
    await loadPosts();
    await openEditor(result.data.id);
    if (status === "published") {
      $("edit-msg").innerHTML = `Published. <a href="../news/${encodeURIComponent(result.data.slug)}/" target="_blank" rel="noopener">Read it on the site</a>`;
      $("edit-msg").classList.remove("err");
    } else {
      say("edit-msg", "Saved as a draft. Only you can see it.");
    }
  });
}
$("save-publish").onclick = (e) => save("published", e.currentTarget);
$("save-draft").onclick = (e) => save("draft", e.currentTarget);
$("edit-back").onclick = () => openList();
$("edit-delete").onclick = (e) => {
  if (!current || !confirm(`Delete "${current.title}" for good? This cannot be undone.`)) return;
  busy(e.currentTarget, async () => {
    const { error } = await db.from("posts").delete().eq("id", current.id);
    if (error) return say("edit-msg", `Could not delete: ${error.message}`, true);
    await loadPosts();
    openList();
  });
};

// ---- Settings ---------------------------------------------------------------
async function loadSettings() {
  const { data } = await db.from("settings").select("*").eq("id", 1).single();
  settings = data ?? {};
}
$("nav-settings").onclick = () => {
  $("s-name").value = settings.site_name ?? "";
  $("s-tagline").value = settings.tagline ?? "";
  $("s-author").value = settings.author ?? "";
  $("s-google").value = settings.google_verification ?? "";
  $("p-new").value = "";
  say("settings-msg", "");
  say("pass-msg", "");
  showPage("v-settings");
};
$("settings-save").onclick = (e) =>
  busy(e.currentTarget, async () => {
    // Accept either the bare code or the whole <meta> tag Google hands out.
    const pasted = $("s-google").value.trim();
    const code = pasted.match(/content=["']([^"']+)["']/i)?.[1] ?? pasted;
    const row = {
      site_name: $("s-name").value.trim() || "ICONDAILY",
      tagline: $("s-tagline").value.trim(),
      author: $("s-author").value.trim(),
      google_verification: code.replace(/[^\w-]/g, ""),
    };
    const { error } = await db.from("settings").update(row).eq("id", 1);
    if (error) return say("settings-msg", `Could not save: ${error.message}`, true);
    settings = { ...settings, ...row };
    $("s-google").value = row.google_verification;
    say("settings-msg", "Saved.");
  });
$("pass-save").onclick = (e) =>
  busy(e.currentTarget, async () => {
    const password = $("p-new").value;
    if (password.length < 8) return say("pass-msg", "Use at least 8 characters.", true);
    const { error } = await db.auth.updateUser({ password });
    if (error) return say("pass-msg", error.message, true);
    $("p-new").value = "";
    say("pass-msg", "Password changed.");
  });

// ---- Start ------------------------------------------------------------------
// Once the site has its editor, the page is a plain email-and-password
// sign-in: creating further accounts would only cause confusion.
db.rpc("has_editor").then(({ data: exists }) => {
  if (exists) $("auth-swap").hidden = true;
});
const { data } = await db.auth.getSession();
if (data.session) enter();
else showView("v-auth");
