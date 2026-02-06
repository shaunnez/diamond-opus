import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  PlayCircle,
  Database,
  Layers,
  Search,
  Zap,
  LogOut,
  Diamond,
  X,
  BarChart3,
  DollarSign,
  ShoppingCart,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Runs', href: '/runs', icon: PlayCircle },
  { name: 'Consolidation', href: '/consolidation', icon: Layers },
  { name: 'Feeds', href: '/feeds', icon: Database },
  { name: 'Query', href: '/query', icon: Search },
  { name: 'Triggers', href: '/triggers', icon: Zap },
  { name: 'Heatmap', href: '/heatmap', icon: BarChart3 },
  { name: 'Nivoda', href: '/nivoda', icon: ShoppingCart },
  { name: 'Price Models', href: '/pricing-rules', icon: DollarSign },
  { name: 'Error Logs', href: '/error-logs', icon: AlertTriangle },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const { logout } = useAuth();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 w-64 bg-white border-r border-stone-200 flex flex-col z-50 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between gap-3 px-6 border-b border-stone-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 rounded-lg">
            <Diamond className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h1 className="font-semibold text-stone-900">Diamond Platform</h1>
            <p className="text-xs text-stone-500">Analytics Dashboard</p>
          </div>
        </div>
        {/* Close button for mobile */}
        <button
          onClick={onClose}
          className="lg:hidden p-2 text-stone-500 hover:text-stone-700"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            {item.name}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-stone-200">
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
      </aside>
    </>
  );
}
