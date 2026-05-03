require("dotenv").config();

const express = require("express");
const multer = require("multer");
const puppeteer = require("puppeteer");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dataStore = require("./dataStore");
const {
  getHolidayMapForYear,
  parseHolidayCalendarsList,
} = require("./holidays");

const Stripe = require("stripe");
function normalizeStripeId(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  // Guard against accidental trailing punctuation from copy/paste.
  return s.replace(/[.,;:!?]+$/g, "");
}

/** Set in .env — must match the same Stripe account + mode (test/live) as STRIPE_SECRET_KEY. */
const STRIPE_PRODUCT_ID = normalizeStripeId(process.env.STRIPE_PRODUCT_ID || "");
const STRIPE_PRICE_ID = normalizeStripeId(process.env.STRIPE_PRICE_ID || "");
const STRIPE_PRICE_LOOKUP_KEY = String(process.env.STRIPE_PRICE_LOOKUP_KEY || "").trim();
const STRIPE_UNIT_AMOUNT_CENTS = Number.parseInt(
  process.env.STRIPE_UNIT_AMOUNT_CENTS || "52",
  10
);
const STRIPE_CURRENCY = (process.env.STRIPE_CURRENCY || "usd").toLowerCase();
const PUBLIC_APP_URL = (
  process.env.PUBLIC_APP_URL || "http://localhost:5173"
).replace(/\/$/, "");

/**
 * Checkout success/cancel URLs must match the site the user opened. Defaults to
 * PUBLIC_APP_URL; optional body field clientAppOrigin (window.location.origin)
 * is used when it is localhost/127.0.0.1, matches PUBLIC_APP_URL, or matches
 * STRIPE_ALLOWED_RETURN_ORIGINS (comma-separated full origins, e.g. https://www.example.com).
 */
function pickCheckoutReturnBase(clientOriginRaw) {
  const fallback = PUBLIC_APP_URL;
  const raw = String(clientOriginRaw || "").trim();
  if (!raw) return fallback;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return fallback;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return fallback;
  const origin = `${u.protocol}//${u.host}`.replace(/\/$/, "");
  const hn = u.hostname.toLowerCase();
  if (hn === "localhost" || hn === "127.0.0.1") return origin;

  let pub;
  try {
    pub = new URL(fallback);
  } catch {
    return fallback;
  }
  if (origin === `${pub.protocol}//${pub.host}`) return origin;

  const extras = String(process.env.STRIPE_ALLOWED_RETURN_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  for (const ex of extras) {
    try {
      const eu = new URL(ex);
      if (origin === `${eu.protocol}//${eu.host}`) return origin;
    } catch {
      /* ignore */
    }
  }
  return fallback;
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

/**
 * Resolves a Price id from lookup_key (request body or env) or STRIPE_PRICE_ID.
 * If the client sent lookup_key and nothing matched, throws (misconfiguration).
 */
async function resolveCheckoutPriceId(stripe, lookupKeyRaw) {
  const bodyKey = String(lookupKeyRaw || "").trim();
  const envKey = STRIPE_PRICE_LOOKUP_KEY;
  const lookupKey = bodyKey || envKey;
  if (lookupKey) {
    const prices = await stripe.prices.list({
      lookup_keys: [lookupKey],
      active: true,
      limit: 1,
    });
    if (prices.data && prices.data[0] && prices.data[0].id) {
      return prices.data[0].id;
    }
    if (bodyKey) {
      throw new Error(
        `No active Stripe Price found for lookup_key '${bodyKey}'. Check Test/Live mode and that the key exists on this Price in the Stripe Dashboard.`
      );
    }
  }
  if (STRIPE_PRICE_ID) return STRIPE_PRICE_ID;
  return "";
}

function checkoutLineItemsFromPriceData() {
  return [
    {
      price_data: {
        currency: STRIPE_CURRENCY,
        product: STRIPE_PRODUCT_ID,
        unit_amount: STRIPE_UNIT_AMOUNT_CENTS,
      },
      quantity: 1,
    },
  ];
}

const JWT_SECRET = process.env.JWT_SECRET || "calendar-dev-secret-change-me";
const JWT_EXPIRES = "30d";

function authBearer(req) {
  const h = req.headers.authorization;
  if (!h || typeof h !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

function requireAuth(req, res, next) {
  const token = authBearer(req);
  if (!token) {
    return res.status(401).json({ error: "Sign in required" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Session expired or invalid" });
  }
}

function publicCalendar(c) {
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    year: c.year,
    startMonth: c.startMonth,
    weekStart: c.weekStart,
    yearFont: c.yearFont,
    monthFont: c.monthFont,
    weekDaysFont: c.weekDaysFont,
    datesFont: c.datesFont,
    datesFontSize: c.datesFontSize,
    dateNumberPosition: c.dateNumberPosition || "top-left",
    holidayCalendars: Array.isArray(c.holidayCalendars) ? c.holidayCalendars : [],
    archiveFolder: c.archiveFolder,
    archiveReplaceAll: c.archiveReplaceAll,
    layoutMode: c.layoutMode || "landscape-spread",
    events: c.events,
    updatedAt: c.updatedAt,
    createdAt: c.createdAt,
  };
}

const app = express();

const TEMPLATE_PATH = path.join(__dirname, "template.html");
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 40 * 1024 * 1024 },
});

const ENTITLEMENTS_DIR = path.join(UPLOADS_DIR, "entitlements");
if (!fs.existsSync(ENTITLEMENTS_DIR)) {
  fs.mkdirSync(ENTITLEMENTS_DIR, { recursive: true });
}

const calendarEntitlementUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const id = req.calendarEntitlementId;
      if (!id) {
        return cb(new Error("Missing calendarEntitlementId"));
      }
      const dir = path.join(ENTITLEMENTS_DIR, id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "") || ".bin";
      cb(null, `${file.fieldname}${ext}`);
    },
  }),
});

function assignCalendarEntitlementId(req, _res, next) {
  req.calendarEntitlementId = crypto.randomUUID();
  next();
}

const calendarImageFields = Array.from({ length: 12 }, (_, i) => ({
  name: `images_${i}`,
  maxCount: 1,
}));

