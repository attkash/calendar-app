import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.DEV ? '' : '';

export function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession } = useAuth();
  const redirectTo = (location.state as { from?: string } | null)?.from || '/cabinet';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { token?: string; user?: { id: string; username: string }; error?: string };
      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }
      if (data.token && data.user) {
        setSession(data.token, data.user);
        navigate(redirectTo, { replace: true });
      }
    } catch {
      setError('Network unavailable');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1628] text-white flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md p-6 lg:p-8">
        <CardHeader className="p-0 pb-4">
          <CardTitle className="text-2xl">Register</CardTitle>
          <CardDescription className="text-base">
            Choose a username and a password (at least 6 characters).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg border border-red-800 bg-red-950/50 text-red-200 text-sm">{error}</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="reg-user">Username</Label>
              <Input
                id="reg-user"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={50}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-pass">Password</Label>
              <Input
                id="reg-pass"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="h-11"
              />
            </div>
            <Button type="submit" className="w-full h-11 text-base" disabled={pending}>
              {pending ? 'Registering…' : 'Create account'}
            </Button>
            <p className="text-sm text-slate-400 text-center">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-300 hover:underline">
                Sign in
              </Link>
            </p>
            <p className="text-center">
              <Link to="/" className="text-sm text-slate-400 hover:text-white">
                Home
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
