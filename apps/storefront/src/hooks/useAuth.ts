import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { setApiKey, clearApiKey, isApiKeySet } from '../api/client';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(isApiKeySet());
  const navigate = useNavigate();

  const login = useCallback(
    (key: string) => {
      setApiKey(key);
      setIsAuthenticated(true);
      navigate('/');
    },
    [navigate]
  );

  const logout = useCallback(() => {
    clearApiKey();
    setIsAuthenticated(false);
    navigate('/login');
  }, [navigate]);

  return { isAuthenticated, login, logout };
}
