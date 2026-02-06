import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Runs } from './pages/Runs';
import { RunDetails } from './pages/RunDetails';
import { Consolidation } from './pages/Consolidation';
import { Feeds } from './pages/Feeds';
import { Query } from './pages/Query';
import { Triggers } from './pages/Triggers';
import { Heatmap } from './pages/Heatmap';
import { PricingRules } from './pages/PricingRules';
import { Nivoda } from './pages/Nivoda';
import { ErrorLogs } from './pages/ErrorLogs';
import { ApiDocs } from './pages/ApiDocs';
import { Holds } from './pages/Holds';
import { Orders } from './pages/Orders';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { ToastProvider } from './components/ui';

function ProtectedRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-stone-600 dark:text-stone-400">Loading...</p>
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
        <Route path="/feeds" element={<Feeds />} />
        <Route path="/query" element={<Query />} />
        <Route path="/triggers" element={<Triggers />} />
        <Route path="/heatmap" element={<Heatmap />} />
        <Route path="/pricing-rules" element={<PricingRules />} />
        <Route path="/nivoda" element={<Nivoda />} />
        <Route path="/holds" element={<Holds />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/error-logs" element={<ErrorLogs />} />
        <Route path="/api-docs" element={<ApiDocs />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
