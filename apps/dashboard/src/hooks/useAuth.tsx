import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { api, setApiKey, clearApiKey, isApiKeySet } from '../api/client';

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (apiKey: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check if API key is valid on mount
  useEffect(() => {
    async function checkAuth() {
      if (!isApiKeySet()) {
        setIsLoading(false);
        return;
      }

      try {
        // Test the API key by calling a simple endpoint
        await api.get('/analytics/summary');
        setIsAuthenticated(true);
      } catch {
        clearApiKey();
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkAuth();
  }, []);

  const login = useCallback(async (apiKey: string): Promise<boolean> => {
    setApiKey(apiKey);
    try {
      await api.get('/analytics/summary');
      setIsAuthenticated(true);
      return true;
    } catch {
      clearApiKey();
      setIsAuthenticated(false);
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    clearApiKey();
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
