import axios, { AxiosError } from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_URL || '/api/v2';

export const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

// TEST ONLY: inject API key for write endpoints (hold/purchase/cancel-hold etc).
// In production the Shopify server-side proxy adds this header before forwarding.
const testApiKey = import.meta.env.VITE_API_KEY;
if (testApiKey) {
  api.interceptors.request.use((config) => {
    if (config.method && config.method.toLowerCase() !== 'get') {
      config.headers['X-API-Key'] = testApiKey;
    }
    return config;
  });
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => Promise.reject(error)
);
