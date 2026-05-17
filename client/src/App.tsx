import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { requireAuth } from './appset';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { ApplicationForm } from './components/ApplicationForm';

function AuthOnlyRoute({ children }: { children: ReactNode }) {
  if (!requireAuth) {
    return <Navigate to="/calendar" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/"
            element={
              requireAuth ? <Home /> : <Navigate to="/calendar" replace />
            }
          />
          <Route
            path="/login"
            element={
              <AuthOnlyRoute>
                <Login />
              </AuthOnlyRoute>
            }
          />
          <Route
            path="/register"
            element={
              <AuthOnlyRoute>
                <Register />
              </AuthOnlyRoute>
            }
          />
          <Route
            path="/cabinet"
            element={
              <AuthOnlyRoute>
                <Dashboard />
              </AuthOnlyRoute>
            }
          />
          <Route path="/calendar" element={<ApplicationForm />} />
          <Route path="/calendar/edit/:presetId" element={<ApplicationForm />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
