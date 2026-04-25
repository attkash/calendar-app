const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_PATH = path.join(__dirname, "data", "app-data.json");

function ensureFile() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(
      DATA_PATH,
      JSON.stringify({ users: [], savedCalendars: [], downloadEntitlements: [] }, null, 2),
      "utf-8"
    );
  }
}

function load() {
  ensureFile();
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data.users)) data.users = [];
    if (!Array.isArray(data.savedCalendars)) data.savedCalendars = [];
    if (!Array.isArray(data.downloadEntitlements)) data.downloadEntitlements = [];
    return data;
  } catch (e) {
    console.error("dataStore load:", e);
    return { users: [], savedCalendars: [], downloadEntitlements: [] };
  }
}

function save(data) {
  ensureFile();
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function findUserByUsername(username) {
  const u = String(username || "").trim().toLowerCase();
  return load().users.find((x) => x.usernameLower === u);
}

function findUserById(id) {
  return load().users.find((x) => x.id === id);
}

function createUser({ username, passwordHash }) {
  const data = load();
  const name = String(username || "").trim();
  const usernameLower = name.toLowerCase();
  if (data.users.some((x) => x.usernameLower === usernameLower)) {
    return { ok: false, error: "USERNAME_TAKEN" };
  }
  const user = {
    id: crypto.randomUUID(),
    username: name,
    usernameLower,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  save(data);
  return { ok: true, user: { id: user.id, username: user.username } };
}

function listSavedCalendars(userId) {
  return load()
    .savedCalendars.filter((c) => c.userId === userId)
    .map((c) => ({
      id: c.id,
      name: c.name,
      year: c.year,
      startMonth: c.startMonth,
      updatedAt: c.updatedAt,
      createdAt: c.createdAt,
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function getSavedCalendar(userId, id) {
  const c = load().savedCalendars.find((x) => x.id === id && x.userId === userId);
  return c || null;
}

function upsertSavedCalendar(userId, payload) {
  const data = load();
  const now = new Date().toISOString();
  const id = payload.id || crypto.randomUUID();
  const existingIdx = data.savedCalendars.findIndex((x) => x.id === id && x.userId === userId);

  const record = {
    id,
    userId,
    name: String(payload.name || "Calendar").trim() || "Calendar",
    year: Number.isFinite(Number(payload.year)) ? Number(payload.year) : new Date().getFullYear(),
    startMonth: clampMonth(payload.startMonth),
    weekStart: payload.weekStart === "monday" ? "monday" : "sunday",
    yearFont: String(payload.yearFont || "Arial"),
    monthFont: String(payload.monthFont || "Arial"),
    weekDaysFont: String(payload.weekDaysFont || "Arial"),
    datesFont: String(payload.datesFont || "Arial"),
    datesFontSize: String(payload.datesFontSize || "3"),
    dateNumberPosition:
      payload.dateNumberPosition === "center" ||
      payload.dateNumberPosition === "top-center" ||
      payload.dateNumberPosition === "top-left"
        ? payload.dateNumberPosition
        : "top-left",
    holidayCalendars: Array.isArray(payload.holidayCalendars)
      ? payload.holidayCalendars.filter((x) => typeof x === "string")
      : [],
    archiveFolder: typeof payload.archiveFolder === "string" ? payload.archiveFolder : "",
    archiveReplaceAll: Boolean(payload.archiveReplaceAll),
    layoutMode:
      payload.layoutMode === "portrait-single"
        ? "portrait-single"
        : "landscape-spread",
    events: normalizeEvents(payload.events),
    updatedAt: now,
    createdAt:
      existingIdx >= 0 ? data.savedCalendars[existingIdx].createdAt : now,
  };

  if (existingIdx >= 0) {
    data.savedCalendars[existingIdx] = record;
  } else {
    data.savedCalendars.push(record);
  }
  save(data);
  return record;
}

function deleteSavedCalendar(userId, id) {
  const data = load();
  const before = data.savedCalendars.length;
  data.savedCalendars = data.savedCalendars.filter(
    (x) => !(x.id === id && x.userId === userId)
  );
  save(data);
  return data.savedCalendars.length < before;
}

function clampMonth(m) {
  const n = parseInt(m, 10);
  if (!Number.isFinite(n) || n < 1 || n > 12) return 1;
  return n;
}

function normalizeEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .filter((e) => e && (e.date || e.occasion))
    .map((e) => ({
      date: String(e.date || "").trim(),
      occasion: String(e.occasion || "").trim(),
    }))
    .filter((e) => e.date && e.occasion);
}

function createDownloadEntitlement({ id, payload, imageFilenames }) {
  const data = load();
  const now = new Date().toISOString();
  const row = {
    id,
    payload,
    imageFilenames: Array.isArray(imageFilenames) ? imageFilenames : [],
    paid: false,
    stripeSessionId: null,
    consumedAt: null,
    createdAt: now,
  };
  data.downloadEntitlements.push(row);
  save(data);
  return row;
}

function getDownloadEntitlement(id) {
  return load().downloadEntitlements.find((x) => x.id === id) || null;
}

function markDownloadEntitlementPaid(id, stripeSessionId) {
  const data = load();
  const row = data.downloadEntitlements.find((x) => x.id === id);
  if (!row) return false;
  row.paid = true;
  row.stripeSessionId = String(stripeSessionId || "");
  save(data);
  return true;
}

function markDownloadEntitlementConsumed(id) {
  const data = load();
  const row = data.downloadEntitlements.find((x) => x.id === id);
  if (!row) return false;
  row.consumedAt = new Date().toISOString();
  save(data);
  return true;
}

module.exports = {
  load,
  save,
  findUserByUsername,
  findUserById,
  createUser,
  listSavedCalendars,
  getSavedCalendar,
  upsertSavedCalendar,
  deleteSavedCalendar,
  createDownloadEntitlement,
  getDownloadEntitlement,
  markDownloadEntitlementPaid,
  markDownloadEntitlementConsumed,
};
