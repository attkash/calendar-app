import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useAuth } from '../context/AuthContext';
import { Calendar, LayoutDashboard, LogIn, UserPlus } from 'lucide-react';

export function Home() {
  const { user, loading } = useAuth();

  return (
    <div className="min-h-screen bg-[#0b1628] text-white flex flex-col items-center justify-center px-6 py-16">
      <div className="max-w-lg w-full text-center space-y-8">
        <div>
          <h1 className="text-4xl sm:text-5xl font-semibold mb-3">Calendar Generator</h1>
          <p className="text-slate-300 text-lg">
            Build a personal calendar with photos and important dates. Sign in to reuse your settings next year.
          </p>
        </div>

        <Card className="p-6 text-left">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-xl">Get started</CardTitle>
            <CardDescription className="text-base">
              {user ? (
                <>Signed in as <strong className="text-slate-200">{user.username}</strong>. Open your account or start a new calendar.</>
              ) : (
                <>Register or sign in — your account can store dates and font options to reuse later.</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 flex flex-col sm:flex-row gap-3">
            <Link to="/calendar" className="flex-1">
              <Button type="button" className="w-full h-12 gap-2">
                <Calendar className="size-5" />
                Create calendar
              </Button>
            </Link>
            {loading ? null : user ? (
              <Link to="/cabinet" className="flex-1">
                <Button type="button" variant="outline" className="w-full h-12 gap-2">
                  <LayoutDashboard className="size-5" />
                  Your account
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/login" className="flex-1">
                  <Button type="button" variant="outline" className="w-full h-12 gap-2">
                    <LogIn className="size-5" />
                    Sign in
                  </Button>
                </Link>
                <Link to="/register" className="flex-1">
                  <Button type="button" variant="outline" className="w-full h-12 gap-2">
                    <UserPlus className="size-5" />
                    Register
                  </Button>
                </Link>
              </>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
