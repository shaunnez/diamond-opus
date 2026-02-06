import { useLocation } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button } from '../ui';

const pageNames: Record<string, string> = {
  '/': 'Dashboard',
  '/runs': 'Pipeline Runs',
  '/consolidation': 'Consolidation Monitor',
  '/feeds': 'Feed Analytics',
  '/query': 'Query Builder',
  '/triggers': 'Manual Triggers',
  '/holds': 'Holds',
  '/orders': 'Orders',
  '/error-logs': 'Error Logs',
};

interface HeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function Header({ onRefresh, isRefreshing }: HeaderProps) {
  const location = useLocation();
  const pageName = pageNames[location.pathname] || 'Page';

  // Handle run details page
  const isRunDetails = location.pathname.startsWith('/runs/') && location.pathname !== '/runs';
  const displayName = isRunDetails ? 'Run Details' : pageName;

  return (
    <header className="h-16 bg-white dark:bg-stone-800 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between px-4 sm:px-6 lg:px-8">
      <div className="flex-1 min-w-0 pl-12 lg:pl-0">
        <h1 className="text-lg sm:text-xl font-semibold text-stone-900 dark:text-stone-100 truncate">{displayName}</h1>
      </div>
      {onRefresh && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          icon={<RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />}
        >
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      )}
    </header>
  );
}