function resolvePicturesDir() {
  const fromEnv = String(process.env.PICTURES_DIR || "").trim();
  if (fromEnv) {
    return path.resolve(__dirname, fromEnv);
  }
  // Linux is case-sensitive; support both names used across environments.
  const candidates = [
    path.join(__dirname, "Pictures"),
    path.join(__dirname, "pictures"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // Default to Pictures when creating a new folder.
  return candidates[0];
}

const PICTURES_DIR = resolvePicturesDir();
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);

/** PDF day cell min-height in template.html (.cell); size 4 = 1/4 of this; size 5 = full cell. */
const CALENDAR_CELL_MIN_MM = 14;
const DATE_NUMBER_FONT_MM = {
  1: 2,
  2: 2.75,
  3: 3.5,
  4: CALENDAR_CELL_MIN_MM / 4,
  5: CALENDAR_CELL_MIN_MM,
};

function parseDateNumberSize(body) {
  const n = parseInt(body.datesFontSize, 10);
  return n >= 1 && n <= 5 ? n : 3;
}

/** Day-cell placement for the date digit in the PDF grid. */
function normalizeDateNumberPosition(raw) {
  const v = String(raw || "").trim();
  if (v === "center" || v === "top-center" || v === "top-left") return v;
  return "top-left";
}

function resolveUnderPictures(rel) {
  if (rel === undefined || rel === null) return null;
  const sub = String(rel).trim().replace(/^[/\\]+|[/\\]+$/g, "");
  const full = path.resolve(PICTURES_DIR, sub || ".");
  const relToPic = path.relative(PICTURES_DIR, full);
  if (relToPic.startsWith("..") || path.isAbsolute(relToPic)) return null;
  return full;
}

/**
 * Image files directly inside absDir; relPrefix is relative path under Pictures/ (posix slashes).
 */
function listImageFilesDirect(absDir, relPrefix) {
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) return [];
  const names = fs.readdirSync(absDir);
  const out = [];
  for (const n of names) {
    if (n === "." || n === "..") continue;
    const p = path.join(absDir, n);
    try {
      if (!fs.statSync(p).isFile()) continue;
      if (!IMAGE_EXT.has(path.extname(n).toLowerCase())) continue;
      const relPath = relPrefix ? `${relPrefix}/${n}` : n;
      out.push({ name: n, path: relPath.replace(/\\/g, "/") });
    } catch {
      /* skip */
    }
  }
  out.sort((a, b) =>
    a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" })
  );
  return out;
}

/**
 * Breadth-first collect images under absRoot when there are no files in the root of that folder.
 * relPrefix is path under Pictures/ using forward slashes (may be "").
 */
function collectImageFilesBfs(absRoot, relPrefix, maxDepth, maxFiles) {
  const out = [];
  const queue = [{ abs: absRoot, rel: relPrefix, depth: 0 }];
  while (queue.length > 0 && out.length < maxFiles) {
    const { abs, rel, depth } = queue.shift();
    let names;
    try {
      if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) continue;
      names = fs.readdirSync(abs);
    } catch {
      continue;
    }
    for (const n of names) {
      if (n === "." || n === "..") continue;
      if (out.length >= maxFiles) break;
      const p = path.join(abs, n);
      let st;
      try {
        st = fs.statSync(p);
      } catch {
        continue;
      }
      const relChild = rel ? `${rel}/${n}` : n;
      const posix = relChild.replace(/\\/g, "/");
      if (st.isFile()) {
        if (!IMAGE_EXT.has(path.extname(n).toLowerCase())) continue;
        out.push({ name: n, path: posix });
      } else if (st.isDirectory() && depth < maxDepth) {
        queue.push({ abs: p, rel: relChild, depth: depth + 1 });
      }
    }
  }
  out.sort((a, b) =>
    a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" })
  );
  return out;
}

if (!fs.existsSync(PICTURES_DIR)) {
  fs.mkdirSync(PICTURES_DIR, { recursive: true });
}

/** Immediate subfolders of Pictures/ (for UI picker). */
app.get("/api/pictures/folders", (req, res) => {
  try {
    if (!fs.existsSync(PICTURES_DIR)) {
      return res.json({ folders: [] });
    }
    const names = fs.readdirSync(PICTURES_DIR);
    const folders = names
      .filter((n) => {
        if (n === "." || n === "..") return false;
        const p = path.join(PICTURES_DIR, n);
        try {
          return fs.statSync(p).isDirectory();
        } catch {
          return false;
        }
      })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    res.json({ folders });
  } catch (e) {
    console.error("pictures folders:", e);
    res.status(500).json({ error: "Folders list failed" });
  }
});

app.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const stripe = getStripe();
    const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !whSecret) {
      return res.status(503).send("Stripe webhook not configured");
    }
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        whSecret
      );
    } catch (err) {
      console.error("Stripe webhook signature:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const eid = session.metadata && session.metadata.entitlement_id;
      if (eid) {
        dataStore.markDownloadEntitlementPaid(eid, session.id);
      }
    }
    res.json({ received: true });
  }
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post("/api/auth/register", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({ error: "Username must be 3–50 characters" });
    }
    if (/\s/.test(username)) {
      return res.status(400).json({ error: "Username must not contain spaces" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const out = dataStore.createUser({ username, passwordHash });
    if (!out.ok) {
      return res.status(409).json({ error: "That username is already taken" });
    }
    const token = jwt.sign({ sub: out.user.id }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES,
    });
    res.json({ token, user: out.user });
  } catch (e) {
    console.error("register:", e);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    const user = dataStore.findUserByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    const token = jwt.sign({ sub: user.id }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES,
    });
    res.json({
      token,
      user: { id: user.id, username: user.username },
    });
  } catch (e) {
    console.error("login:", e);
    res.status(500).json({ error: "Sign-in failed" });
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = dataStore.findUserById(req.userId);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }
  res.json({ user: { id: user.id, username: user.username } });
});

app.get("/api/saved-calendars", requireAuth, (req, res) => {
  res.json({ calendars: dataStore.listSavedCalendars(req.userId) });
});

app.get("/api/saved-calendars/:id", requireAuth, (req, res) => {
  const c = dataStore.getSavedCalendar(req.userId, req.params.id);
  if (!c) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json({ calendar: publicCalendar(c) });
});

