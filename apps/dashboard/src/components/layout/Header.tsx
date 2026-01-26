import { useLocation } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button } from '../ui';

const pageNames: Record<string, string> = {
  '/': 'Dashboard',
  '/runs': 'Pipeline Runs',
  '/consolidation': 'Consolidation Monitor',
  '/suppliers': 'Supplier Analytics',
  '/query': 'Query Builder',
  '/triggers': 'Manual Triggers',
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
    <header className="h-16 bg-white border-b border-stone-200 flex items-center justify-between px-8">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">{displayName}</h1>
      </div>
      {onRefresh && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          icon={<RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />}
        >
          Refresh
        </Button>
      )}
    </header>
  );
}
