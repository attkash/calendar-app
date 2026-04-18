import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { ApplicationForm } from './components/ApplicationForm';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/cabinet" element={<Dashboard />} />
          <Route path="/calendar" element={<ApplicationForm />} />
          <Route path="/calendar/edit/:presetId" element={<ApplicationForm />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
