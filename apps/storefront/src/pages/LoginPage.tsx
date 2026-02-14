import { useState, FormEvent } from 'react';
import { Diamond } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const [key, setKey] = useState('');
  const { login } = useAuth();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (key.trim()) {
      login(key.trim());
    }
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <Diamond className="w-12 h-12 text-gold mx-auto mb-4" />
          <h1 className="font-serif text-3xl font-semibold text-charcoal mb-2">
            Diamond Collection
          </h1>
          <p className="text-warm-gray-500 text-sm">
            Enter your API key to browse our diamond inventory
          </p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white p-8 shadow-card border border-border">
          <label htmlFor="api-key" className="block text-sm font-medium text-charcoal mb-2">
            API Key
          </label>
          <input
            id="api-key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Enter your API key"
            className="w-full px-4 py-3 border border-border bg-cream text-charcoal placeholder-warm-gray-400 focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors text-sm"
            autoFocus
          />
          <button type="submit" className="btn-primary w-full mt-4" disabled={!key.trim()}>
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
