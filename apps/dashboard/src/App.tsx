import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { ToastProvider } from './components/ui';

// Lazy-loaded page components for route-based code splitting
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Runs = lazy(() => import('./pages/Runs').then(m => ({ default: m.Runs })));
const RunDetails = lazy(() => import('./pages/RunDetails').then(m => ({ default: m.RunDetails })));
const Consolidation = lazy(() => import('./pages/Consolidation').then(m => ({ default: m.Consolidation })));
const Feeds = lazy(() => import('./pages/Feeds').then(m => ({ default: m.Feeds })));
const Query = lazy(() => import('./pages/Query').then(m => ({ default: m.Query })));
const Triggers = lazy(() => import('./pages/Triggers').then(m => ({ default: m.Triggers })));
const Heatmap = lazy(() => import('./pages/Heatmap').then(m => ({ default: m.Heatmap })));
const PricingRules = lazy(() => import('./pages/PricingRules').then(m => ({ default: m.PricingRules })));
const RatingRules = lazy(() => import('./pages/RatingRules').then(m => ({ default: m.RatingRules })));
const ErrorLogs = lazy(() => import('./pages/ErrorLogs').then(m => ({ default: m.ErrorLogs })));
const ApiDocs = lazy(() => import('./pages/ApiDocs').then(m => ({ default: m.ApiDocs })));
const Holds = lazy(() => import('./pages/Holds').then(m => ({ default: m.Holds })));
const Orders = lazy(() => import('./pages/Orders').then(m => ({ default: m.Orders })));

function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>
  );
}

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
      <Suspense fallback={<PageSpinner />}>
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
          <Route path="/rating-rules" element={<RatingRules />} />
          <Route path="/holds" element={<Holds />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/error-logs" element={<ErrorLogs />} />
          <Route path="/api-docs" element={<ApiDocs />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
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
