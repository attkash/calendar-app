import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Upload, X, Plus, FolderOpen, RefreshCw, LayoutDashboard, Save } from 'lucide-react';
import { useAuth, authHeaders } from '../context/AuthContext';
import { requireAuth } from '../appset';
import type { DateNumberPosition, PdfLayoutMode, SavedCalendarFull } from '../types/calendar';

interface MonthPhoto {
  month: string;
  file: File | null;
  preview: string | null;
}

interface DateEvent {
  id: string;
  date: string;
  reason: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/** Approximate preview px; PDF uses mm (sizes 4–5 tied to ~14mm cell min-height in template). */
const DATE_NUMBER_SIZE_OPTIONS: { value: string; label: string; previewPx: number }[] = [
  { value: '1', label: '1 — Small', previewPx: 11 },
  { value: '2', label: '2 — Medium', previewPx: 14 },
  { value: '3', label: '3 — Large (default)', previewPx: 17 },
  { value: '4', label: '4 — Bigger (¼ cell height)', previewPx: 21 },
  { value: '5', label: '5 — Full cell height', previewPx: 30 },
];

/** Min height for the date cell in the Week & Fonts preview (screen only). */
const DATE_CELL_PREVIEW_MIN_HEIGHT: Record<string, string> = {
  '1': '3.35rem',
  '2': '3.75rem',
  '3': '4.25rem',
  '4': '5rem',
  '5': '5.75rem',
};

const DATE_POSITION_OPTIONS: { value: DateNumberPosition; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-center', label: 'Top center' },
  { value: 'center', label: 'Center of cell' },
];

const HOLIDAY_CALENDAR_OPTION_IDS = [
  'catholic-protestant',
  'orthodox',
  'muslim',
  'jewish',
  'buddhist',
  'usa',
] as const;

const HOLIDAY_CALENDAR_OPTIONS: { id: (typeof HOLIDAY_CALENDAR_OPTION_IDS)[number]; label: string }[] = [
  { id: 'catholic-protestant', label: 'Catholic & Protestant (Western)' },
  { id: 'orthodox', label: 'Orthodox Christian' },
  { id: 'muslim', label: 'Muslim' },
  { id: 'jewish', label: 'Jewish' },
  { id: 'buddhist', label: 'Buddhist' },
  { id: 'usa', label: 'U.S. federal & civic holidays' },
];

const FONT_OPTIONS = [
  'Arial',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Verdana',
  'Helvetica',
  'Comic Sans MS',
  'Impact',
  'Palatino',
  'Garamond',
  'Bookman',
  'Trebuchet MS',
  'Arial Black',
  'Lucida Console',
];

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
  (import.meta.env.DEV ? 'http://localhost:3000' : '');
const STRIPE_PRICE_LOOKUP_KEY =
  (import.meta.env.VITE_STRIPE_PRICE_LOOKUP_KEY as string | undefined)?.trim() || '';

const PATIENCE_HINT = 'please be patient, could take a minute';

function ButtonBusyLabel({ status }: { status: string }) {
  return (
    <span className="flex flex-col items-center gap-0.5 leading-tight text-center">
      <span>{status}</span>
      <span className="text-[0.68rem] font-normal opacity-90 leading-snug">{PATIENCE_HINT}</span>
    </span>
  );
}

/** Long edge cap (px) before sending month images for free PDF — keeps Puppeteer under hosting timeouts (e.g. Render / Cloudflare). */
const FREE_PDF_MAX_IMAGE_EDGE = (() => {
  const n = Number.parseInt(String(import.meta.env.VITE_FREE_PDF_MAX_IMAGE_EDGE || ''), 10);
  if (Number.isFinite(n) && n >= 640 && n <= 4096) return n;
  return 1600;
})();

async function downscaleImageFileForPdf(file: File, maxEdge: number): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 400_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    try {
      const iw = bmp.width;
      const ih = bmp.height;
      const m = Math.max(iw, ih);
      if (m <= maxEdge) return file;
      const scale = maxEdge / m;
      const w = Math.round(iw * scale);
      const h = Math.round(ih * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(bmp, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82)
      );
      if (!blob || blob.size === 0) return file;
      const base = file.name.replace(/\.[^.\\/]+$/, '') || 'photo';
      return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
    } finally {
      bmp.close();
    }
  } catch {
    return file;
  }
}

function LayoutIconPortrait() {
  return (
    <svg viewBox="0 0 40 56" className="w-10 h-14 shrink-0 text-muted" aria-hidden>
      <rect x="2" y="2" width="36" height="52" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="6" y="6" width="28" height="14" rx="1" fill="currentColor" opacity="0.38" />
      <g opacity="0.5" stroke="currentColor" strokeWidth="0.9">
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="6" y1={24 + i * 6.5} x2="34" y2={24 + i * 6.5} />
        ))}
      </g>
    </svg>
  );
}

/** Two A4 landscape pages stacked: photo page on top, calendar grid below (like the old icon turned 90°). */
function LayoutIconLandscapeSpread() {
  return (
    <svg viewBox="0 0 40 56" className="w-10 h-14 shrink-0 text-muted" aria-hidden>
      <rect x="2" y="4" width="36" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="5" y="7" width="30" height="8" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="2" y="23" width="36" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <g opacity="0.5" stroke="currentColor" strokeWidth="0.85">
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="5" y1={27 + i * 2.4} x2="35" y2={27 + i * 2.4} />
        ))}
      </g>
    </svg>
  );
}

const MONTH_SLOT_COUNT = 12;

function isImageFile(f: File) {
  return f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp)$/i.test(f.name);
}

const LS_CALENDAR_CACHE_PREFIX = 'calendarApp.savedCalendar:';
const LS_NEW_CALENDAR_DRAFT = 'calendarApp.newCalendarDraft';
const DRAFT_VERSION = 1;

function calendarCacheKey(id: string) {
  return `${LS_CALENDAR_CACHE_PREFIX}${id}`;
}

function readCachedSavedCalendar(id: string): SavedCalendarFull | null {
  try {
    const raw = localStorage.getItem(calendarCacheKey(id));
    if (!raw) return null;
    const o = JSON.parse(raw) as SavedCalendarFull;
    if (!o || typeof o !== 'object' || o.id !== id) return null;
    return o;
  } catch {
    return null;
  }
}

function writeCachedSavedCalendar(cal: SavedCalendarFull) {
  try {
    const lean = { ...cal } as SavedCalendarFull & { monthImages?: unknown };
    delete lean.monthImages;
    const payload = JSON.stringify(lean);
    if (payload.length > 4_500_000) return;
    localStorage.setItem(calendarCacheKey(cal.id), payload);
  } catch {
    /* quota / private mode */
  }
}

function pickFont(value: string | undefined, fallback: string) {
  const v = String(value ?? '').trim();
  if (!v) return fallback;
  if (FONT_OPTIONS.includes(v)) return v;
  return v;
}

