/**
 * Holiday / celebration date helpers for the PDF calendar.
 * Dates are in the proleptic Gregorian calendar for a given year.
 * Lunar / Islamic / Jewish use precomputed years for 2022–2032 (extend as needed).
 */

const CATEGORIES = new Set([
  "catholic-protestant",
  "orthodox",
  "muslim",
  "jewish",
  "buddhist",
  "usa",
]);

/** Western (Gregorian) Easter Sunday — Anonymous Gregorian algorithm */
function westernEasterSunday(y) {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = Math.floor((h + l - 7 * m + 114) / 31);
  const p = ((h + l - 7 * m + 114) % 31) + 1;
  return { month: n, day: p };
}

function addDays(y, m, d, n) {
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

const ORTHODOX_EASTER_GREGORIAN = {
  2022: [4, 24],
  2023: [4, 16],
  2024: [5, 5],
  2025: [4, 20],
  2026: [4, 12],
  2027: [5, 2],
  2028: [4, 16],
  2029: [4, 8],
  2030: [4, 28],
  2031: [4, 13],
  2032: [5, 2],
};

function lastWeekdayInMonth(y, m0, weekday) {
  const last = new Date(y, m0 + 1, 0);
  let d = last.getDate();
  while (new Date(y, m0, d).getDay() !== weekday) d--;
  return { m: m0 + 1, d };
}

function nthWeekdayInMonth(y, m0, weekday, n) {
  let c = 0;
  for (let d = 1; d <= 31; d++) {
    const t = new Date(y, m0, d);
    if (t.getMonth() !== m0) break;
    if (t.getDay() === weekday) {
      c++;
      if (c === n) return { m: m0 + 1, d };
    }
  }
  return { m: m0 + 1, d: 1 };
}

const MUSLIM_DATES = {
  2022: [
    ["05-02", "Eid al-Fitr"],
    ["07-09", "Eid al-Adha"],
  ],
  2023: [
    ["04-21", "Eid al-Fitr"],
    ["06-28", "Eid al-Adha"],
  ],
  2024: [
    ["04-10", "Eid al-Fitr"],
    ["06-16", "Eid al-Adha"],
  ],
  2025: [
    ["03-30", "Eid al-Fitr"],
    ["06-06", "Eid al-Adha"],
  ],
  2026: [
    ["03-20", "Eid al-Fitr"],
    ["05-27", "Eid al-Adha"],
  ],
  2027: [
    ["03-10", "Eid al-Fitr"],
    ["05-16", "Eid al-Adha"],
  ],
  2028: [
    ["02-27", "Eid al-Fitr"],
    ["05-05", "Eid al-Adha"],
  ],
  2029: [
    ["02-15", "Eid al-Fitr"],
    ["04-24", "Eid al-Adha"],
  ],
  2030: [
    ["02-04", "Eid al-Fitr"],
    ["04-13", "Eid al-Adha"],
  ],
  2031: [
    ["01-25", "Eid al-Fitr"],
    ["04-03", "Eid al-Adha"],
  ],
  2032: [
    ["01-14", "Eid al-Fitr"],
    ["03-22", "Eid al-Adha"],
  ],
};

const JEWISH_DATES = {
  2022: [
    ["09-25", "Rosh Hashanah (begins)"],
    ["09-27", "Rosh Hashanah"],
    ["10-04", "Yom Kippur"],
  ],
  2023: [
    ["09-15", "Rosh Hashanah (begins)"],
    ["09-16", "Rosh Hashanah"],
    ["09-24", "Yom Kippur"],
  ],
  2024: [
    ["10-02", "Rosh Hashanah (begins)"],
    ["10-04", "Rosh Hashanah"],
    ["10-11", "Yom Kippur"],
  ],
  2025: [
    ["09-22", "Rosh Hashanah (begins)"],
    ["09-23", "Rosh Hashanah"],
    ["10-01", "Yom Kippur"],
  ],
  2026: [
    ["09-11", "Rosh Hashanah (begins)"],
    ["09-12", "Rosh Hashanah"],
    ["09-20", "Yom Kippur"],
  ],
  2027: [
    ["10-01", "Rosh Hashanah (begins)"],
    ["10-02", "Rosh Hashanah"],
    ["10-10", "Yom Kippur"],
  ],
  2028: [
    ["09-20", "Rosh Hashanah (begins)"],
    ["09-21", "Rosh Hashanah"],
    ["09-29", "Yom Kippur"],
  ],
  2029: [
    ["09-09", "Rosh Hashanah (begins)"],
    ["09-10", "Rosh Hashanah"],
    ["09-18", "Yom Kippur"],
  ],
  2030: [
    ["09-28", "Rosh Hashanah (begins)"],
    ["09-29", "Rosh Hashanah"],
    ["10-07", "Yom Kippur"],
  ],
  2031: [
    ["09-17", "Rosh Hashanah (begins)"],
    ["09-18", "Rosh Hashanah"],
    ["09-26", "Yom Kippur"],
  ],
  2032: [
    ["09-04", "Rosh Hashanah (begins)"],
    ["09-06", "Rosh Hashanah"],
    ["09-14", "Yom Kippur"],
  ],
};

const BUDDHIST_DATES = {
  2022: [["05-16", "Vesak (Buddha Day)"]],
  2023: [["05-04", "Vesak (Buddha Day)"]],
  2024: [["05-22", "Vesak (Buddha Day)"]],
  2025: [["05-12", "Vesak (Buddha Day)"]],
  2026: [["05-31", "Vesak (Buddha Day)"]],
  2027: [["05-20", "Vesak (Buddha Day)"]],
  2028: [["05-08", "Vesak (Buddha Day)"]],
  2029: [["05-26", "Vesak (Buddha Day)"]],
  2030: [["05-15", "Vesak (Buddha Day)"]],
  2031: [["05-04", "Vesak (Buddha Day)"]],
  2032: [["05-22", "Vesak (Buddha Day)"]],
};

/**
 * @param {string[]} selected - subset of CATEGORIES
 * @returns {Map<string, { name: string, isHoliday: true }[]>} key = MM-DD
 */
function getHolidayMapForYear(y, selected) {
  const arr =
    selected instanceof Set
      ? Array.from(selected)
      : Array.isArray(selected)
        ? selected
        : [];
  const set = new Set(arr.filter((c) => CATEGORIES.has(c)));
  const map = new Map();
  /** @param {"usa"|"western"|"catholic"|"orthodox"|"muslim"|"jewish"|"buddhist"} source - icon in PDF */
  const add = (m, d, name, source) => {
    if (!m || !d) return;
    const key = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!map.has(key)) map.set(key, []);
    const list = map.get(key);
    if (list.some((x) => x.name === name)) return;
    list.push({ name, isHoliday: true, source });
  };

  if (set.has("usa")) {
    add(1, 1, "New Year's Day", "usa");
    const mlk = nthWeekdayInMonth(y, 0, 1, 3);
    add(mlk.m, mlk.d, "Martin Luther King Jr. Day", "usa");
    const pres = nthWeekdayInMonth(y, 1, 1, 3);
    add(pres.m, pres.d, "Presidents' Day", "usa");
    const mem = lastWeekdayInMonth(y, 4, 1);
    add(mem.m, mem.d, "Memorial Day", "usa");
    add(6, 19, "Juneteenth", "usa");
    add(7, 4, "Independence Day", "usa");
    const lab = nthWeekdayInMonth(y, 8, 1, 1);
    add(lab.m, lab.d, "Labor Day", "usa");
    const col = nthWeekdayInMonth(y, 9, 1, 2);
    add(col.m, col.d, "Columbus Day", "usa");
    add(11, 11, "Veterans Day", "usa");
    const tgx = nthWeekdayInMonth(y, 10, 4, 4);
    add(tgx.m, tgx.d, "Thanksgiving", "usa");
    add(12, 25, "Christmas Day", "usa");
  }

  if (set.has("catholic-protestant")) {
    add(1, 1, "Solemnity of Mary, Mother of God", "simple");
    const es = westernEasterSunday(y);
    const g = addDays(y, es.month, es.day, -2);
    add(g.m, g.d, "Good Friday", "catholic");
    add(es.month, es.day, "Easter Sunday", "catholic");
    const asc = addDays(y, es.month, es.day, 39);
    add(asc.m, asc.d, "Ascension Day (traditional)", "catholic");
    add(12, 25, "Christmas", "catholic");
    add(12, 26, "St. Stephen's / Boxing Day", "simple");
  }

  if (set.has("orthodox")) {
    add(1, 6, "Theophany (Orth.)", "orthodox");
    add(1, 7, "Orthodox Christmas", "orthodox");
    if (ORTHODOX_EASTER_GREGORIAN[y]) {
      const [em, ed] = ORTHODOX_EASTER_GREGORIAN[y];
      add(em, ed, "Orthodox Easter", "orthodox");
    }
  }

  if (set.has("muslim") && MUSLIM_DATES[y]) {
    for (const [md, name] of MUSLIM_DATES[y]) {
      const [mm, dd] = md.split("-").map((x) => parseInt(x, 10));
      add(mm, dd, name, "muslim");
    }
  }

  if (set.has("jewish") && JEWISH_DATES[y]) {
    for (const [md, name] of JEWISH_DATES[y]) {
      const [mm, dd] = md.split("-").map((x) => parseInt(x, 10));
      add(mm, dd, name, "jewish");
    }
  }

  if (set.has("buddhist") && BUDDHIST_DATES[y]) {
    for (const [md, name] of BUDDHIST_DATES[y]) {
      const [mm, dd] = md.split("-").map((x) => parseInt(x, 10));
      add(mm, dd, name, "buddhist");
    }
  }

  return map;
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function parseHolidayCalendarsList(raw) {
  if (Array.isArray(raw)) {
    return raw.map((c) => String(c)).filter((c) => CATEGORIES.has(c));
  }
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      const a = JSON.parse(raw);
      return Array.isArray(a) ? a.map((c) => String(c)).filter((c) => CATEGORIES.has(c)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

module.exports = {
  CATEGORIES: Array.from(CATEGORIES),
  getHolidayMapForYear,
  parseHolidayCalendarsList,
};
