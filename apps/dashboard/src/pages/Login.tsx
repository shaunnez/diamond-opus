import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Diamond, Key, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Button, Input, Card } from '../components/ui';

export function Login() {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const success = await login(apiKey);
      if (success) {
        navigate('/');
      } else {
        setError('Invalid API key. Please check your key and try again.');
      }
    } catch {
      setError('Failed to connect to the API. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-900 dark:to-stone-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-2xl mb-4">
            <Diamond className="w-8 h-8 text-primary-600 dark:text-primary-400" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Diamond Platform</h1>
          <p className="text-stone-500 dark:text-stone-400 mt-1">Analytics Dashboard</p>
        </div>

        {/* Login Form */}
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Sign In</h2>
              <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
                Enter your API key to access the dashboard
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 rounded-lg text-sm text-error-700 dark:text-error-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <Input
              type="password"
              label="API Key"
              placeholder="Enter your API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              icon={<Key className="w-4 h-4" />}
              required
            />

            <Button type="submit" className="w-full" loading={isLoading}>
              Sign In
            </Button>
          </form>
        </Card>

        {/* Help text */}
        <p className="text-center text-sm text-stone-500 dark:text-stone-400 mt-6">
          Need an API key? Contact your system administrator.
        </p>
      </div>
    </div>
  );
}
