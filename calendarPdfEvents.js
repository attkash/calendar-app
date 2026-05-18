const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

const EMBED_MARKER = "CALENDAR_APP:v1:";
const ATTACHMENT_NAME = "calendar-app-personal-dates.json";

/**
 * @param {unknown} body
 * @param {Array<{ date?: string; occasion?: string }>} eventsInput
 */
function buildPersonalDatesPayload(body, eventsInput) {
  const year = Number.parseInt(String(body.year), 10);
  const startMonth = Number.parseInt(String(body.startMonth), 10);
  return {
    version: 1,
    app: "calendar-app",
    year: Number.isFinite(year) ? year : null,
    startMonth:
      Number.isFinite(startMonth) && startMonth >= 1 && startMonth <= 12
        ? startMonth
        : 1,
    events: (Array.isArray(eventsInput) ? eventsInput : [])
      .filter((ev) => ev && ev.date && ev.occasion)
      .map((ev) => ({
        date: String(ev.date).trim(),
        occasion: String(ev.occasion).trim(),
        ...(ev.showYears ? { showYears: true } : {}),
      })),
  };
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function decodePayloadFromMarker(value) {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw.startsWith(EMBED_MARKER)) return null;
  try {
    const json = Buffer.from(raw.slice(EMBED_MARKER.length), "base64").toString(
      "utf8"
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Embeds personal dates in PDF metadata and as a JSON attachment (readable on re-import).
 * @param {import('pdf-lib').PDFDocument} pdfDoc
 * @param {ReturnType<typeof buildPersonalDatesPayload>} payload
 */
async function embedPersonalDatesInPdf(pdfDoc, payload) {
  const encoded = EMBED_MARKER + encodePayload(payload);
  pdfDoc.setProducer("calendar-app-generator/1");
  pdfDoc.setSubject(encoded);
  pdfDoc.setKeywords([
    "calendar-app",
    "personal-dates",
    `events:${payload.events.length}`,
  ]);

  const jsonBytes = Buffer.from(JSON.stringify(payload, null, 0), "utf8");
  await pdfDoc.attach(jsonBytes, ATTACHMENT_NAME, {
    mimeType: "application/json",
    description: "Personal dates and occasions for calendar-app re-import",
  });

  const pages = pdfDoc.getPages();
  if (pages.length > 0) {
    const page = pages[0];
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText(EMBED_MARKER, {
      x: 4,
      y: 4,
      size: 1,
      font,
      color: rgb(1, 1, 1),
      opacity: 0.01,
    });
  }
}

/**
 * @param {Buffer|Uint8Array} pdfBuffer
 * @returns {Promise<{ version: number; year: number|null; startMonth: number; events: Array<{date: string; occasion: string}> }|null>}
 */
async function extractPersonalDatesFromPdf(pdfBuffer) {
  const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });

  let payload = decodePayloadFromMarker(doc.getSubject());
  if (!payload) {
    const keywords = doc.getKeywords();
    if (typeof keywords === "string") {
      payload = decodePayloadFromMarker(keywords);
    } else if (Array.isArray(keywords)) {
      for (const kw of keywords) {
        payload = decodePayloadFromMarker(kw);
        if (payload) break;
      }
    }
  }

  if (!payload || !Array.isArray(payload.events)) {
    return null;
  }

  const events = payload.events
    .filter((ev) => ev && ev.date && ev.occasion)
    .map((ev) => ({
      date: String(ev.date).trim(),
      occasion: String(ev.occasion).trim(),
      ...(ev.showYears ? { showYears: true } : {}),
    }));

  if (events.length === 0) return null;

  return {
    version: payload.version || 1,
    year: payload.year != null ? Number(payload.year) : null,
    startMonth:
      payload.startMonth != null && payload.startMonth >= 1 && payload.startMonth <= 12
        ? Number(payload.startMonth)
        : 1,
    events,
  };
}

/**
 * Map YYYY-MM-DD dates to a new calendar year (month/day preserved).
 * @param {string} isoDate
 * @param {number} targetYear
 */
function remapEventDateToYear(isoDate, targetYear) {
  const m = String(isoDate).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  return `${targetYear}-${m[2]}-${m[3]}`;
}

module.exports = {
  EMBED_MARKER,
  buildPersonalDatesPayload,
  embedPersonalDatesInPdf,
  extractPersonalDatesFromPdf,
  remapEventDateToYear,
};
