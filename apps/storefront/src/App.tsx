import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { SearchPage } from './pages/SearchPage';
import { DiamondDetailPage } from './pages/DiamondDetailPage';
import { CheckoutSuccessPage } from './pages/CheckoutSuccessPage';

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Layout>
            <SearchPage />
          </Layout>
        }
      />
      <Route
        path="/diamonds/:id"
        element={
          <Layout>
            <DiamondDetailPage />
          </Layout>
        }
      />
      <Route
        path="/checkout/success"
        element={
          <Layout>
            <CheckoutSuccessPage />
          </Layout>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
