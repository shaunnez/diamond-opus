import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Runs } from './pages/Runs';
import { RunDetails } from './pages/RunDetails';
import { Consolidation } from './pages/Consolidation';
import { Suppliers } from './pages/Suppliers';
import { Query } from './pages/Query';
import { Triggers } from './pages/Triggers';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './hooks/useAuth';

function ProtectedRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-stone-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/runs" element={<Runs />} />
        <Route path="/runs/:runId" element={<RunDetails />} />
        <Route path="/consolidation" element={<Consolidation />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/query" element={<Query />} />
        <Route path="/triggers" element={<Triggers />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<ProtectedRoutes />} />
      </Routes>
    </AuthProvider>
  );
}
