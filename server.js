const express = require("express");
const multer = require("multer");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dataStore = require("./dataStore");

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
const upload = multer({ dest: UPLOADS_DIR });

const PICTURES_DIR = path.join(__dirname, "Pictures");
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

function resolveUnderPictures(rel) {
  if (rel === undefined || rel === null) return null;
  const sub = String(rel).trim().replace(/^[/\\]+|[/\\]+$/g, "");
  const full = path.resolve(PICTURES_DIR, sub || ".");
  const relToPic = path.relative(PICTURES_DIR, full);
  if (relToPic.startsWith("..") || path.isAbsolute(relToPic)) return null;
  return full;
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
    const names = fs.readdirSync(dir);
    const files = names
      .filter((n) => {
        const p = path.join(dir, n);
        try {
          return fs.statSync(p).isFile() && IMAGE_EXT.has(path.extname(n).toLowerCase());
        } catch {
          return false;
        }
      })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .map((n) => ({
        name: n,
        path: folder ? `${folder.replace(/\\/g, "/")}/${n}` : n,
      }));
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

/** Chromium blocks file:// in setContent(); embed as data URL so PDF shows full photos */
function getPhotoMarkup(images, index, layoutMode) {
  const inline = layoutMode === "portrait-single";
  const imgClass = inline ? "photo photo--inline" : "photo photo--spread";
  const phClass = inline ? "photo-placeholder photo--inline" : "photo-placeholder photo--spread";
  const file = images && images[index];
  if (file && typeof file.path === "string" && fs.existsSync(file.path)) {
    try {
      const buf = fs.readFileSync(file.path);
      const mime = file.mimetype && file.mimetype !== "application/octet-stream"
        ? file.mimetype
        : guessMime(file.originalname || file.path);
      const b64 = buf.toString("base64");
      const src = `data:${mime};base64,${b64}`;
      return `<img src="${src}" class="${imgClass}" alt="" />`;
    } catch (e) {
      console.error("Photo read error:", e.message);
    }
  }
  return `<div class="${phClass}" role="img" aria-label="No photo">No photo</div>`;
}

app.post("/generate", upload.any(), async (req, res) => {
  try {
    const year = parseInt(req.body.year, 10);
    const startYear = Number.isFinite(year) ? year : new Date().getFullYear();
    let startMonth = parseInt(req.body.startMonth, 10);
    if (!Number.isFinite(startMonth) || startMonth < 1 || startMonth > 12) {
      startMonth = 1;
    }
    const weekStart = req.body.weekStart || "sunday";
    const layoutMode =
      req.body.layoutMode === "portrait-single"
        ? "portrait-single"
        : "landscape-spread";
    const bodyClass =
      layoutMode === "portrait-single"
        ? "pdf-layout-portrait-single"
        : "pdf-layout-landscape-spread";
    const monthFont = req.body.monthFont || "Arial";
    const weekDaysFont = req.body.weekDaysFont || "Arial";
    const datesFont = req.body.datesFont || "Arial";
    const dateNumberSize = parseDateNumberSize(req.body);
    const dateNumberMm = DATE_NUMBER_FONT_MM[dateNumberSize];
    const rawFiles = req.files || [];
    const images = [];
    for (let i = 0; i < 12; i++) {
      const f = rawFiles.find((x) => x.fieldname === `images_${i}`);
      images[i] = f || null;
    }
    const eventsInput = JSON.parse(req.body.events || "[]");
    const eventsByMonthDay = {};

    (Array.isArray(eventsInput) ? eventsInput : []).forEach((ev) => {
      if (ev && ev.date && ev.occasion) {
        const [y, m, d] = String(ev.date).split("-");
        if (m && d) {
          const key = `${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
          if (!eventsByMonthDay[key]) eventsByMonthDay[key] = [];
          eventsByMonthDay[key].push({ date: ev.date, occasion: ev.occasion });
        }
      }
    });


    const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");

    const monthNames = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December"
    ];

    let monthsHtml = "";

    const weekDayNames = weekStart === "monday"
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let k = 0; k < 12; k++) {
      const offset = startMonth - 1 + k;
      const monthIndex = offset % 12;
      const pageYear = startYear + Math.floor(offset / 12);
      const days = generateCalendar(pageYear, monthIndex, weekStart);

      let grid = weekDayNames
        .map((name, col) => {
          const wk = isWeekendColumn(col, weekStart);
          const cls = wk ? "cell cell-header cell-header--weekend" : "cell cell-header";
          return `<div class="${cls}" style="font-family: ${weekDaysFont}, sans-serif">${name}</div>`;
        })
        .join("");

      days.forEach((day, i) => {
        const col = i % 7;
        const wk = isWeekendColumn(col, weekStart);
        const cellCls = wk ? "cell cell--weekend" : "cell";
        let eventHtml = "";
        if (day !== "") {
          const monthDayKey = `${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayEvents = eventsByMonthDay[monthDayKey] || [];
          const lines = [];
          dayEvents.forEach((e) => {
            const y = String(e.date).split("-")[0];
            const parts = String(e.occasion || "")
              .split(/\s*;\s*/)
              .map((s) => s.trim())
              .filter(Boolean);
            parts.forEach((chunk) => {
              const line = y ? `${chunk} (${y})` : chunk;
              lines.push(escapeHtml(line));
            });
          });
          // <br> prints reliably in PDF; flex stacks did not always break lines
          eventHtml = lines.join("<br />");
        }

        grid += `
          <div class="${cellCls}" style="font-family: ${datesFont}, sans-serif">
            <div class="date" style="font-size: ${dateNumberMm}mm; font-family: ${datesFont}, sans-serif">${day || ""}</div>
            <div class="event">${eventHtml}</div>
          </div>
        `;
      });

      if (layoutMode === "portrait-single") {
        const combinedClass =
          dateNumberSize === 5
            ? "page page--month-combined page--date-size-5-combined"
            : "page page--month-combined";
        monthsHtml += `
        <div class="${combinedClass}">
          <h2 class="month-combined-title" style="font-family: ${monthFont}, serif">${monthNames[monthIndex]} ${pageYear}</h2>
          <div class="month-combined-photo">${getPhotoMarkup(images, monthIndex, layoutMode)}</div>
          <div class="grid">${grid}</div>
        </div>
      `;
      } else {
        const calendarPageClass =
          dateNumberSize === 5
            ? "page page--month-calendar page--date-size-5"
            : "page page--month-calendar";
        monthsHtml += `
        <div class="page page--month-photo">
          <div class="month-photo-area">${getPhotoMarkup(images, monthIndex, layoutMode)}</div>
          <h2 class="month-spread-title" style="font-family: ${monthFont}, serif">${monthNames[monthIndex]} ${pageYear}</h2>
        </div>
        <div class="${calendarPageClass}">
          <div class="grid">${grid}</div>
        </div>
      `;
      }
    }

    const finalHtml = template
      .replace("{{bodyClass}}", bodyClass)
      .replace("{{content}}", monthsHtml);

    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    await page.setContent(finalHtml, { waitUntil: "load", timeout: 30000 });

    const pdfPath = path.join(__dirname, `calendar-${Date.now()}.pdf`);

    await page.pdf({
      path: pdfPath,
      format: "A4",
      landscape: layoutMode === "landscape-spread",
      printBackground: true,
    });

    await browser.close();

    res.download(pdfPath);

  } catch (error) {
    console.error("Calendar error:", error.message);
    console.error(error.stack);
    res.status(500).send("Error generating calendar: " + error.message);
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

const PORT = 3000;

const server = app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error("\nPort " + PORT + " is already in use. Another instance may be running.");
    console.error("Stop the other process or use a different port.\n");
    process.exit(1);
  }
  throw err;
});