import { Link } from 'react-router-dom';
import { Diamond, LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export function Header() {
  const { logout } = useAuth();

  return (
    <header className="bg-white border-b border-border">
      <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 group">
            <Diamond className="w-6 h-6 text-gold" />
            <span className="font-serif text-xl font-semibold tracking-wide text-charcoal">
              Diamond Collection
            </span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              to="/"
              className="text-sm font-medium text-warm-gray-500 hover:text-charcoal transition-colors"
            >
              Browse
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-sm font-medium text-warm-gray-500 hover:text-charcoal transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}
