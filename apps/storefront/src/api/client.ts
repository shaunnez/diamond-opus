import axios, { AxiosError } from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_URL || '/api/v2';

export const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => Promise.reject(error)
);
