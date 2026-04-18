import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Upload, X, Plus, FolderOpen, RefreshCw, LayoutDashboard, Save } from 'lucide-react';
import { useAuth, authHeaders } from '../context/AuthContext';
import type { SavedCalendarFull } from '../types/calendar';

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

/** Approximate preview px; PDF uses mm (sizes 4–5 tied to 18mm cell min-height in template). */
const DATE_NUMBER_SIZE_OPTIONS: { value: string; label: string; previewPx: number }[] = [
  { value: '1', label: '1 — Small', previewPx: 11 },
  { value: '2', label: '2 — Medium', previewPx: 14 },
  { value: '3', label: '3 — Large (default)', previewPx: 17 },
  { value: '4', label: '4 — Bigger (¼ cell height)', previewPx: 21 },
  { value: '5', label: '5 — Full cell height', previewPx: 30 },
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

const API_URL = import.meta.env.DEV ? '' : '';

export function ApplicationForm() {
  const [year, setYear] = useState('2026');
  const [startMonth, setStartMonth] = useState('1');
  const [monthPhotos, setMonthPhotos] = useState<MonthPhoto[]>(
    MONTHS.map(month => ({ month, file: null, preview: null }))
  );
  const [coverPhoto, setCoverPhoto] = useState<{ file: File | null; preview: string | null }>({ file: null, preview: null });
  const [dateEvents, setDateEvents] = useState<DateEvent[]>([
    { id: '1', date: '', reason: '' }
  ]);
  const [weekStart, setWeekStart] = useState<'monday' | 'sunday'>('sunday');
  const [yearFont, setYearFont] = useState('Arial');
  const [monthFont, setMonthFont] = useState('Arial');
  const [weekDaysFont, setWeekDaysFont] = useState('Arial');
  const [datesFont, setDatesFont] = useState('Arial');
  const [datesFontSize, setDatesFontSize] = useState('3');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveFolder, setArchiveFolder] = useState('');
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [archiveReplaceAll, setArchiveReplaceAll] = useState(true);
  const [archiveCoverFrom13, setArchiveCoverFrom13] = useState(false);
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
  const { token, user } = useAuth();
  const [presetLoading, setPresetLoading] = useState(() => Boolean(presetId));

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

  const applyCalendar = useCallback((cal: SavedCalendarFull) => {
    setYear(String(cal.year));
    setStartMonth(String(cal.startMonth));
    setWeekStart(cal.weekStart);
    setYearFont(cal.yearFont);
    setMonthFont(cal.monthFont);
    setWeekDaysFont(cal.weekDaysFont);
    setDatesFont(cal.datesFont);
    setDatesFontSize(cal.datesFontSize);
    setArchiveFolder(cal.archiveFolder || '');
    setArchiveReplaceAll(cal.archiveReplaceAll);
    setArchiveCoverFrom13(cal.archiveCoverFrom13);
    setSaveName(cal.name || 'My calendar');
    const evs =
      cal.events && cal.events.length > 0
        ? cal.events.map((e, i) => ({
            id: `loaded-${i}-${e.date}`,
            date: e.date,
            reason: e.occasion,
          }))
        : [{ id: '1', date: '', reason: '' }];
    setDateEvents(evs);
  }, []);

  useEffect(() => {
    if (!presetId) {
      setEditingPresetId(null);
      setPresetLoading(false);
      return;
    }
    if (!token) {
      navigate('/login', { replace: true, state: { from: location.pathname } });
      return;
    }
    let cancelled = false;
    setPresetLoading(true);
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/saved-calendars/${presetId}`, {
          headers: { ...authHeaders(token) },
        });
        if (res.status === 401) {
          navigate('/login', { state: { from: location.pathname } });
          return;
        }
        if (!res.ok) {
          if (!cancelled) setError('Could not load saved calendar');
          return;
        }
        const data = (await res.json()) as { calendar: SavedCalendarFull };
        if (cancelled) return;
        applyCalendar(data.calendar);
        setEditingPresetId(data.calendar.id);
        setSaveInfo(null);
        setSaveErr(null);
      } catch {
        if (!cancelled) setError('Error loading saved calendar');
      } finally {
        if (!cancelled) setPresetLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [presetId, token, navigate, location.pathname, applyCalendar]);

  const handleFileChange = (monthIndex: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const preview = URL.createObjectURL(file);
      setMonthPhotos(prev => {
        const updated = [...prev];
        updated[monthIndex] = { ...updated[monthIndex], file, preview };
        return updated;
      });
    }
  };

  const handleCoverChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setCoverPhoto({ file, preview: URL.createObjectURL(file) });
    }
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

  const removeCover = () => {
    if (coverPhoto.preview) URL.revokeObjectURL(coverPhoto.preview);
    setCoverPhoto({ file: null, preview: null });
  };

  const fetchArchiveImage = async (fileMeta: { name: string; path: string }) => {
    const rawUrl = `${API_URL}/api/pictures/raw?path=${encodeURIComponent(fileMeta.path)}`;
    const imgRes = await fetch(rawUrl);
    if (!imgRes.ok) return null;
    const blob = await imgRes.blob();
    const file = new File([blob], fileMeta.name, { type: blob.type || 'image/jpeg' });
    const preview = URL.createObjectURL(blob);
    return { file, preview };
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
          'No images in Pictures. Put .jpg / .png / .webp / .gif / .bmp in the project Pictures folder (server), or in a subfolder you typed above.'
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
        const loaded = await fetchArchiveImage(files[fileIdx]);
        fileIdx += 1;
        if (!loaded) continue;
        const oldPreview = base[slot].preview;
        if (!archiveReplaceAll && oldPreview) {
          URL.revokeObjectURL(oldPreview);
        }
        base[slot] = { month: MONTHS[slot], file: loaded.file, preview: loaded.preview };
      }

      setMonthPhotos(base);

      if (archiveCoverFrom13 && files.length >= 13) {
        const coverMeta = files[12];
        const loaded = await fetchArchiveImage(coverMeta);
        if (loaded) {
          setCoverPhoto((prev) => {
            if (prev.preview) URL.revokeObjectURL(prev.preview);
            return { file: loaded.file, preview: loaded.preview };
          });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load from Pictures');
    } finally {
      setLoadingArchive(false);
    }
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

  const buildSavePayload = () => ({
    name: saveName.trim() || 'Calendar',
    year: parseInt(year, 10) || new Date().getFullYear(),
    startMonth: parseInt(startMonth, 10) || 1,
    weekStart,
    yearFont,
    monthFont,
    weekDaysFont,
    datesFont,
    datesFontSize,
    archiveFolder,
    archiveReplaceAll,
    archiveCoverFrom13,
    events: dateEvents
      .filter((e) => e.date && e.reason)
      .map((e) => ({ date: e.date, occasion: e.reason })),
  });

  const handleSaveToAccount = async () => {
    setSaveErr(null);
    setSaveInfo(null);
    if (!token) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    setSavingPreset(true);
    try {
      const body = buildSavePayload();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
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

      // Images: preserve order - images_0..11 = Jan-Dec, images_12 = Cover
      monthPhotos.forEach((mp, i) => {
        if (mp.file) formData.append(`images_${i}`, mp.file);
      });
      if (coverPhoto.file) formData.append('images_12', coverPhoto.file);

      const res = await fetch(`${API_URL}/generate`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to generate calendar');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `calendar-${year}-start-${startMonth}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate calendar');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1628] text-white py-12 px-6 sm:px-10 lg:px-16">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <Link to="/" className="text-slate-400 hover:text-white text-sm order-2 sm:order-1">
            ← Home
          </Link>
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
        </div>

        <div className="text-center mb-12">
          <h1 className="text-5xl lg:text-6xl font-semibold mb-4">Calendar Generator</h1>
          <p className="text-xl text-slate-300">Create your personalized calendar with photos and important dates</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {error && (
            <div className="p-4 bg-red-950/50 border border-red-800 rounded-lg text-red-200 text-sm">
              {error}
            </div>
          )}

          {presetLoading && (
            <div className="p-4 border border-slate-600 rounded-lg text-slate-300 text-sm">
              Loading saved calendar…
            </div>
          )}

          <Card className="p-6 lg:p-8">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="text-xl">Save to your account</CardTitle>
              <CardDescription className="text-base">
                {user
                  ? 'Stores dates and settings (fonts, week start, Pictures folder). Photos for the PDF must be uploaded or loaded from the server each time.'
                  : 'Sign in or register to keep a template between years and open it from your account.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {saveInfo && (
                <div className="mb-3 text-sm text-emerald-300">{saveInfo}</div>
              )}
              {saveErr && (
                <div className="mb-3 text-sm text-red-300">{saveErr}</div>
              )}
              <div className="flex flex-col lg:flex-row gap-4 lg:items-end">
                <div className="flex-1 space-y-2 min-w-0">
                  <Label htmlFor="save-name" className="text-base">
                    Name
                  </Label>
                  <Input
                    id="save-name"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="e.g. Family calendar"
                    className="h-11"
                    disabled={!!presetLoading}
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleSaveToAccount}
                  disabled={savingPreset || !!presetLoading}
                  className="h-11 shrink-0"
                >
                  <Save className="size-4 mr-2" />
                  {savingPreset
                    ? 'Saving…'
                    : editingPresetId
                      ? 'Update in account'
                      : 'Save to account'}
                </Button>
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
                    className="flex h-12 w-full rounded-md border border-slate-600 bg-[#152238] text-white px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {MONTHS.map((name, idx) => (
                      <option key={name} value={String(idx + 1)}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Week Start + Font Settings - combined */}
          <Card className="p-6 lg:p-8">
            <CardHeader className="p-0 pb-6">
              <CardTitle className="text-xl">Week & Font Settings</CardTitle>
              <CardDescription className="text-base">Choose how your week starts and fonts for calendar elements</CardDescription>
            </CardHeader>
            <CardContent className="p-0 space-y-8">
              <div>
                <Label className="text-base font-medium">Week starts with</Label>
                <p className="text-sm text-slate-400 mb-3">Choose Monday or Sunday as the first day of the week</p>
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

              <div className="border-t pt-8">
                <Label className="text-base font-medium">Choose fonts</Label>
                <p className="text-sm text-slate-400 mb-4">Font for year, month names, week days, and dates; date digits can be scaled separately for the PDF.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="yearFont" className="text-sm">Year font</Label>
                    <select
                      id="yearFont"
                      value={yearFont}
                      onChange={(e) => setYearFont(e.target.value)}
                      className="flex h-11 w-full rounded-md border border-slate-600 bg-[#152238] text-white px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ fontFamily: yearFont }}
                    >
                      {FONT_OPTIONS.map(font => (
                        <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>
                      ))}
                    </select>
                    <div className="text-sm text-slate-300 p-2 border border-slate-600 rounded bg-[#152238]/60" style={{ fontFamily: yearFont }}>2026</div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="monthFont" className="text-sm">Month font</Label>
                    <select
                      id="monthFont"
                      value={monthFont}
                      onChange={(e) => setMonthFont(e.target.value)}
                      className="flex h-11 w-full rounded-md border border-slate-600 bg-[#152238] text-white px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ fontFamily: monthFont }}
                    >
                      {FONT_OPTIONS.map(font => (
                        <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>
                      ))}
                    </select>
                    <div className="text-sm text-slate-300 p-2 border border-slate-600 rounded bg-[#152238]/60" style={{ fontFamily: monthFont }}>January</div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weekDaysFont" className="text-sm">Week days font</Label>
                    <select
                      id="weekDaysFont"
                      value={weekDaysFont}
                      onChange={(e) => setWeekDaysFont(e.target.value)}
                      className="flex h-11 w-full rounded-md border border-slate-600 bg-[#152238] text-white px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ fontFamily: weekDaysFont }}
                    >
                      {FONT_OPTIONS.map(font => (
                        <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>
                      ))}
                    </select>
                    <div className="text-sm text-slate-300 p-2 border border-slate-600 rounded bg-[#152238]/60" style={{ fontFamily: weekDaysFont }}>Mon Tue Wed</div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="datesFont" className="text-sm">Dates font</Label>
                    <select
                      id="datesFont"
                      value={datesFont}
                      onChange={(e) => setDatesFont(e.target.value)}
                      className="flex h-11 w-full rounded-md border border-slate-600 bg-[#152238] text-white px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ fontFamily: datesFont }}
                    >
                      {FONT_OPTIONS.map(font => (
                        <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>
                      ))}
                    </select>
                    <div className="text-sm text-slate-300 p-2 border border-slate-600 rounded bg-[#152238]/60" style={{ fontFamily: datesFont }}>1 2 3 4 5</div>
                  </div>
                </div>
                <div className="mt-6 max-w-lg space-y-2">
                  <Label htmlFor="datesFontSize" className="text-sm">Date number size (PDF)</Label>
                  <select
                    id="datesFontSize"
                    value={datesFontSize}
                    onChange={(e) => setDatesFontSize(e.target.value)}
                    className="flex h-11 w-full rounded-md border border-slate-600 bg-[#152238] text-white px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {DATE_NUMBER_SIZE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <div
                    className="text-slate-100 p-3 border border-slate-600 rounded bg-[#152238]"
                    style={{
                      fontFamily: datesFont,
                      fontSize: DATE_NUMBER_SIZE_OPTIONS.find((o) => o.value === datesFontSize)?.previewPx ?? 17,
                    }}
                  >
                    15 16 17
                  </div>
                  <p className="text-xs text-slate-400">
                    In the PDF, size 4 sets the digit height to one quarter of each day cell; size 5 uses the full cell height (same proportions as the calendar grid).
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Months Section */}
          <Card className="p-6 lg:p-8">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="text-xl">Monthly Photos</CardTitle>
              <CardDescription className="text-base">
                Upload your own files below, <strong>or</strong> load images from the server <code className="text-sm bg-slate-700 text-slate-100 px-1 rounded">Pictures</code> folder.
                January = first slot, February = second, … (same order no matter which month the PDF starts with).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 space-y-4">
              <div className="p-5 rounded-xl border-2 border-emerald-800/60 bg-emerald-950/25">
                <div className="flex items-center gap-2 mb-2">
                  <FolderOpen className="size-5 text-emerald-300" />
                  <Label className="text-base font-semibold text-emerald-100">Pictures folder (on server)</Label>
                </div>
                <p className="text-sm text-emerald-100/90 mb-4">
                  Images are read from <code className="bg-slate-800 px-1 rounded border border-emerald-800 text-emerald-100">Pictures/</code> next to <code className="bg-slate-800 px-1 rounded border border-slate-600 text-slate-100">server.js</code>.
                  Sorted A–Z by filename: file 1 → January, 2 → February, … 12 → December. Works together with manual uploads (see options).
                </p>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end mb-4">
                  <div className="flex-1 space-y-2 min-w-0">
                    <Label htmlFor="archive-folder" className="text-sm font-medium text-emerald-100">
                      Folder with images
                    </Label>
                    <div className="flex gap-2">
                      <select
                        id="archive-folder"
                        value={archiveFolder}
                        onChange={(e) => setArchiveFolder(e.target.value)}
                        className="flex h-11 min-w-0 flex-1 rounded-md border border-emerald-700 bg-[#152238] px-3 py-2 text-base text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                        className="h-11 shrink-0 border-emerald-600 bg-transparent text-emerald-100 hover:bg-emerald-950/80"
                        onClick={() => fetchPictureSubfolders()}
                        disabled={loadingFolders}
                        title="Refresh folder list"
                      >
                        <RefreshCw className={`size-4 ${loadingFolders ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                    <p className="text-xs text-emerald-200/70">
                      Subfolders inside <code className="bg-slate-800 px-1 rounded border border-slate-600 text-slate-100">Pictures</code> on the server. Add a folder and press refresh if it does not appear.
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="h-11 shrink-0 bg-emerald-800 hover:bg-emerald-900 text-white"
                    onClick={loadPicturesFromArchive}
                    disabled={loadingArchive}
                  >
                    <FolderOpen className="size-4 mr-2" />
                    {loadingArchive ? 'Loading…' : 'Load from Pictures'}
                  </Button>
                </div>
                <div className="flex flex-col gap-2 text-sm text-emerald-100">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={archiveReplaceAll}
                      onChange={(e) => setArchiveReplaceAll(e.target.checked)}
                      className="rounded border-slate-500 bg-[#152238]"
                    />
                    Replace all 12 month slots (uncheck to only fill empty months)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={archiveCoverFrom13}
                      onChange={(e) => setArchiveCoverFrom13(e.target.checked)}
                      className="rounded border-slate-500 bg-[#152238]"
                    />
                    Use 13th file as cover (when there are at least 13 images)
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-5">
                {monthPhotos.map((monthPhoto, index) => (
                  <div key={monthPhoto.month} className="space-y-2">
                    <Label className="text-base">{monthPhoto.month}</Label>
                    <div className="border-2 border-dashed border-slate-500 rounded-lg p-4 hover:border-slate-400 transition-colors min-h-[140px]">
                      {monthPhoto.preview ? (
                        <div className="relative">
                          <img
                            src={monthPhoto.preview}
                            alt={`${monthPhoto.month} preview`}
                            className="w-full h-36 object-cover rounded"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="absolute top-1 right-1"
                            onClick={() => removePhoto(index)}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <label
                          htmlFor={`photo-${monthPhoto.month}`}
                          className="flex flex-col items-center justify-center h-36 cursor-pointer"
                        >
                          <Upload className="size-10 text-slate-500 mb-2" />
                          <span className="text-base text-slate-400">Upload Photo</span>
                          <input
                            id={`photo-${monthPhoto.month}`}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleFileChange(index, e)}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 space-y-2">
                <Label className="text-base">Cover Photo</Label>
                <div className="border-2 border-dashed border-slate-500 rounded-lg p-4 max-w-[200px] hover:border-slate-400 transition-colors min-h-[140px]">
                  {coverPhoto.preview ? (
                    <div className="relative">
                      <img src={coverPhoto.preview} alt="Cover preview" className="w-full h-36 object-cover rounded" />
                      <Button type="button" variant="destructive" size="sm" className="absolute top-1 right-1" onClick={removeCover}>
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <label htmlFor="cover-photo" className="flex flex-col items-center justify-center h-36 cursor-pointer">
                      <Upload className="size-10 text-slate-500 mb-2" />
                      <span className="text-base text-slate-400">Upload Cover</span>
                      <input id="cover-photo" type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
                    </label>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Events Section */}
          <Card className="p-6 lg:p-8">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="text-xl">Important Dates</CardTitle>
              <CardDescription className="text-base">Add special dates and occasions (original date shows on that day every year)</CardDescription>
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
            <Button type="submit" className="min-w-[180px] h-12 text-lg" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create Calendar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
