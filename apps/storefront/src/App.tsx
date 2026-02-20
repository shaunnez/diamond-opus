import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { SearchPage } from './pages/SearchPage';
import { DiamondDetailPage } from './pages/DiamondDetailPage';
import { CheckoutSuccessPage } from './pages/CheckoutSuccessPage';
import { LoginPage } from './pages/LoginPage';
import { isApiKeySet } from './api/client';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isApiKeySet()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <SearchPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/diamonds/:id"
        element={
          <ProtectedRoute>
            <Layout>
              <DiamondDetailPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/checkout/success"
        element={
          <ProtectedRoute>
            <Layout>
              <CheckoutSuccessPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