app.post("/api/saved-calendars", requireAuth, (req, res) => {
  try {
    const record = dataStore.upsertSavedCalendar(req.userId, {
      ...req.body,
      id: undefined,
    });
    res.json({ calendar: publicCalendar(record) });
  } catch (e) {
    console.error("save calendar:", e);
    res.status(500).json({ error: "Could not save" });
  }
});

app.put("/api/saved-calendars/:id", requireAuth, (req, res) => {
  try {
    const existing = dataStore.getSavedCalendar(req.userId, req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Not found" });
    }
    const record = dataStore.upsertSavedCalendar(req.userId, {
      ...req.body,
      id: req.params.id,
    });
    res.json({ calendar: publicCalendar(record) });
  } catch (e) {
    console.error("update calendar:", e);
    res.status(500).json({ error: "Could not update" });
  }
});

app.delete("/api/saved-calendars/:id", requireAuth, (req, res) => {
  const ok = dataStore.deleteSavedCalendar(req.userId, req.params.id);
  if (!ok) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json({ ok: true });
});

app.get("/api/pictures/list", (req, res) => {
  try {
    const folder =
      typeof req.query.folder === "string"
        ? req.query.folder.trim().replace(/^[/\\]+|[/\\]+$/g, "")
        : "";
    const dir = resolveUnderPictures(folder || ".");
    if (!dir || !fs.existsSync(dir)) {
      return res.json({ files: [] });
    }
    if (!fs.statSync(dir).isDirectory()) {
      return res.status(400).json({ error: "Not a directory" });
    }
    const prefix = folder ? folder.replace(/\\/g, "/") : "";
    let files = listImageFilesDirect(dir, prefix);
    // If this folder has no loose images, search nested subfolders (common on Linux deployments).
    if (files.length === 0) {
      const maxDepth = Number.parseInt(process.env.PICTURES_SCAN_MAX_DEPTH || "", 10);
      const depth = Number.isFinite(maxDepth) && maxDepth > 0 ? maxDepth : 12;
      files = collectImageFilesBfs(dir, prefix, depth, 800);
    }
    res.json({ files });
  } catch (e) {
    console.error("pictures list:", e);
    res.status(500).json({ error: "List failed" });
  }
});

app.get("/api/pictures/raw", (req, res) => {
  const rel = req.query.path;
  if (typeof rel !== "string" || !rel.trim()) {
    return res.status(400).send("Missing path");
  }
  const full = resolveUnderPictures(rel.trim().replace(/\\/g, "/"));
  if (!full || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return res.status(404).send("Not found");
  }
  if (!IMAGE_EXT.has(path.extname(full).toLowerCase())) {
    return res.status(400).send("Invalid type");
  }
  res.sendFile(path.resolve(full), (err) => {
    if (err) {
      console.error(err);
      if (!res.headersSent) res.status(500).end();
    }
  });
});

/** Column index 0–6 within a week row; true for Saturday & Sunday (column depends on weekStart). */
function isWeekendColumn(col, weekStart) {
  if (weekStart === "monday") return col === 5 || col === 6;
  return col === 0 || col === 6;
}

