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
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Runs', href: '/runs', icon: PlayCircle },
  { name: 'Consolidation', href: '/consolidation', icon: Layers },
  { name: 'Suppliers', href: '/suppliers', icon: Database },
  { name: 'Query', href: '/query', icon: Search },
  { name: 'Triggers', href: '/triggers', icon: Zap },
];

export function Sidebar() {
  const { logout } = useAuth();

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-white border-r border-stone-200 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-stone-200">
        <div className="p-2 bg-primary-100 rounded-lg">
          <Diamond className="w-5 h-5 text-primary-600" />
        </div>
        <div>
          <h1 className="font-semibold text-stone-900">Diamond Platform</h1>
          <p className="text-xs text-stone-500">Analytics Dashboard</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
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
  );
}