export function ApplicationForm() {
  const [searchParams, setSearchParams] = useSearchParams();
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const checkoutErrorRef = useRef<HTMLDivElement>(null);
  /** Prevents duplicate /api/calendar/download when checkout effect re-runs (draft restore, Strict Mode). */
  const checkoutDownloadKeyRef = useRef<string | null>(null);
  const [bulkDragActive, setBulkDragActive] = useState(false);
  const [year, setYear] = useState('2026');
  const [startMonth, setStartMonth] = useState('1');
  const [monthPhotos, setMonthPhotos] = useState<MonthPhoto[]>(
    MONTHS.map(month => ({ month, file: null, preview: null }))
  );
  const [dateEvents, setDateEvents] = useState<DateEvent[]>([
    { id: '1', date: '', reason: '' }
  ]);
  const [weekStart, setWeekStart] = useState<'monday' | 'sunday'>('sunday');
  const [yearFont, setYearFont] = useState('Arial');
  const [monthFont, setMonthFont] = useState('Arial');
  const [weekDaysFont, setWeekDaysFont] = useState('Arial');
  const [datesFont, setDatesFont] = useState('Arial');
  const [datesFontSize, setDatesFontSize] = useState('3');
  const [dateNumberPosition, setDateNumberPosition] = useState<DateNumberPosition>('top-left');
  const [holidayCalendars, setHolidayCalendars] = useState<string[]>([]);
  const [layoutMode, setLayoutMode] = useState<PdfLayoutMode>('landscape-spread');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingFree, setIsGeneratingFree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** After Stripe return: show receipt text (amount from Stripe when available). */
  const [paymentSuccessModal, setPaymentSuccessModal] = useState<{
    formattedAmount: string | null;
  } | null>(null);
  const [archiveFolder, setArchiveFolder] = useState('');
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [archiveReplaceAll, setArchiveReplaceAll] = useState(true);
  const [pictureSubfolders, setPictureSubfolders] = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [saveName, setSaveName] = useState('My calendar');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [saveInfo, setSaveInfo] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);

  const { presetId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user, loading: authLoading } = useAuth();
  const [presetLoading, setPresetLoading] = useState(() => Boolean(presetId));
  const presetLoadGen = useRef(0);

  const fetchPictureSubfolders = useCallback(async () => {
    setLoadingFolders(true);
    try {
      const res = await fetch(`${API_URL}/api/pictures/folders`);
      if (!res.ok) throw new Error('folders');
      const data = (await res.json()) as { folders?: string[] };
      setPictureSubfolders(Array.isArray(data.folders) ? data.folders : []);
    } catch {
      setPictureSubfolders([]);
    } finally {
      setLoadingFolders(false);
    }
  }, []);

  useEffect(() => {
    fetchPictureSubfolders();
  }, [fetchPictureSubfolders]);

  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (checkout === 'cancel') {
      setError('Checkout was cancelled. You can try again when you are ready.');
      setSearchParams({}, { replace: true });
      return;
    }
    if (checkout !== 'success') return;

    const sessionId = searchParams.get('session_id');
    const entitlementId = searchParams.get('entitlement_id');
    if (!sessionId || !entitlementId) {
      setSearchParams({}, { replace: true });
      return;
    }

    const checkoutKey = `${sessionId}:${entitlementId}`;
    const doneStorageKey = `checkout-download-done:${checkoutKey}`;
    const processingStorageKey = `checkout-download-processing:${checkoutKey}`;
    if (sessionStorage.getItem(doneStorageKey)) {
      setSearchParams({}, { replace: true });
      return;
    }
    if (
      checkoutDownloadKeyRef.current === checkoutKey ||
      sessionStorage.getItem(processingStorageKey)
    ) {
      return;
    }
    checkoutDownloadKeyRef.current = checkoutKey;
    sessionStorage.setItem(processingStorageKey, '1');

    (async () => {
      let formattedAmount: string | null = null;
      try {
        const sumRes = await fetch(
          `${API_URL}/api/calendar/checkout-summary?session_id=${encodeURIComponent(sessionId)}&entitlement_id=${encodeURIComponent(entitlementId)}`
        );
        if (sumRes.ok) {
          const sum = (await sumRes.json()) as {
            amountTotal: number | null;
            currency: string;
          };
          if (sum.amountTotal != null && sum.currency) {
            try {
              formattedAmount = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: sum.currency.toUpperCase(),
              }).format(sum.amountTotal / 100);
            } catch {
              formattedAmount = null;
            }
          }
        }
      } catch {
        /* summary optional */
      }
      setPaymentSuccessModal({ formattedAmount });

      const downloadPdf = async (): Promise<void> => {
        const res = await fetch(
          `${API_URL}/api/calendar/download?session_id=${encodeURIComponent(sessionId)}&entitlement_id=${encodeURIComponent(entitlementId)}`
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error || 'Download failed');
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = `calendar-${year}-start-${startMonth}.pdf`;
        a.click();
        URL.revokeObjectURL(objectUrl);
      };

      try {
        await downloadPdf();
        sessionStorage.setItem(doneStorageKey, '1');
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Download failed');
      } finally {
        sessionStorage.removeItem(processingStorageKey);
        setSearchParams({}, { replace: true });
      }
    })();
  }, [searchParams, setSearchParams]);

  const fetchArchiveImage = useCallback(async (fileMeta: { name: string; path: string }) => {
    const rawUrl = `${API_URL}/api/pictures/raw?path=${encodeURIComponent(fileMeta.path)}`;
    const imgRes = await fetch(rawUrl);
    if (!imgRes.ok) return null;
    const blob = await imgRes.blob();
    const file = new File([blob], fileMeta.name, { type: blob.type || 'image/jpeg' });
    const preview = URL.createObjectURL(blob);
    return { file, preview };
  }, []);

  const applyCalendar = useCallback((cal: SavedCalendarFull) => {
    setMonthPhotos((prev) => {
      prev.forEach((p) => {
        if (p.preview) URL.revokeObjectURL(p.preview);
      });
      return MONTHS.map((month) => ({ month, file: null, preview: null }));
    });
    const y = Number.isFinite(Number(cal.year)) ? Number(cal.year) : new Date().getFullYear();
    setYear(String(y));
    const sm = Number.isFinite(Number(cal.startMonth))
      ? Math.min(12, Math.max(1, Number(cal.startMonth)))
      : 1;
    setStartMonth(String(sm));
    setWeekStart(cal.weekStart === 'monday' ? 'monday' : 'sunday');
    setYearFont(pickFont(cal.yearFont, 'Arial'));
    setMonthFont(pickFont(cal.monthFont, 'Arial'));
    setWeekDaysFont(pickFont(cal.weekDaysFont, 'Arial'));
    setDatesFont(pickFont(cal.datesFont, 'Arial'));
    const dfs = String(cal.datesFontSize ?? '3').trim();
    setDatesFontSize(
      DATE_NUMBER_SIZE_OPTIONS.some((o) => o.value === dfs) ? dfs : '3'
    );
    const dnp = cal.dateNumberPosition;
    setDateNumberPosition(
      dnp === 'center' || dnp === 'top-center' || dnp === 'top-left' ? dnp : 'top-left'
    );
    if (Array.isArray(cal.holidayCalendars) && cal.holidayCalendars.length > 0) {
      setHolidayCalendars(
        cal.holidayCalendars.filter((id) =>
          HOLIDAY_CALENDAR_OPTION_IDS.includes(id as (typeof HOLIDAY_CALENDAR_OPTION_IDS)[number])
        )
      );
    } else {
      setHolidayCalendars([]);
    }
    setArchiveFolder(typeof cal.archiveFolder === 'string' ? cal.archiveFolder : '');
    setArchiveReplaceAll(Boolean(cal.archiveReplaceAll));
    setLayoutMode(cal.layoutMode === 'portrait-single' ? 'portrait-single' : 'landscape-spread');
    setSaveName((cal.name && String(cal.name).trim()) || 'My calendar');
    const rawEvents = Array.isArray(cal.events) ? cal.events : [];
    const evs =
      rawEvents.length > 0
        ? rawEvents
            .filter((e) => e && (String(e.date || '').trim() || String(e.occasion || '').trim()))
            .map((e, i) => ({
              id: `loaded-${i}-${e.date}`,
              date: String(e.date || '').trim(),
              reason: String(e.occasion || '').trim(),
            }))
        : [{ id: '1', date: '', reason: '' }];
    setDateEvents(evs.length > 0 ? evs : [{ id: '1', date: '', reason: '' }]);
  }, []);

  useEffect(() => {
    if (authLoading && requireAuth) return;
    if (!presetId) {
      setEditingPresetId(null);
      setPresetLoading(false);
      return;
    }
    if (!requireAuth) {
      setPresetLoading(false);
      navigate('/calendar', { replace: true });
      return;
    }
    if (!token) {
      setPresetLoading(false);
      navigate('/login', { replace: true, state: { from: location.pathname } });
      return;
    }
    const gen = ++presetLoadGen.current;
    let cancelled = false;
    const isStale = () => cancelled || gen !== presetLoadGen.current;
    setPresetLoading(true);
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/saved-calendars/${presetId}`, {
          headers: { ...authHeaders(token) },
        });
        if (isStale()) return;
        if (res.status === 401) {
          navigate('/login', { state: { from: location.pathname } });
          return;
        }
        if (!res.ok) {
          const cached = readCachedSavedCalendar(presetId);
          if (cached) {
            applyCalendar(cached);
            if (!isStale()) {
              setEditingPresetId(cached.id);
              setSaveInfo(
                res.status === 404
                  ? 'This calendar is not on the server anymore — showing the last copy stored in this browser.'
                  : 'Could not load from the server — showing the last copy stored in this browser.'
              );
              setSaveErr(null);
            }
          } else if (!isStale()) {
            setError('Could not load saved calendar');
          }
          return;
        }
        const data = (await res.json()) as { calendar: SavedCalendarFull };
        if (isStale()) return;
        const cal = data.calendar;
        if (!cal?.id) {
          if (!isStale()) setError('Could not load saved calendar');
          return;
        }
        applyCalendar(cal);
        if (isStale()) return;
        writeCachedSavedCalendar(cal);
        setEditingPresetId(cal.id);
        setSaveInfo(null);
        setSaveErr(null);
      } catch {
        if (isStale()) return;
        const cached = readCachedSavedCalendar(presetId);
        if (cached) {
          applyCalendar(cached);
          if (!isStale()) {
            setEditingPresetId(cached.id);
            setSaveInfo('Network error — showing the last copy stored in this browser.');
            setSaveErr(null);
          }
        } else {
          setError('Error loading saved calendar');
        }
      } finally {
        if (gen === presetLoadGen.current) {
          setPresetLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [presetId, token, authLoading, navigate, location.pathname, applyCalendar]);

  useEffect(() => {
    if (authLoading || presetId) return;
    if (location.pathname !== '/calendar') return;
    try {
      const raw = localStorage.getItem(LS_NEW_CALENDAR_DRAFT);
      if (!raw) return;
      const d = JSON.parse(raw) as {
        v?: number;
        forUser?: string | null;
        year?: string;
        startMonth?: string;
        weekStart?: 'monday' | 'sunday';
        yearFont?: string;
        monthFont?: string;
        weekDaysFont?: string;
        datesFont?: string;
        datesFontSize?: string;
        dateNumberPosition?: DateNumberPosition;
        holidayCalendars?: string[];
        archiveFolder?: string;
        archiveReplaceAll?: boolean;
        layoutMode?: PdfLayoutMode;
        saveName?: string;
        events?: { id: string; date: string; reason: string }[];
      };
      if (d.v !== DRAFT_VERSION) return;
      if (d.forUser) {
        if (!user?.username || d.forUser !== user.username) return;
      }
      if (d.year != null) setYear(String(d.year));
      if (d.startMonth != null) setStartMonth(String(d.startMonth));
      if (d.weekStart === 'monday' || d.weekStart === 'sunday') setWeekStart(d.weekStart);
      if (d.yearFont) setYearFont(pickFont(d.yearFont, 'Arial'));
      if (d.monthFont) setMonthFont(pickFont(d.monthFont, 'Arial'));
      if (d.weekDaysFont) setWeekDaysFont(pickFont(d.weekDaysFont, 'Arial'));
      if (d.datesFont) setDatesFont(pickFont(d.datesFont, 'Arial'));
      if (d.datesFontSize && DATE_NUMBER_SIZE_OPTIONS.some((o) => o.value === d.datesFontSize)) {
        setDatesFontSize(d.datesFontSize);
      }
      if (d.dateNumberPosition === 'center' || d.dateNumberPosition === 'top-center' || d.dateNumberPosition === 'top-left') {
        setDateNumberPosition(d.dateNumberPosition);
      }
      if (Array.isArray(d.holidayCalendars) && d.holidayCalendars.length > 0) {
        setHolidayCalendars(
          d.holidayCalendars.filter((id) =>
            HOLIDAY_CALENDAR_OPTION_IDS.includes(id as (typeof HOLIDAY_CALENDAR_OPTION_IDS)[number])
          )
        );
      }
      if (typeof d.archiveFolder === 'string') setArchiveFolder(d.archiveFolder);
      if (typeof d.archiveReplaceAll === 'boolean') setArchiveReplaceAll(d.archiveReplaceAll);
      if (d.layoutMode === 'portrait-single' || d.layoutMode === 'landscape-spread') {
        setLayoutMode(d.layoutMode);
      }
      if (typeof d.saveName === 'string' && d.saveName.trim()) setSaveName(d.saveName.trim());
      if (Array.isArray(d.events) && d.events.length > 0) {
        setDateEvents(
          d.events.map((e, i) => ({
            id: e.id || `draft-${i}`,
            date: String(e.date ?? ''),
            reason: String(e.reason ?? ''),
          }))
        );
      }
    } catch {
      /* ignore corrupt draft */
    }
  }, [authLoading, presetId, location.pathname, user?.username]);

  useEffect(() => {
    if (presetId || presetLoading) return;
    if (location.pathname !== '/calendar') return;
    const t = window.setTimeout(() => {
      try {
        const payload = {
          v: DRAFT_VERSION,
          forUser: user?.username ?? null,
          year,
          startMonth,
          weekStart,
          yearFont,
          monthFont,
          weekDaysFont,
          datesFont,
          datesFontSize,
          dateNumberPosition,
          holidayCalendars,
          archiveFolder,
          archiveReplaceAll,
          layoutMode,
          saveName,
          events: dateEvents.map(({ id, date, reason }) => ({ id, date, reason })),
        };
        localStorage.setItem(LS_NEW_CALENDAR_DRAFT, JSON.stringify(payload));
      } catch {
        /* quota */
      }
    }, 1800);
    return () => window.clearTimeout(t);
  }, [
    presetId,
    presetLoading,
    location.pathname,
    user?.username,
    year,
    startMonth,
    weekStart,
    yearFont,
    monthFont,
    weekDaysFont,
    datesFont,
    datesFontSize,
    dateNumberPosition,
    holidayCalendars,
    archiveFolder,
    archiveReplaceAll,
    layoutMode,
    saveName,
    dateEvents,
  ]);

  const handleFileChange = (monthIndex: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && isImageFile(file)) {
      const preview = URL.createObjectURL(file);
      setMonthPhotos(prev => {
        const updated = [...prev];
        if (updated[monthIndex].preview) {
          URL.revokeObjectURL(updated[monthIndex].preview!);
        }
        updated[monthIndex] = { ...updated[monthIndex], file, preview };
        return updated;
      });
    }
    event.target.value = '';
  };

  const assignBulkImageFiles = useCallback((files: File[]) => {
    const images = files.filter(isImageFile).slice(0, MONTH_SLOT_COUNT);
    if (images.length === 0) return;
    setMonthPhotos((prev) => {
      const next = [...prev];
      for (let i = 0; i < images.length; i++) {
        if (next[i].preview) URL.revokeObjectURL(next[i].preview!);
        next[i] = {
          ...next[i],
          file: images[i],
          preview: URL.createObjectURL(images[i]),
        };
      }
      return next;
    });
  }, []);

  const handleBulkFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (list?.length) assignBulkImageFiles(Array.from(list));
    e.target.value = '';
  };

  const removePhoto = (monthIndex: number) => {
    setMonthPhotos(prev => {
      const updated = [...prev];
      if (updated[monthIndex].preview) {
        URL.revokeObjectURL(updated[monthIndex].preview!);
      }
      updated[monthIndex] = { ...updated[monthIndex], file: null, preview: null };
      return updated;
    });
  };

  const loadPicturesFromArchive = async () => {
    setError(null);
    setLoadingArchive(true);
    try {
      const q = archiveFolder.trim()
        ? `?folder=${encodeURIComponent(archiveFolder.trim())}`
        : '';
      const listRes = await fetch(`${API_URL}/api/pictures/list${q}`);
      if (!listRes.ok) throw new Error('Could not read Pictures folder');
      const data = (await listRes.json()) as { files?: { name: string; path: string }[] };
      const files = data.files || [];
      if (files.length === 0) {
        setError(
          'No supported images found (.jpg / .png / .webp / .gif / .bmp) under this folder on the server. Check the Pictures path, file permissions, and that the server was redeployed with your image files.'
        );
        return;
      }

      let base: MonthPhoto[];
      if (archiveReplaceAll) {
        monthPhotos.forEach((p) => {
          if (p.preview) URL.revokeObjectURL(p.preview);
        });
        base = MONTHS.map((month) => ({ month, file: null, preview: null }));
      } else {
        base = monthPhotos.map((p) => ({
          month: p.month,
          file: p.file,
          preview: p.preview,
        }));
      }

      let fileIdx = 0;
      for (let slot = 0; slot < 12 && fileIdx < files.length; slot++) {
        if (!archiveReplaceAll && base[slot].file) continue;
        const meta = files[fileIdx];
        fileIdx += 1;
        const loaded = await fetchArchiveImage(meta);
        if (!loaded) continue;
        const oldPreview = base[slot].preview;
        if (!archiveReplaceAll && oldPreview) {
          URL.revokeObjectURL(oldPreview);
        }
        base[slot] = {
          month: MONTHS[slot],
          file: loaded.file,
          preview: loaded.preview,
        };
      }

      setMonthPhotos(base);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load from Pictures');
    } finally {
      setLoadingArchive(false);
    }
  };

  const toggleHolidayCalendar = (id: string) => {
    setHolidayCalendars((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const addEvent = () => {
    setDateEvents(prev => [
      ...prev,
      { id: Date.now().toString(), date: '', reason: '' }
    ]);
  };

  const removeEvent = (id: string) => {
    if (dateEvents.length > 1) {
      setDateEvents(prev => prev.filter(event => event.id !== id));
    }
  };

  const updateEvent = (id: string, field: 'date' | 'reason', value: string) => {
    setDateEvents(prev =>
      prev.map(event =>
        event.id === id ? { ...event, [field]: value } : event
      )
    );
  };

  const handleSaveToAccount = async () => {
    setSaveErr(null);
    setSaveInfo(null);
    if (!requireAuth) return;
    if (!token) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    setSavingPreset(true);
    try {
      const body = {
        name: saveName.trim() || 'Calendar',
        year: parseInt(year, 10) || new Date().getFullYear(),
        startMonth: parseInt(startMonth, 10) || 1,
        weekStart,
        yearFont,
        monthFont,
        weekDaysFont,
        datesFont,
        datesFontSize,
        dateNumberPosition,
        holidayCalendars,
        archiveFolder,
        archiveReplaceAll,
        layoutMode,
        events: dateEvents
          .filter((e) => e.date && e.reason)
          .map((e) => ({ date: e.date, occasion: e.reason })),
      };
      const id = editingPresetId;
      const url = id
        ? `${API_URL}/api/saved-calendars/${id}`
        : `${API_URL}/api/saved-calendars`;
      const res = await fetch(url, {
        method: id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(token),
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { calendar?: SavedCalendarFull; error?: string };
      if (!res.ok) {
        setSaveErr(data.error || 'Could not save');
        return;
      }
      if (data.calendar) {
        writeCachedSavedCalendar(data.calendar);
        try {
          localStorage.removeItem(LS_NEW_CALENDAR_DRAFT);
        } catch {
          /* ignore */
        }
        setEditingPresetId(data.calendar.id);
        setSaveName(data.calendar.name);
        setSaveInfo(
          id ? 'Saved — updated in your account' : 'Saved to your account'
        );
        if (!presetId || presetId !== data.calendar.id) {
          navigate(`/calendar/edit/${data.calendar.id}`, { replace: true });
        }
      }
    } catch {
      setSaveErr('Network error');
    } finally {
      setSavingPreset(false);
    }
  };

  const buildCalendarFormData = (
    includeLookupKey: boolean,
    imageFiles?: (File | null)[]
  ) => {
    const formData = new FormData();
    formData.append('year', year);
    formData.append('startMonth', startMonth);
    formData.append('events', JSON.stringify(
      dateEvents
        .filter(e => e.date && e.reason)
        .map(e => ({ date: e.date, occasion: e.reason }))
    ));
    formData.append('weekStart', weekStart);
    formData.append('yearFont', yearFont);
    formData.append('monthFont', monthFont);
    formData.append('weekDaysFont', weekDaysFont);
    formData.append('datesFont', datesFont);
    formData.append('datesFontSize', datesFontSize);
    formData.append('dateNumberPosition', dateNumberPosition);
    formData.append('holidayCalendars', JSON.stringify(holidayCalendars));
    formData.append('layoutMode', layoutMode);
    formData.append('clientAppOrigin', window.location.origin);
    if (includeLookupKey && STRIPE_PRICE_LOOKUP_KEY) {
      formData.append('lookup_key', STRIPE_PRICE_LOOKUP_KEY);
    }
    const imgs =
      imageFiles ??
      monthPhotos.map((mp) => mp.file);
    imgs.forEach((file, i) => {
      if (file) formData.append(`images_${i}`, file);
    });
    return formData;
  };

  const handleFreeGenerate = async () => {
    setError(null);
    setIsGeneratingFree(true);
    const overallMs = 15 * 60 * 1000;
    const ac = new AbortController();
    const abortTimer = window.setTimeout(() => ac.abort(), overallMs);
    try {
      const shrunk = await Promise.all(
        monthPhotos.map((mp) =>
          mp.file ? downscaleImageFileForPdf(mp.file, FREE_PDF_MAX_IMAGE_EDGE) : null
        )
      );
      const formData = buildCalendarFormData(false, shrunk);

      const readErr = async (r: Response) => {
        const ct = r.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = (await r.json().catch(() => null)) as { error?: string } | null;
          return data?.error || `HTTP ${r.status}`;
        }
        return (await r.text().catch(() => '')).slice(0, 200) || `HTTP ${r.status}`;
      };

      let startRes: Response;
      try {
        startRes = await fetch(`${API_URL}/api/calendar/free-generate-async`, {
          method: 'POST',
          body: formData,
          signal: ac.signal,
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          throw new Error(
            `Stopped after ${Math.round(overallMs / 60000)} minutes. Try again with fewer or smaller images.`
          );
        }
        throw e;
      }

      if (!startRes.ok) {
        if (startRes.status === 413) {
          throw new Error('Photos are too large for the server limit. Try fewer or smaller images.');
        }
        if (startRes.status === 404) {
          throw new Error(
            'Endpoint not found — deploy the latest server with /api/calendar/free-generate-async.'
          );
        }
        throw new Error(`Could not start free PDF (${startRes.status}): ${await readErr(startRes)}`);
      }

      const start = (await startRes.json()) as { jobId?: string };
      if (!start.jobId) {
        throw new Error('Server did not return jobId.');
      }

      const pollUrl = `${API_URL}/api/calendar/free-generate/jobs/${start.jobId}`;
      const pdfUrl = `${API_URL}/api/calendar/free-generate/jobs/${start.jobId}/pdf`;
      const deadline = Date.now() + overallMs - 8000;
      let ready = false;

      while (Date.now() < deadline) {
        const stRes = await fetch(pollUrl, { signal: ac.signal });
        if (stRes.status === 404) {
          throw new Error(
            'Job not found — if you run several app instances, use one instance or a shared job store; polling may hit a different server.'
          );
        }
        if (!stRes.ok) {
          throw new Error(`Status check failed (${stRes.status}): ${await readErr(stRes)}`);
        }
        const st = (await stRes.json().catch(() => ({}))) as {
          status?: string;
          error?: string;
        };
        if (st.status === 'failed') {
          throw new Error(st.error || 'PDF generation failed');
        }
        if (st.status === 'ready') {
          ready = true;
          break;
        }
        await new Promise((r) => window.setTimeout(r, 2000));
      }

      if (!ready) {
        throw new Error('Timed out waiting for the PDF on the server. Try again or reduce image size/count.');
      }

      const pdfRes = await fetch(pdfUrl, { signal: ac.signal });
      if (!pdfRes.ok) {
        throw new Error(`Could not download PDF (${pdfRes.status}): ${await readErr(pdfRes)}`);
      }
      const blob = await pdfRes.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `calendar-${year}-start-${startMonth}.pdf`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate free PDF';
      setError(message);
      window.requestAnimationFrame(() => {
        checkoutErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } finally {
      window.clearTimeout(abortTimer);
      setIsGeneratingFree(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const formData = buildCalendarFormData(true);

      const res = await fetch(`${API_URL}/api/checkout/calendar-session`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || 'Could not start checkout');
      }

      const data = (await res.json()) as { url?: string };
      if (!data.url) {
        throw new Error('No checkout URL returned');
      }
      window.location.assign(data.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate calendar';
      setError(message);
      window.requestAnimationFrame(() => {
        checkoutErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-6 sm:px-10 lg:px-16">
      {paymentSuccessModal != null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-success-title"
        >
          <Card className="max-w-md w-full shadow-card-lg">
            <CardHeader>
              <CardTitle id="payment-success-title" className="text-xl">
                Payment successful
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
              {paymentSuccessModal.formattedAmount ? (
                <p className="text-base leading-relaxed">
                  Your card was charged{' '}
                  <strong className="text-foreground text-lg font-semibold tabular-nums">
                    {paymentSuccessModal.formattedAmount}
                  </strong>
                  .
                </p>
              ) : (
                <p className="text-base leading-relaxed">
                  Check your card statement or Stripe receipt email for the exact amount.
                </p>
              )}
              <p className="text-sm text-muted">
                Your calendar PDF should download automatically.
              </p>
              <Button
                type="button"
                className="w-full"
                onClick={() => setPaymentSuccessModal(null)}
              >
                OK
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
      <div className="max-w-[1200px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3 order-2 sm:order-1">
            {requireAuth ? (
              <Link to="/" className="text-muted hover:text-foreground text-sm">
                ← Home
              </Link>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFreeGenerate}
              disabled={isGeneratingFree || isSubmitting}
              title="Generate PDF for free (without Stripe)"
              className="border-yellow-500/60 text-yellow-200 hover:bg-yellow-900/20"
            >
              <X className="size-4 mr-1.5" />
              {isGeneratingFree ? 'Generating free PDF…' : 'Free PDF'}
            </Button>
          </div>
          {requireAuth ? (
            <div className="flex flex-wrap gap-2 justify-end order-1 sm:order-2">
              {user ? (
                <Link to="/cabinet">
                  <Button type="button" variant="outline" size="sm">
                    <LayoutDashboard className="size-4 mr-2" />
                    Account
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to="/login" state={{ from: location.pathname }}>
                    <Button type="button" variant="outline" size="sm">
                      Sign in
                    </Button>
                  </Link>
                  <Link to="/register" state={{ from: location.pathname }}>
                    <Button type="button" variant="outline" size="sm">
                      Register
                    </Button>
                  </Link>
                </>
              )}
            </div>
          ) : null}
        </div>

        <div className="text-center mb-12">
          <h1 className="text-5xl lg:text-6xl font-semibold mb-4">Calendar Generator</h1>
          <p className="text-xl text-muted-foreground">Create your personalized calendar with photos and important dates</p>
          <p className="mt-3 text-sm text-muted max-w-2xl mx-auto leading-relaxed">
            For 2 dollars you will get a .pdf file you can print yourself. We are not collecting any of
            your personal data.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {error && (
            <div
              ref={checkoutErrorRef}
              role="alert"
              className="p-4 bg-red-950/50 border border-red-800 rounded-lg text-red-200 text-sm"
            >
              {error}
            </div>
          )}

          {presetLoading && (
            <div className="p-4 border border-border rounded-lg text-muted-foreground text-sm">
              Loading saved calendar…
            </div>
          )}

          {/* Submit Button (top duplicate) */}
          <div className="flex justify-end">
            <Button
              type="submit"
              className={`min-w-[200px] text-lg ${isSubmitting ? 'min-h-14 h-auto py-2' : 'h-12'}`}
              disabled={isSubmitting || isGeneratingFree}
            >
              {isSubmitting ? (
                <ButtonBusyLabel status="Redirecting…" />
              ) : (
                'Pay & download PDF'
              )}
            </Button>
          </div>

          {requireAuth ? (
            <Card className="p-4 lg:p-5">
              <CardHeader className="p-0 pb-3">
                <CardTitle className="text-lg">Save to your account</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                {user
                  ? 'Saves dates and design (fonts, layout, week start, Pictures folder path) — not month photos. Add or load photos again before generating a PDF.'
                  : 'Sign in or register to keep a template between years and open it from your account.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {saveInfo && (
                <div className="mb-3 text-sm text-success">{saveInfo}</div>
              )}
              {saveErr && (
                <div className="mb-3 text-sm text-red-300">{saveErr}</div>
              )}
              <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
                <div className="flex-1 space-y-2 min-w-0">
                  <Label htmlFor="save-name" className="text-sm">
                    Name
                  </Label>
                  <Input
                    id="save-name"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="e.g. Family calendar"
                    className="h-10"
                    disabled={!!presetLoading}
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleSaveToAccount}
                  disabled={savingPreset || !!presetLoading}
                  className="h-10 shrink-0 px-3 text-sm"
                >
                  <Save className="size-3.5 mr-1.5" />
                  {savingPreset
                    ? 'Saving…'
                    : editingPresetId
                      ? 'Update in account'
                      : 'Save to account'}
                </Button>
              </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="p-6 lg:p-8">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="text-xl">PDF layout</CardTitle>
              <CardDescription className="text-base">
                How each month appears in the generated PDF. Icons are schematic only.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid sm:grid-cols-2 gap-4">
                <label
                  className={`flex cursor-pointer gap-4 rounded-xl border-2 p-4 transition-colors ${
                    layoutMode === 'portrait-single'
                      ? 'border-accent bg-accent/15 ring-1 ring-accent/40'
                      : 'border-border hover:border-accent/30 bg-background'
                  }`}
                >
                  <input
                    type="radio"
                    name="layoutMode"
                    value="portrait-single"
                    checked={layoutMode === 'portrait-single'}
                    onChange={() => setLayoutMode('portrait-single')}
                    className="sr-only"
                  />
                  <LayoutIconPortrait />
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">Portrait — one page</p>
                    <p className="text-sm text-muted mt-1">
                      Photo and calendar grid on a single A4 <strong className="text-muted-foreground">portrait</strong> page per month.
                    </p>
                  </div>
                </label>
                <label
                  className={`flex cursor-pointer gap-4 rounded-xl border-2 p-4 transition-colors ${
                    layoutMode === 'landscape-spread'
                      ? 'border-accent bg-accent/15 ring-1 ring-accent/40'
                      : 'border-border hover:border-accent/30 bg-background'
                  }`}
                >
                  <input
                    type="radio"
                    name="layoutMode"
                    value="landscape-spread"
                    checked={layoutMode === 'landscape-spread'}
                    onChange={() => setLayoutMode('landscape-spread')}
                    className="sr-only"
                  />
                  <LayoutIconLandscapeSpread />
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">Landscape — two pages</p>
                    <p className="text-sm text-muted mt-1">
                      Photo (with month title) on the first A4 <strong className="text-muted-foreground">landscape</strong> page; grid on the second — as now.
                    </p>
                  </div>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Year & start month */}
          <Card className="p-6 lg:p-8">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="text-xl">Year &amp; first month</CardTitle>
              <CardDescription className="text-base">
                Choose the year of the first month and which month the 12-page calendar starts with.
                Example: year 2025 and April → April 2025 through March 2026.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex flex-col sm:flex-row gap-8 sm:items-end">
                <div className="space-y-3">
                  <Label htmlFor="year" className="text-base">Year (first month&apos;s year)</Label>
                  <Input
                    id="year"
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="2026"
                    min="2000"
                    max="2100"
                    required
                    className="max-w-[140px] h-12 text-lg"
                  />
                </div>
                <div className="space-y-3 flex-1 max-w-md">
                  <Label htmlFor="startMonth" className="text-base">Calendar starts in</Label>
                  <select
                    id="startMonth"
                    value={startMonth}
                    onChange={(e) => setStartMonth(e.target.value)}
                    className="flex h-12 w-full rounded-lg border border-border bg-input text-foreground shadow-sm px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {MONTHS.map((name, idx) => (
                      <option key={name} value={String(idx + 1)}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="p-6 lg:p-8">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="text-xl">Holidays &amp; celebrations</CardTitle>
              <CardDescription className="text-base">
                Optional sets of public and religious dates. In the PDF they are listed in <strong>red</strong> at the bottom of
                the day cell, with your own dates. Islamic and Jewish dates are approximate; extend years in
                <code className="mx-1 text-sm bg-surface border border-border px-1 py-0.5 rounded">holidays.js</code> on the server if needed.
              </CardDescription>
              <p
                className="mt-3 rounded-lg border border-orange-200 bg-warning-bg px-3 py-2.5 text-sm font-semibold leading-snug text-warning"
                role="note"
              >
                ATTENTION! Religious days rules are only as accurate as the precomputed range.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {HOLIDAY_CALENDAR_OPTIONS.map((opt) => (
                  <label
                    key={opt.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-input p-3 shadow-sm text-left hover:border-accent/40 hover:bg-accent/5"
                  >
                    <input
                      type="checkbox"
                      checked={holidayCalendars.includes(opt.id)}
                      onChange={() => toggleHolidayCalendar(opt.id)}
                      className="mt-0.5 size-4 shrink-0 rounded border-border bg-input text-accent shadow-sm focus:ring-2 focus:ring-accent/40"
                    />
                    <span className="text-sm text-muted-foreground leading-snug">{opt.label}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Week Start + Font Settings - combined */}
          <Card className="p-6 lg:p-8">
            <CardHeader className="p-0 pb-6">
              <CardTitle className="text-xl">Week & Font Settings</CardTitle>
              <CardDescription className="text-base">Choose how your week starts and fonts for calendar elements</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(12.5rem,15.5rem)] lg:gap-10 lg:items-start">
                <div className="min-w-0 space-y-8">
                  <div>
                    <Label className="text-base font-medium">Week starts with</Label>
                    <p className="text-sm text-muted mb-3">Choose Monday or Sunday as the first day of the week</p>
                    <RadioGroup value={weekStart} onValueChange={(value) => setWeekStart(value as 'monday' | 'sunday')} className="flex gap-6">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <RadioGroupItem value="sunday" id="sunday" className="h-5 w-5" />
                        <span className="text-base">Sunday</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <RadioGroupItem value="monday" id="monday" className="h-5 w-5" />
                        <span className="text-base">Monday</span>
                      </label>
                    </RadioGroup>
                  </div>

                  <div className="border-t border-border/80 pt-8">
                    <Label className="text-base font-medium">Choose fonts</Label>
                <p className="text-sm text-muted mb-4">Font for year, month names, week days, and dates; date digits can be scaled separately for the PDF.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="yearFont" className="text-sm">Year font</Label>
                    <select
                      id="yearFont"
                      value={yearFont}
                      onChange={(e) => setYearFont(e.target.value)}
                      className="flex h-11 w-full rounded-lg border border-border bg-input text-foreground shadow-sm px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-accent"
                      style={{ fontFamily: yearFont }}
                    >
                      {FONT_OPTIONS.map(font => (
                        <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>
                      ))}
                    </select>
                    <div className="text-sm text-muted-foreground p-2 border border-border rounded bg-input shadow-sm" style={{ fontFamily: yearFont }}>2026</div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="monthFont" className="text-sm">Month font</Label>
                    <select
                      id="monthFont"
                      value={monthFont}
                      onChange={(e) => setMonthFont(e.target.value)}
                      className="flex h-11 w-full rounded-lg border border-border bg-input text-foreground shadow-sm px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-accent"
                      style={{ fontFamily: monthFont }}
                    >
                      {FONT_OPTIONS.map(font => (
                        <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>
                      ))}
                    </select>
                    <div className="text-sm text-muted-foreground p-2 border border-border rounded bg-input shadow-sm" style={{ fontFamily: monthFont }}>January</div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weekDaysFont" className="text-sm">Week days font</Label>
                    <select
                      id="weekDaysFont"
                      value={weekDaysFont}
                      onChange={(e) => setWeekDaysFont(e.target.value)}
                      className="flex h-11 w-full rounded-lg border border-border bg-input text-foreground shadow-sm px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-accent"
                      style={{ fontFamily: weekDaysFont }}
                    >
                      {FONT_OPTIONS.map(font => (
                        <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>
                      ))}
                    </select>
                    <div className="text-sm text-muted-foreground p-2 border border-border rounded bg-input shadow-sm" style={{ fontFamily: weekDaysFont }}>Mon Tue Wed</div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="datesFont" className="text-sm">Dates font</Label>
                    <select
                      id="datesFont"
                      value={datesFont}
                      onChange={(e) => setDatesFont(e.target.value)}
                      className="flex h-11 w-full rounded-lg border border-border bg-input text-foreground shadow-sm px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-accent"
                      style={{ fontFamily: datesFont }}
                    >
                      {FONT_OPTIONS.map(font => (
                        <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>
                      ))}
                    </select>
                    <div className="text-sm text-muted-foreground p-2 border border-border rounded bg-input shadow-sm" style={{ fontFamily: datesFont }}>1 2 3 4 5</div>
                  </div>
                </div>
                <div className="mt-6 max-w-lg space-y-2">
                  <Label htmlFor="datesFontSize" className="text-sm">Date number size (PDF)</Label>
                  <select
                    id="datesFontSize"
                    value={datesFontSize}
                    onChange={(e) => setDatesFontSize(e.target.value)}
                    className="flex h-11 w-full rounded-lg border border-border bg-input text-foreground shadow-sm px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {DATE_NUMBER_SIZE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <div
                    className="text-foreground p-3 border border-border rounded bg-input shadow-sm"
                    style={{
                      fontFamily: datesFont,
                      fontSize: DATE_NUMBER_SIZE_OPTIONS.find((o) => o.value === datesFontSize)?.previewPx ?? 17,
                    }}
                  >
                    15 16 17
                  </div>
                  <p className="text-xs text-muted">
                    In the PDF, size 4 sets the digit height to one quarter of each day cell; size 5 uses the full cell height (same proportions as the calendar grid).
                  </p>
                  <div className="space-y-3 pt-2">
                    <Label className="text-sm">Date number in cell</Label>
                    <p className="text-xs text-muted">
                      Where the day number sits inside each day cell (events stay in the lower part of the cell in the PDF).
                    </p>
                    <RadioGroup
                      value={dateNumberPosition}
                      onValueChange={(v) => setDateNumberPosition(v as DateNumberPosition)}
                      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap"
                    >
                      {DATE_POSITION_OPTIONS.map((opt) => (
                        <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                          <RadioGroupItem value={opt.value} id={`date-pos-${opt.value}`} className="h-4 w-4" />
                          <span className="text-sm text-muted-foreground">{opt.label}</span>
                        </label>
                      ))}
                    </RadioGroup>
                  </div>
                </div>
                  </div>
                </div>

                <aside className="w-full max-w-[15.5rem] mx-auto lg:mx-0 lg:max-w-none shrink-0 lg:sticky lg:top-24">
                  <div className="rounded-xl border border-border bg-background p-4 sm:p-5 shadow-inner space-y-5">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted mb-2">
                        Year & month (PDF)
                      </p>
                      <p
                        className="text-xl text-foreground tabular-nums leading-tight"
                        style={{ fontFamily: yearFont }}
                      >
                        {year}
                      </p>
                      <p
                        className="text-base text-foreground mt-1 leading-snug"
                        style={{ fontFamily: monthFont }}
                      >
                        {MONTHS[Math.min(11, Math.max(0, (parseInt(startMonth, 10) || 1) - 1))]} {year}
                      </p>
                      <p className="text-[11px] text-muted mt-2 leading-snug">
                        <strong className="text-muted">Year font</strong> sample above; <strong className="text-muted">Month font</strong> matches the month title line in the PDF (e.g. “January 2026”).
                      </p>
                    </div>
                    <div className="border-t border-border/80 pt-4">
                      <p className="text-sm font-medium text-muted-foreground mb-0.5">
                        Day cell preview
                      </p>
                      <p className="text-xs text-muted mb-3 leading-snug">
                        Weekday row + one day cell (dates font, size, and position). On-screen preview is approximate.
                      </p>
                      <div
                        className="mx-auto flex w-[7.25rem] flex-col overflow-hidden rounded-md border border-border bg-surface shadow-lg"
                        aria-hidden
                      >
                        <div
                          className="border-b border-border bg-surface/95 px-2 py-2.5 text-center text-foreground leading-none shrink-0"
                          style={{
                            fontFamily: weekDaysFont,
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            letterSpacing: '0.02em',
                          }}
                        >
                          {weekStart === 'monday' ? 'Mon' : 'Sun'}
                        </div>
                        <div
                          className="flex min-h-0 flex-1 flex-col px-1 pb-1 pt-1"
                          style={{
                            minHeight: DATE_CELL_PREVIEW_MIN_HEIGHT[datesFontSize] ?? '4.25rem',
                          }}
                        >
                          <div
                            className={
                              dateNumberPosition === 'top-left'
                                ? 'flex w-full shrink-0 items-start justify-start'
                                : dateNumberPosition === 'top-center'
                                  ? 'flex w-full shrink-0 items-start justify-center'
                                  : 'flex w-full min-h-0 flex-1 items-center justify-center'
                            }
                          >
                            <span
                              className="tabular-nums text-foreground"
                              style={{
                                fontFamily: datesFont,
                                fontSize:
                                  DATE_NUMBER_SIZE_OPTIONS.find((o) => o.value === datesFontSize)?.previewPx ?? 17,
                                lineHeight: 1,
                              }}
                            >
                              15
                            </span>
                          </div>
                          <p className="mt-auto truncate border-t border-border/60 pt-1 text-center text-[8px] leading-tight text-muted">
                            Sample event
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-muted mt-3 text-center leading-snug">
                        First grid column: <strong className="text-muted">{weekStart === 'monday' ? 'Monday' : 'Sunday'}</strong>
                        {' '}({weekStart === 'monday' ? 'Mon' : 'Sun'}).
                      </p>
                    </div>
                  </div>
                </aside>
              </div>
            </CardContent>
          </Card>

          {/* Months Section */}
          <Card className="p-6 lg:p-8">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="text-xl">Monthly Photos</CardTitle>
              <CardDescription className="text-base">
                Drag and drop or choose <strong>multiple images</strong> at once (January → December), <strong>or</strong> load from the server <code className="text-sm bg-surface text-foreground px-1 rounded">Pictures</code> folder.
                Same month order no matter which month the PDF starts with.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 space-y-4">
              <div className="p-5 rounded-xl border-2 border-success/40 bg-success/10">
                <div className="flex items-center gap-2 mb-2">
                  <FolderOpen className="size-5 text-success" />
                  <Label className="text-base font-semibold text-foreground">Pictures folder (on server)</Label>
                </div>
                <p className="text-sm text-success/90 mb-4">
                  Images are read from <code className="bg-surface px-1 rounded border border-success/50 text-foreground">Pictures/</code> next to <code className="bg-surface px-1 rounded border border-border text-foreground">server.js</code>.
                  Sorted A–Z by filename: file 1 → January, 2 → February, … 12 → December. Works together with manual uploads (see options).
                </p>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end mb-4">
                  <div className="flex-1 space-y-2 min-w-0">
                    <Label htmlFor="archive-folder" className="text-sm font-medium text-foreground">
                      Folder with images
                    </Label>
                    <div className="flex gap-2">
                      <select
                        id="archive-folder"
                        value={archiveFolder}
                        onChange={(e) => setArchiveFolder(e.target.value)}
                        className="flex h-11 min-w-0 flex-1 rounded-md border border-success bg-surface px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-success"
                      >
                        <option value="">Pictures (root)</option>
                        {archiveFolder &&
                          !pictureSubfolders.includes(archiveFolder) && (
                            <option value={archiveFolder}>{archiveFolder}</option>
                          )}
                        {pictureSubfolders.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 shrink-0 border-success bg-transparent text-foreground hover:bg-success/15"
                        onClick={() => fetchPictureSubfolders()}
                        disabled={loadingFolders}
                        title="Refresh folder list"
                      >
                        <RefreshCw className={`size-4 ${loadingFolders ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                    <p className="text-xs text-success/70">
                      Subfolders inside <code className="bg-surface px-1 rounded border border-border text-foreground">Pictures</code> on the server. Add a folder and press refresh if it does not appear.
                    </p>
                  </div>
                  <Button
                    type="button"
                    className={`shrink-0 bg-success hover:bg-success-hover text-on-accent ${
                      loadingArchive ? 'min-h-14 h-auto py-2' : 'h-11'
                    }`}
                    onClick={loadPicturesFromArchive}
                    disabled={loadingArchive}
                  >
                    {loadingArchive ? (
                      <ButtonBusyLabel status="Loading…" />
                    ) : (
                      <>
                        <FolderOpen className="size-4 mr-2" />
                        Load from Pictures
                      </>
                    )}
                  </Button>
                </div>
                <div className="flex flex-col gap-2 text-sm text-foreground">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={archiveReplaceAll}
                      onChange={(e) => setArchiveReplaceAll(e.target.checked)}
                      className="rounded border-border bg-input shadow-sm"
                    />
                    Replace all 12 month slots (uncheck to only fill empty months)
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {monthPhotos.filter((p) => p.file).length}/{MONTH_SLOT_COUNT} images added
                  </p>
                  <p className="text-xs text-muted max-w-xl">
                    First file → January, second → February, … (standard file picker; no folder picker required.)
                  </p>
                </div>
                <input
                  ref={bulkFileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  aria-label="Choose multiple images for months January through December"
                  onChange={handleBulkFileInputChange}
                />
                <div
                  role="region"
                  aria-label="Drop zone for multiple month images"
                  className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                    bulkDragActive
                      ? 'border-accent bg-input ring-1 ring-accent/30'
                       : 'border-border bg-input/90 hover:border-accent/30 shadow-sm'
                  }`}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setBulkDragActive(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.currentTarget === e.target) setBulkDragActive(false);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setBulkDragActive(false);
                    if (e.dataTransfer.files?.length) {
                      assignBulkImageFiles(Array.from(e.dataTransfer.files));
                    }
                  }}
                >
                  <Upload className="size-12 mx-auto text-muted mb-3" aria-hidden />
                  <p className="text-muted-foreground font-medium mb-1">Drag and drop images here</p>
                  <p className="text-sm text-muted mb-4">or choose several files at once (up to 12).</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-border"
                    onClick={() => bulkFileInputRef.current?.click()}
                  >
                    Choose images…
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {monthPhotos.map((monthPhoto, index) => (
                  <div key={monthPhoto.month} className="space-y-2">
                    <Label className="text-sm text-muted-foreground block truncate" title={monthPhoto.month}>
                      {index + 1}. {monthPhoto.month}
                    </Label>
                    <div className="relative aspect-square rounded-lg border border-border bg-input overflow-hidden shadow-inner">
                      {monthPhoto.preview ? (
                        <>
                          <img
                            src={monthPhoto.preview}
                            alt={`${monthPhoto.month} preview`}
                            className="w-full h-full object-cover"
                          />
                          <label className="absolute bottom-2 left-2 right-10 cursor-pointer rounded bg-background/90 px-2 py-1 text-center text-xs text-muted-foreground border border-border hover:bg-background">
                            Replace
                            <input
                              type="file"
                              accept="image/*"
                              className="sr-only"
                              onChange={(e) => handleFileChange(index, e)}
                            />
                          </label>
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute top-1 right-1 size-8 z-10"
                            onClick={() => removePhoto(index)}
                            title="Remove"
                          >
                            <X className="size-4" />
                          </Button>
                        </>
                      ) : (
                        <label className="flex flex-col items-center justify-center h-full min-h-[120px] cursor-pointer p-2">
                          <Upload className="size-8 text-muted mb-1" />
                          <span className="text-xs text-muted text-center">Add</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(e) => handleFileChange(index, e)}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-center sm:justify-end pt-4 border-t border-border/80 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleFreeGenerate}
                  disabled={isGeneratingFree || isSubmitting}
                  title="Generate PDF for free (without Stripe)"
                  className="border-yellow-500/60 text-yellow-200 hover:bg-yellow-900/20"
                >
                  <X className="size-4 mr-1.5" />
                  {isGeneratingFree ? 'Generating free PDF…' : 'Free PDF'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Events Section */}
          <Card className="p-6 lg:p-8">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="text-xl">Add dates and occasions</CardTitle>
              <CardDescription className="text-base">
                Attention: please mark the proper year.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 space-y-4">
              {dateEvents.map((event, index) => (
                <div key={event.id} className="flex gap-4 items-start">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`date-${event.id}`}>
                        Date {index > 0 && `#${index + 1}`}
                      </Label>
                      <Input
                        id={`date-${event.id}`}
                        type="date"
                        value={event.date}
                        onChange={(e) => updateEvent(event.id, 'date', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`reason-${event.id}`}>
                        Occasion/Reason
                      </Label>
                      <Input
                        id={`reason-${event.id}`}
                        type="text"
                        value={event.reason}
                        onChange={(e) => updateEvent(event.id, 'reason', e.target.value)}
                        placeholder="e.g., Someone's Birthday"
                      />
                    </div>
                  </div>
                  {dateEvents.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="mt-8"
                      onClick={() => removeEvent(event.id)}
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
              
              <Button
                type="button"
                variant="outline"
                onClick={addEvent}
                className="w-full h-12 text-base"
              >
                <Plus className="size-5 mr-2" />
                Add Event
              </Button>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              className={`min-w-[200px] text-lg ${isSubmitting ? 'min-h-14 h-auto py-2' : 'h-12'}`}
              disabled={isSubmitting || isGeneratingFree}
            >
              {isSubmitting ? (
                <ButtonBusyLabel status="Redirecting…" />
              ) : (
                'Pay & download PDF'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