function generateCalendar(year, month, weekStart = "sunday") {
  const date = new Date(year, month, 1);
  const days = [];

  let firstDay = date.getDay(); // 0=Sun, 1=Mon, ...
  if (weekStart === "monday") {
    firstDay = firstDay === 0 ? 6 : firstDay - 1; // Mon=0, Sun=6
  }
  const lastDate = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    days.push("");
  }

  for (let d = 1; d <= lastDate; d++) {
    days.push(d);
  }

  return days;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseHolidayCalendarsFromBody(body) {
  let raw = body && body.holidayCalendars;
  if (raw == null) return [];
  if (Array.isArray(raw)) return parseHolidayCalendarsList(raw);
  if (typeof raw === "string") {
    try {
      return parseHolidayCalendarsList(JSON.parse(raw || "[]"));
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Small inline SVG before holiday name (~1em). Colours: Jewish blue, Muslim green, Orthodox orange, Catholic dark Latin, plain black, USA blue, Buddhist gold wheel.
 */
function holidayIconHtml(source) {
  const s = String(source || "simple");
  const a =
    "class=\"holiday-ico-svg\" width=\"0.9em\" height=\"0.9em\" style=\"display:inline-block;vertical-align:-0.1em;margin-right:0.2em;flex-shrink:0\" focusable=\"false\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\"";
  if (s === "jewish") {
    return `<span class="holiday-ico"><svg ${a} viewBox="0 0 16 16"><path fill="#3b82f6" d="M8 0.5L14.5 11.3H1.5L8 0.5zM8 15.5L1.5 4.7h13L8 15.5z"/></svg></span>`;
  }
  if (s === "muslim") {
    return `<span class="holiday-ico"><svg ${a} viewBox="0 0 24 24"><path fill="#16a34a" d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg></span>`;
  }
  if (s === "orthodox") {
    return `<span class="holiday-ico"><svg ${a} viewBox="0 0 16 16" fill="none" stroke="#f97316" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="0.5" x2="8" y2="15.5" /><line x1="3" y1="1.5" x2="13" y2="1.5" /><line x1="1" y1="4.2" x2="15" y2="4.2" /><line x1="9.2" y1="8.2" x2="12.2" y2="11.2" /><line x1="4" y1="10.2" x2="12" y2="10.2" /></svg></span>`;
  }
  if (s === "catholic") {
    return `<span class="holiday-ico"><svg ${a} viewBox="0 0 16 16" fill="none" stroke="#1e3a5f" stroke-width="1.4" stroke-linecap="round"><line x1="8" y1="0.5" x2="8" y2="15.5" /><line x1="0.5" y1="3" x2="15.5" y2="3" /></svg></span>`;
  }
  if (s === "simple") {
    return `<span class="holiday-ico"><svg ${a} viewBox="0 0 16 16" fill="none" stroke="#0a0a0a" stroke-width="1.3" stroke-linecap="round"><line x1="8" y1="1" x2="8" y2="15" /><line x1="1" y1="8" x2="15" y2="8" /></svg></span>`;
  }
  if (s === "usa") {
    return `<span class="holiday-ico"><svg ${a} viewBox="0 0 16 16"><path fill="#1d4ed8" d="M8 1.2l1.75 2.1 2.1.15-1.55 1.25.45 2.1-1.7-.95-1.7.95.45-2.1-1.55-1.25 2.1-.15L8 1.2z"/></svg></span>`;
  }
  if (s === "buddhist") {
    return `<span class="holiday-ico"><svg ${a} viewBox="0 0 16 16" fill="none" stroke="#d97706" stroke-width="1.05"><circle cx="8" cy="8" r="6.2" /><line x1="8" y1="1.8" x2="8" y2="14.2" /><line x1="1.8" y1="8" x2="14.2" y2="8" /><line x1="2.7" y1="2.7" x2="13.3" y2="13.3" /><line x1="13.3" y1="2.7" x2="2.7" y2="13.3" /><circle cx="8" cy="8" r="0.8" fill="#d97706" stroke="none"/></svg></span>`;
  }
  return holidayIconHtml("simple");
}

/**
 * @param {Array<{ date: string, occasion: string }>} userDayEvents
 * @param {string} monthDayKey MM-DD
 * @param {Map<string, { name: string, isHoliday: boolean, source?: string }[]>} holidayMap
 */
function buildEventHtmlForCell(userDayEvents, monthDayKey, holidayMap) {
  const lines = [];
  if (userDayEvents && userDayEvents.length) {
    userDayEvents.forEach((e) => {
      const y = String(e.date).split("-")[0];
      const parts = String(e.occasion || "")
        .split(/\s*;\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      parts.forEach((chunk) => {
        const line = y ? `${chunk} (${y})` : chunk;
        lines.push({ text: line, isHoliday: false, source: null });
      });
    });
  }
  const seen = new Set(lines.map((l) => l.text.toLowerCase()));
  (holidayMap.get(monthDayKey) || []).forEach((h) => {
    const n = h.name;
    if (!seen.has(n.toLowerCase())) {
      seen.add(n.toLowerCase());
      lines.push({
        text: n,
        isHoliday: true,
        source: h.source != null ? String(h.source) : "simple",
      });
    }
  });
  if (lines.length === 0) return "";
  return lines
    .map((l) => {
      const t = escapeHtml(l.text);
      if (l.isHoliday) {
        const ico = holidayIconHtml(/** @type {string} */(l.source));
        return `<span class="event-line event-line--holiday">${ico}<span class="holiday-label">${t}</span></span>`;
      }
      return `<span class="event-line event-line--user">${t}</span>`;
    })
    .join("<br />");
}

function guessMime(p) {
  const ext = path.extname(p || "").toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
  };
  return map[ext] || "image/jpeg";
}

/**
 * Max width/height (px) for photos embedded in the PDF HTML. Smaller = less RAM in Node + Chromium
 * (Render free tier is tight). Override: PDF_IMAGE_MAX_EDGE=1200
 */
function pdfImageMaxEdgePx() {
  const n = Number.parseInt(process.env.PDF_IMAGE_MAX_EDGE || "", 10);
  if (Number.isFinite(n) && n >= 480 && n <= 4000) return n;
  return 1600;
}

function pdfJpegQuality() {
  const n = Number.parseInt(process.env.PDF_JPEG_QUALITY || "", 10);
  if (Number.isFinite(n) && n >= 55 && n <= 95) return n;
  return 82;
}

function pdfImageOptimizeDisabled() {
  return /^1|true|yes$/i.test(String(process.env.PDF_SKIP_IMAGE_OPTIMIZE || "").trim());
}

/**
 * Downscale and recompress images before base64-inlining — avoids OOM on small hosts when
 * users upload multi‑MB photos (multer allows up to 40MB per file).
 * @param {import("multer").File} file
 * @returns {Promise<string | null>} data URL or null
 */
async function fileToPdfDataUrl(file) {
  if (!file || typeof file.path !== "string" || !fs.existsSync(file.path)) return null;
  const mime0 =
    file.mimetype && file.mimetype !== "application/octet-stream"
      ? file.mimetype
      : guessMime(file.originalname || file.path);
  if (pdfImageOptimizeDisabled()) {
    try {
      const buf = fs.readFileSync(file.path);
      return `data:${mime0};base64,${buf.toString("base64")}`;
    } catch (e) {
      console.error("Photo read error:", e.message);
      return null;
    }
  }
  const edge = pdfImageMaxEdgePx();
  const quality = pdfJpegQuality();
  try {
    const buf = await sharp(file.path)
      .rotate()
      .resize({
        width: edge,
        height: edge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:2:0" })
      .toBuffer();
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch (e) {
    console.error("PDF image optimize failed, using original:", e?.message || e);
    try {
      const buf = fs.readFileSync(file.path);
      return `data:${mime0};base64,${buf.toString("base64")}`;
    } catch (e2) {
      console.error("Photo read error:", e2.message);
      return null;
    }
  }
}

/** Build 12 slots (one per month) sequentially to limit peak memory vs Promise.all. */
async function buildPdfImageDataUrls(rawFiles) {
  const out = /** @type {(string | null)[]} */ (new Array(12).fill(null));
  for (let i = 0; i < 12; i++) {
    const f = rawFiles.find((x) => x.fieldname === `images_${i}`);
    if (!f) continue;
    out[i] = await fileToPdfDataUrl(f);
  }
  return out;
}

/** Chromium blocks file:// in setContent(); embed as data URL so PDF shows full photos */
function getPhotoMarkupFromDataUrl(dataUrl, layoutMode) {
  const inline = layoutMode === "portrait-single";
  const imgClass = inline ? "photo photo--inline" : "photo photo--spread";
  const phClass = inline ? "photo-placeholder photo--inline" : "photo-placeholder photo--spread";
  if (dataUrl) {
    return `<img src="${dataUrl}" class="${imgClass}" alt="" />`;
  }
  return `<div class="${phClass}" role="img" aria-label="No photo">No photo</div>`;
}

const PDF_MONTH_CHUNK_COUNT = 6;
const PDF_MONTHS_PER_CHUNK = 2;

/**
 * HTML for months at positions k in [kFrom, kToExclusive) (0 = first month of the calendar year;
 * aligns with multer field images_0 … images_11).
 */
function buildCalendarMonthsHtmlFragment(
  kFrom,
  kToExclusive,
  startMonth,
  startYear,
  weekStart,
  layoutMode,
  dateNumberSize,
  monthNames,
  weekDayNames,
  eventsByMonthDay,
  holidaySelected,
  datesFont,
  monthFont,
  weekDaysFont,
  dateNumberMm,
  datePosClass,
  imageDataUrls
) {
  let monthsHtml = "";
  for (let k = kFrom; k < kToExclusive; k++) {
    const offset = startMonth - 1 + k;
    const monthIndex = offset % 12;
    const pageYear = startYear + Math.floor(offset / 12);
    const days = generateCalendar(pageYear, monthIndex, weekStart);
    const holidayMap = getHolidayMapForYear(pageYear, holidaySelected);
    const numWeeks = Math.ceil(days.length / 7);

    let grid = `<div class="cal-month-grid">`;
    grid += `<div class="cal-row cal-row--dow">`;
    weekDayNames.forEach((name, col) => {
      const wk = isWeekendColumn(col, weekStart);
      const cls = wk
        ? "cell cell-header cell-header--weekend"
        : "cell cell-header";
      grid += `<div class="${cls}" style="font-family: ${weekDaysFont}, sans-serif">${name}</div>`;
    });
    grid += `</div>`;

    for (let w = 0; w < numWeeks; w++) {
      grid += `<div class="cal-row">`;
      for (let c = 0; c < 7; c++) {
        const idx = w * 7 + c;
        const day = days[idx] ?? "";
        const wk = isWeekendColumn(c, weekStart);
        const cellCls = `${wk ? "cell cell--weekend" : "cell"} ${datePosClass}`;
        let eventHtml = "";
        if (day !== "") {
          const monthDayKey = `${String(monthIndex + 1).padStart(2, "0")}-${String(
            day
          ).padStart(2, "0")}`;
          const userEvs = eventsByMonthDay[monthDayKey] || [];
          eventHtml = buildEventHtmlForCell(userEvs, monthDayKey, holidayMap);
        }
        grid += `
          <div class="${cellCls}" style="font-family: ${datesFont}, sans-serif">
            <div class="cell-day-top">
              <div class="date" style="font-size: ${dateNumberMm}mm; font-family: ${datesFont}, sans-serif">${day || ""}</div>
            </div>
            <div class="event">${eventHtml}</div>
          </div>
        `;
      }
      grid += `</div>`;
    }
    grid += `</div>`;

    if (layoutMode === "portrait-single") {
      const combinedClass =
        dateNumberSize === 5
          ? "page page--month-combined page--date-size-5-combined"
          : "page page--month-combined";
      monthsHtml += `
        <div class="${combinedClass}">
          <div class="month-combined-photo">${getPhotoMarkupFromDataUrl(imageDataUrls[k], layoutMode)}</div>
          <h2 class="month-combined-title" style="font-family: ${monthFont}, serif">${monthNames[monthIndex]} ${pageYear}</h2>
          <div class="cal-month-grid-root">${grid}</div>
        </div>
      `;
    } else {
      const calendarPageClass =
        dateNumberSize === 5
          ? "page page--month-calendar page--date-size-5"
          : "page page--month-calendar";
      monthsHtml += `
        <div class="page page--month-photo">
          <div class="month-photo-area">${getPhotoMarkupFromDataUrl(imageDataUrls[k], layoutMode)}</div>
          <h2 class="month-spread-title" style="font-family: ${monthFont}, serif">${monthNames[monthIndex]} ${pageYear}</h2>
        </div>
        <div class="${calendarPageClass}">
          <div class="cal-month-grid-root">${grid}</div>
        </div>
      `;
    }
  }
  return monthsHtml;
}

/**
 * @param {Record<string, unknown>} body
 * @param {import("multer").File[]} rawFiles
 * @returns {Promise<Buffer>}
 */
async function generateCalendarPdfBuffer(body, rawFiles) {
  const year = parseInt(body.year, 10);
  const startYear = Number.isFinite(year) ? year : new Date().getFullYear();
  let startMonth = parseInt(body.startMonth, 10);
  if (!Number.isFinite(startMonth) || startMonth < 1 || startMonth > 12) {
    startMonth = 1;
  }
  const weekStart = body.weekStart || "sunday";
  const layoutMode =
    body.layoutMode === "portrait-single"
      ? "portrait-single"
      : "landscape-spread";
  const bodyClass =
    layoutMode === "portrait-single"
      ? "pdf-layout-portrait-single"
      : "pdf-layout-landscape-spread";
  const monthFont = body.monthFont || "Arial";
  const weekDaysFont = body.weekDaysFont || "Arial";
  const datesFont = body.datesFont || "Arial";
  const dateNumberSize = parseDateNumberSize(body);
  const dateNumberMm = DATE_NUMBER_FONT_MM[dateNumberSize];
  const dateNumberPosition = normalizeDateNumberPosition(body.dateNumberPosition);
  const datePosClass = `date-pos-${dateNumberPosition}`;
  const imageDataUrls = await buildPdfImageDataUrls(rawFiles);
  let eventsInput = [];
  try {
    const parsed = JSON.parse(String(body.events || "[]"));
    eventsInput = Array.isArray(parsed) ? parsed : [];
  } catch {
    eventsInput = [];
  }
  const eventsByMonthDay = {};

  eventsInput.forEach((ev) => {
    if (ev && ev.date && ev.occasion) {
      const [y, m, d] = String(ev.date).split("-");
      if (m && d) {
        const key = `${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        if (!eventsByMonthDay[key]) eventsByMonthDay[key] = [];
        eventsByMonthDay[key].push({ date: ev.date, occasion: ev.occasion });
      }
    }
  });

  const holidaySelected = parseHolidayCalendarsFromBody(body);

  const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const weekDayNames =
    weekStart === "monday"
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const launchOpts = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const pdfTimeout =
    Number.parseInt(process.env.PDF_GENERATION_TIMEOUT_MS || "", 10) || 120000;

  const browser = await puppeteer.launch(launchOpts);
  try {
    const mergedPdf = await PDFDocument.create();
    for (let c = 0; c < PDF_MONTH_CHUNK_COUNT; c++) {
      const kFrom = c * PDF_MONTHS_PER_CHUNK;
      const kTo = kFrom + PDF_MONTHS_PER_CHUNK;
      const monthsHtml = buildCalendarMonthsHtmlFragment(
        kFrom,
        kTo,
        startMonth,
        startYear,
        weekStart,
        layoutMode,
        dateNumberSize,
        monthNames,
        weekDayNames,
        eventsByMonthDay,
        holidaySelected,
        datesFont,
        monthFont,
        weekDaysFont,
        dateNumberMm,
        datePosClass,
        imageDataUrls
      );
      const finalHtml = template
        .replace("{{bodyClass}}", bodyClass)
        .replace("{{content}}", monthsHtml);

      const page = await browser.newPage();
      try {
        await page.setContent(finalHtml, {
          waitUntil: "load",
          timeout: pdfTimeout,
        });
        const chunkBuf = await page.pdf({
          format: "A4",
          landscape: layoutMode === "landscape-spread",
          printBackground: true,
        });
        const donor = await PDFDocument.load(chunkBuf);
        const copied = await mergedPdf.copyPages(donor, donor.getPageIndices());
        copied.forEach((p) => mergedPdf.addPage(p));
      } finally {
        try {
          await page.close();
        } catch {
          /* ignore */
        }
      }
    }
    const outBytes = await mergedPdf.save();
    return Buffer.from(outBytes);
  } finally {
    try {
      await browser.close();
    } catch {
      /* ignore */
    }
  }
}

app.post("/generate", upload.any(), async (_req, res) => {
  res.status(403).json({
    error:
      "Direct PDF generation is disabled. Complete checkout to download your calendar.",
  });
});

const FREE_PDF_JOBS_DIR = path.join(UPLOADS_DIR, "free-pdf-jobs");

/** @type {Map<string, { status: string, error?: string, pdfPath?: string, createdAt: number }>} */
const freePdfJobs = new Map();

function cleanupFreePdfJobs() {
  const maxAge = 40 * 60 * 1000;
  const now = Date.now();
  for (const [id, job] of freePdfJobs) {
    if (now - job.createdAt < maxAge) continue;
    try {
      if (job.pdfPath && fs.existsSync(job.pdfPath)) fs.unlinkSync(job.pdfPath);
    } catch {
      /* ignore */
    }
    freePdfJobs.delete(id);
  }
}

async function runFreePdfJob(jobId, body, rawFiles) {
  try {
    const pdfBuffer = await generateCalendarPdfBuffer(body, rawFiles);
    fs.mkdirSync(FREE_PDF_JOBS_DIR, { recursive: true });
    const pdfPath = path.join(FREE_PDF_JOBS_DIR, `${jobId}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);
    const job = freePdfJobs.get(jobId);
    if (job) {
      job.status = "ready";
      job.pdfPath = pdfPath;
    }
  } catch (err) {
    const e = /** @type {Error} */ (err);
    const job = freePdfJobs.get(jobId);
    if (job) {
      job.status = "failed";
      job.error = String(e?.message || "failed").slice(0, 500);
    }
    console.error("Free PDF async job error:", jobId, e?.message);
  } finally {
    rawFiles.forEach((f) => {
      try {
        if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
      } catch {
        /* ignore */
      }
    });
  }
}

/**
 * Start free PDF in the background — responds immediately (202) so proxies (e.g. Cloudflare ~100s) do not 502.
 * Poll GET /api/calendar/free-generate/jobs/:id then GET .../pdf when status is ready.
 * Note: in-memory jobs — use a single Render instance or sticky sessions; multiple instances need Redis etc.
 */
app.post(
  "/api/calendar/free-generate-async",
  upload.fields(calendarImageFields),
  (req, res) => {
    cleanupFreePdfJobs();
    const jobId = crypto.randomUUID();
    const filesObj = req.files || {};
    const rawFiles = [];
    for (let i = 0; i < 12; i++) {
      const arr = filesObj[`images_${i}`];
      const f = Array.isArray(arr) && arr[0] ? arr[0] : null;
      if (f) rawFiles.push(f);
    }
    const body = { ...(req.body || {}) };
    freePdfJobs.set(jobId, { status: "pending", createdAt: Date.now() });
    void runFreePdfJob(jobId, body, rawFiles);
    return res.status(202).json({
      jobId,
      pollUrl: `/api/calendar/free-generate/jobs/${jobId}`,
      pdfUrl: `/api/calendar/free-generate/jobs/${jobId}/pdf`,
    });
  }
);

app.get("/api/calendar/free-generate/jobs/:id", (req, res) => {
  const job = freePdfJobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  if (job.status === "pending") {
    return res.json({ status: "pending" });
  }
  if (job.status === "failed") {
    return res.json({ status: "failed", error: job.error || "Could not generate free PDF" });
  }
  return res.json({ status: "ready" });
});

app.get("/api/calendar/free-generate/jobs/:id/pdf", (req, res) => {
  const job = freePdfJobs.get(req.params.id);
  if (!job || job.status !== "ready" || !job.pdfPath) {
    return res.status(404).send("PDF not ready");
  }
  if (!fs.existsSync(job.pdfPath)) {
    return res.status(404).send("PDF missing");
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="calendar-free.pdf"'
  );
  res.sendFile(path.resolve(job.pdfPath), (err) => {
    if (err) {
      console.error("send free pdf:", err);
      if (!res.headersSent) res.status(500).end();
    }
  });
});

app.post(
  "/api/calendar/free-generate",
  upload.fields(calendarImageFields),
  async (req, res) => {
    const filesObj = req.files || {};
    const rawFiles = [];
    for (let i = 0; i < 12; i++) {
      const arr = filesObj[`images_${i}`];
      const f = Array.isArray(arr) && arr[0] ? arr[0] : null;
      if (f) rawFiles.push(f);
    }
    try {
      const pdfBuffer = await generateCalendarPdfBuffer(req.body || {}, rawFiles);
      const filename = `calendar-free-${Date.now()}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      return res.send(pdfBuffer);
    } catch (err) {
      const e = /** @type {Error} */ (err);
      const raw = String(e?.message || "unknown");
      console.error("Free PDF generation error:", {
        message: raw,
        stack: e?.stack,
        year: req?.body?.year,
        startMonth: req?.body?.startMonth,
      });
      let hint = raw.slice(0, 400);
      if (/Could not find Chrome|Failed to launch|chromium/i.test(raw)) {
        hint =
          "PDF engine (Chrome/Chromium) failed to start on the server. " +
          "Install Chromium or set PUPPETEER_EXECUTABLE_PATH to a Chrome binary. " +
          `Details: ${raw.slice(0, 200)}`;
      }
      return res.status(500).json({ error: hint || "Could not generate free PDF" });
    } finally {
      rawFiles.forEach((f) => {
        try {
          if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
        } catch {
          /* ignore cleanup errors */
        }
      });
    }
  }
);

app.post(
  "/api/checkout/calendar-session",
  assignCalendarEntitlementId,
  calendarEntitlementUpload.fields(calendarImageFields),
  async (req, res) => {
    const stripe = getStripe();
    const entitlementId = req.calendarEntitlementId;
    if (!stripe) {
      return res.status(503).json({
        error:
          "Stripe secret key is missing. Set STRIPE_SECRET_KEY in the environment or in a root .env file (see Stripe Dashboard → Developers → API keys).",
      });
    }
    try {
      const filesObj = req.files || {};
      const imageFilenames = [];
      for (let i = 0; i < 12; i++) {
        const arr = filesObj[`images_${i}`];
        const f = Array.isArray(arr) && arr[0] ? arr[0] : null;
        imageFilenames[i] = f ? path.basename(f.path) : null;
      }

      let resolvedPriceId = "";
      try {
        resolvedPriceId = await resolveCheckoutPriceId(
          stripe,
          req.body.lookup_key
        );
      } catch (lookupErr) {
        const le = /** @type {Error} */ (lookupErr);
        return res.status(400).json({ error: le.message || "Invalid lookup_key" });
      }

      if (!resolvedPriceId && !STRIPE_PRODUCT_ID) {
        return res.status(400).json({
          error:
            "Stripe is not configured for checkout. In the project root .env set one of: " +
            "(1) STRIPE_PRICE_ID from the same Test/Live mode as your secret key, " +
            "(2) STRIPE_PRICE_LOOKUP_KEY (and optional VITE_STRIPE_PRICE_LOOKUP_KEY on the client), or " +
            "(3) STRIPE_PRODUCT_ID plus STRIPE_UNIT_AMOUNT_CENTS for inline pricing.",
        });
      }

      const payload = {
        year: req.body.year,
        startMonth: req.body.startMonth,
        weekStart: req.body.weekStart,
        layoutMode: req.body.layoutMode,
        monthFont: req.body.monthFont,
        weekDaysFont: req.body.weekDaysFont,
        datesFont: req.body.datesFont,
        datesFontSize: req.body.datesFontSize,
        dateNumberPosition: normalizeDateNumberPosition(req.body.dateNumberPosition),
        holidayCalendars: parseHolidayCalendarsFromBody(req.body),
        events: req.body.events || "[]",
      };

      dataStore.createDownloadEntitlement({
        id: entitlementId,
        payload,
        imageFilenames,
      });

      const returnBase = pickCheckoutReturnBase(req.body.clientAppOrigin);
      const sessionBase = {
        mode: "payment",
        metadata: {
          entitlement_id: entitlementId,
          stripe_product_id: STRIPE_PRODUCT_ID || "",
        },
        success_url: `${returnBase}/calendar?checkout=success&entitlement_id=${encodeURIComponent(entitlementId)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${returnBase}/calendar?checkout=cancel`,
      };

      let session;
      if (resolvedPriceId) {
        try {
          session = await stripe.checkout.sessions.create({
            ...sessionBase,
            line_items: [{ price: resolvedPriceId, quantity: 1 }],
          });
        } catch (priceErr) {
          const pmsg = String(/** @type {Error} */ (priceErr)?.message || "");
          const noSuchPrice = /No such price/i.test(pmsg);
          if (!noSuchPrice || !STRIPE_PRODUCT_ID) throw priceErr;
          session = await stripe.checkout.sessions.create({
            ...sessionBase,
            line_items: checkoutLineItemsFromPriceData(),
          });
        }
      } else {
        session = await stripe.checkout.sessions.create({
          ...sessionBase,
          line_items: checkoutLineItemsFromPriceData(),
        });
      }

      return res.json({ url: session.url, entitlementId });
    } catch (err) {
      const e = /** @type {Error} */ (err);
      const msg = String(e?.message || "");
      const noSuchPrice = /No such price:\s*'([^']+)'/i.exec(msg);
      if (noSuchPrice) {
        return res.status(400).json({
          error:
            `Stripe cannot find price ${noSuchPrice[1]} for this secret key (wrong account or Test/Live mismatch). ` +
            "Fix STRIPE_PRICE_ID in .env or remove it and use STRIPE_PRODUCT_ID + STRIPE_UNIT_AMOUNT_CENTS.",
        });
      }
      const noSuchProduct = /No such product/i.test(msg);
      if (noSuchProduct) {
        return res.status(400).json({
          error:
            "Stripe cannot find STRIPE_PRODUCT_ID for this secret key. Use a product id from the same Stripe account and mode as STRIPE_SECRET_KEY.",
        });
      }
      console.error("Checkout session error:", {
        message: e?.message,
        stack: e?.stack,
        layoutMode: req?.body?.layoutMode,
        year: req?.body?.year,
        startMonth: req?.body?.startMonth,
        entitlementId,
      });
      return res.status(500).json({ error: "Could not start checkout" });
    }
  }
);

app.post("/create-checkout-session", express.urlencoded({ extended: true }), async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({
      error:
        "Stripe secret key is missing. Set STRIPE_SECRET_KEY in .env.",
    });
  }
  try {
    let priceId = "";
    try {
      priceId = await resolveCheckoutPriceId(stripe, req.body.lookup_key);
    } catch (lookupErr) {
      const le = /** @type {Error} */ (lookupErr);
      return res.status(400).json({ error: le.message || "Invalid lookup_key" });
    }
    if (!priceId && !STRIPE_PRODUCT_ID) {
      return res.status(400).json({
        error:
          "No Stripe price configured. Set STRIPE_PRICE_ID or STRIPE_PRICE_LOOKUP_KEY, or STRIPE_PRODUCT_ID + STRIPE_UNIT_AMOUNT_CENTS.",
      });
    }
    const returnBase = pickCheckoutReturnBase(req.body.clientAppOrigin);
    const sessionBase = {
      mode: "payment",
      success_url: `${returnBase}/calendar?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnBase}/calendar?checkout=cancel`,
    };
    let session;
    if (priceId) {
      try {
        session = await stripe.checkout.sessions.create({
          ...sessionBase,
          line_items: [{ price: priceId, quantity: 1 }],
        });
      } catch (priceErr) {
        const pmsg = String(/** @type {Error} */ (priceErr)?.message || "");
        if (!/No such price/i.test(pmsg) || !STRIPE_PRODUCT_ID) throw priceErr;
        session = await stripe.checkout.sessions.create({
          ...sessionBase,
          line_items: checkoutLineItemsFromPriceData(),
        });
      }
    } else {
      session = await stripe.checkout.sessions.create({
        ...sessionBase,
        line_items: checkoutLineItemsFromPriceData(),
      });
    }
    return res.redirect(303, session.url);
  } catch (err) {
    const e = /** @type {Error} */ (err);
    return res.status(400).json({ error: e.message || "Checkout failed" });
  }
});

/** Paid-session summary for UI after Checkout redirect (does not consume download). */
app.get("/api/calendar/checkout-summary", async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({
      error:
        "Stripe secret key is missing. Set STRIPE_SECRET_KEY in the environment or in a root .env file (see Stripe Dashboard → Developers → API keys).",
    });
  }
  const sessionId = req.query.session_id;
  const entitlementId = req.query.entitlement_id;
  if (
    typeof sessionId !== "string" ||
    typeof entitlementId !== "string" ||
    !sessionId ||
    !entitlementId
  ) {
    return res.status(400).json({ error: "Missing session_id or entitlement_id" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(402).json({ error: "Payment not completed" });
    }
    const metaEid = session.metadata && session.metadata.entitlement_id;
    if (metaEid !== entitlementId) {
      return res.status(403).json({ error: "Session does not match entitlement" });
    }
    const amountTotal =
      typeof session.amount_total === "number" ? session.amount_total : null;
    const currency =
      typeof session.currency === "string" ? session.currency : "usd";
    return res.json({ amountTotal, currency });
  } catch (err) {
    const e = /** @type {Error} */ (err);
    console.error("Checkout summary error:", {
      message: e?.message,
      stack: e?.stack,
      entitlementId,
      sessionId,
    });
    return res.status(500).json({ error: "Could not load payment summary" });
  }
});

app.get("/api/calendar/download", async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({
      error:
        "Stripe secret key is missing. Set STRIPE_SECRET_KEY in the environment or in a root .env file (see Stripe Dashboard → Developers → API keys).",
    });
  }
  const sessionId = req.query.session_id;
  const entitlementId = req.query.entitlement_id;
  if (
    typeof sessionId !== "string" ||
    typeof entitlementId !== "string" ||
    !sessionId ||
    !entitlementId
  ) {
    return res.status(400).json({ error: "Missing session_id or entitlement_id" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(402).json({ error: "Payment not completed" });
    }
    const metaEid =
      session.metadata && session.metadata.entitlement_id;
    if (metaEid !== entitlementId) {
      return res.status(403).json({ error: "Session does not match entitlement" });
    }

    const ent = dataStore.getDownloadEntitlement(entitlementId);
    if (!ent) {
      return res.status(404).json({ error: "Entitlement not found" });
    }
    if (ent.consumedAt) {
      return res.status(410).json({ error: "Download already used" });
    }

    if (!ent.paid) {
      dataStore.markDownloadEntitlementPaid(entitlementId, sessionId);
    }

    const entDir = path.join(ENTITLEMENTS_DIR, entitlementId);
    const rawFiles = [];
    for (let i = 0; i < 12; i++) {
      const fn = ent.imageFilenames[i];
      if (fn) {
        const full = path.join(entDir, fn);
        if (fs.existsSync(full)) {
          rawFiles.push({
            fieldname: `images_${i}`,
            path: full,
            originalname: fn,
            mimetype: guessMime(fn),
          });
        }
      }
    }

    const pdfBuffer = await generateCalendarPdfBuffer(ent.payload, rawFiles);

    dataStore.markDownloadEntitlementConsumed(entitlementId);

    if (fs.existsSync(entDir)) {
      try {
        fs.rmSync(entDir, { recursive: true, force: true });
      } catch (e) {
        console.error("Entitlement cleanup:", e.message);
      }
    }

    const filename = `calendar-${entitlementId.slice(0, 8)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    return res.send(pdfBuffer);
  } catch (err) {
    const e = /** @type {Error} */ (err);
    console.error("Download error:", {
      message: e?.message,
      stack: e?.stack,
      entitlementId,
      sessionId,
    });
    return res.status(500).json({ error: "Could not generate download" });
  }
});

const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) {
    return next();
  }
  const indexHtml = path.join(publicDir, "index.html");
  if (!fs.existsSync(indexHtml)) {
    return next();
  }
  res.sendFile(indexHtml);
});

const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});

// PDF generation (Puppeteer + many photos) can run several minutes; avoid premature socket close.
const HTTP_SERVER_TIMEOUT_MS =
  Number.parseInt(process.env.HTTP_SERVER_TIMEOUT_MS || "", 10) || 15 * 60 * 1000;
server.timeout = HTTP_SERVER_TIMEOUT_MS;
server.keepAliveTimeout = Math.min(120000, HTTP_SERVER_TIMEOUT_MS);
server.headersTimeout = HTTP_SERVER_TIMEOUT_MS + 5000;

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error("\nPort " + PORT + " is already in use. Another instance may be running.");
    console.error("Stop the other process or use a different port.\n");
    process.exit(1);
  }
  throw err;
});