import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useAuth, authHeaders } from '../context/AuthContext';
import type { SavedCalendarSummary } from '../types/calendar';
import { Calendar, LogOut, Pencil, Plus, Trash2 } from 'lucide-react';

const API_URL = import.meta.env.DEV ? '' : '';

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function Dashboard() {
  const { token, user, logout, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState<SavedCalendarSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/saved-calendars`, {
        headers: { ...authHeaders(token) },
      });
      if (res.status === 401) {
        logout();
        navigate('/login', { replace: true });
        return;
      }
      if (!res.ok) {
        setError('Could not load the list');
        return;
      }
      const data = (await res.json()) as { calendars: SavedCalendarSummary[] };
      setList(data.calendars || []);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [token, logout, navigate]);

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setLoading(false);
      navigate('/login', { replace: true });
      return;
    }
    load();
  }, [authLoading, token, navigate, load]);

  const remove = async (id: string) => {
    if (!token || !confirm('Delete this saved calendar?')) return;
    try {
      const res = await fetch(`${API_URL}/api/saved-calendars/${id}`, {
        method: 'DELETE',
        headers: { ...authHeaders(token) },
      });
      if (res.ok) setList((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError('Could not delete');
    }
  };

  if (authLoading || (!token && loading)) {
    return (
      <div className="min-h-screen bg-[#0b1628] text-white flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1628] text-white py-12 px-6 sm:px-10">
      <div className="max-w-[900px] mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Your account</h1>
            <p className="text-slate-400 mt-1">
              {user ? (
                <>
                  Signed in as <span className="text-slate-200">{user.username}</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/calendar">
              <Button type="button" variant="outline">
                <Plus className="size-4 mr-2" />
                New calendar
              </Button>
            </Link>
            <Button type="button" variant="outline" onClick={() => { logout(); navigate('/'); }}>
              <LogOut className="size-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>

        <Card className="p-6 lg:p-8">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-xl flex items-center gap-2">
              <Calendar className="size-5" />
              Saved calendars
            </CardTitle>
            <CardDescription className="text-base">
              Open a saved set of dates and settings, change the year or events, and generate the PDF again.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {error && (
              <div className="mb-4 p-3 rounded-lg border border-red-800 bg-red-950/50 text-red-200 text-sm">{error}</div>
            )}
            {loading ? (
              <p className="text-slate-400">Loading…</p>
            ) : list.length === 0 ? (
              <p className="text-slate-400">
                No saves yet. Create a calendar and use &quot;Save to account&quot; on the generator page.
              </p>
            ) : (
              <ul className="space-y-3">
                {list.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-slate-600 bg-[#152238]/50"
                  >
                    <div>
                      <p className="font-medium text-white">{c.name}</p>
                      <p className="text-sm text-slate-400">
                        Year: {c.year} · starts: {MONTH_SHORT[c.startMonth - 1]}{' '}
                        · updated {new Date(c.updatedAt).toLocaleString('en-US')}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Link to={`/calendar/edit/${c.id}`}>
                        <Button type="button" variant="outline" size="sm">
                          <Pencil className="size-4 mr-1" />
                          Open
                        </Button>
                      </Link>
                      <Button type="button" variant="outline" size="sm" onClick={() => remove(c.id)} className="border-red-800 text-red-200 hover:bg-red-950/50">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <p className="text-center">
          <Link to="/" className="text-slate-400 hover:text-white text-sm">
            Home
          </Link>
        </p>
      </div>
    </div>
  );
}
