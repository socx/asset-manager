import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Bars3Icon,
  XMarkIcon,
  SunIcon,
  MoonIcon,
  HomeIcon,
  UsersIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  ServerStackIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../hooks/useTheme';
import { useTelemetry } from '../hooks/useTelemetry';
import { logout } from '../api/auth';

const ADMIN_ROLES = ['super_admin', 'system_admin'];

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ firstName, lastName, size = 'md' }: { firstName: string; lastName: string; size?: 'sm' | 'md' }) {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
  const colours = [
    'bg-sky-500', 'bg-violet-500', 'bg-emerald-500',
    'bg-amber-500', 'bg-rose-500', 'bg-indigo-500',
  ];
  // Deterministic colour from name
  const idx = (firstName.charCodeAt(0) + lastName.charCodeAt(0)) % colours.length;
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm';
  return (
    <span className={`inline-flex items-center justify-center rounded-full font-semibold text-white ${colours[idx]} ${sizeClass}`}>
      {initials}
    </span>
  );
}

// ── Profile Dropdown ──────────────────────────────────────────────────────────

function ProfileDropdown() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  async function handleSignOut() {
    try {
      await logout();
    } finally {
      clearAuth();
      navigate('/login');
    }
  }

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Avatar firstName={user.firstName} lastName={user.lastName} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black/5 dark:ring-white/10 z-50 focus:outline-none">
          {/* User info */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
          </div>
          {/* Actions */}
          <div className="py-1">
            <button
              onClick={() => { setOpen(false); navigate('/profile'); }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              My Profile
            </button>
            <button
              onClick={handleSignOut}
              className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Nav items ─────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: NavItem[];
}

const adminNav: Array<NavItem | NavGroup> = [
  { label: 'Dashboard', to: '/admin', icon: HomeIcon },
  {
    label: 'Settings',
    icon: Cog6ToothIcon,
    children: [
      { label: 'User Management', to: '/admin/users', icon: UsersIcon },
      { label: 'System Settings', to: '/admin/settings', icon: Cog6ToothIcon },
      { label: 'Lookup Lists', to: '/admin/settings/lookup', icon: DocumentTextIcon },
      { label: 'Companies', to: '/admin/settings/companies', icon: UsersIcon },
    ],
  },
  {
    label: 'Monitor',
    icon: ChartBarIcon,
    children: [
      { label: 'Audit Logs', to: '/admin/audit-logs', icon: DocumentTextIcon },
      { label: 'System Logs', to: '/admin/system-logs', icon: ServerStackIcon },
    ],
  },
];

const appNav: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: HomeIcon },
];

function isGroup(item: NavItem | NavGroup): item is NavGroup {
  return 'children' in item;
}

function NavGroupItem({ group, onNavigate }: { group: NavGroup; onNavigate: () => void }) {
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(`nav-group-${group.label}`) !== 'closed';
    } catch {
      return true;
    }
  });

  function toggle() {
    setExpanded((e) => {
      const next = !e;
      try { localStorage.setItem(`nav-group-${group.label}`, next ? 'open' : 'closed'); } catch { /* ignore */ }
      return next;
    });
  }

  const Icon = group.icon;

  return (
    <li>
      <button
        onClick={toggle}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <Icon className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" />
        <span className="flex-1 text-left">{group.label}</span>
        {expanded
          ? <ChevronDownIcon className="h-4 w-4 text-gray-400" />
          : <ChevronRightIcon className="h-4 w-4 text-gray-400" />
        }
      </button>
      {expanded && (
        <ul className="mt-0.5 ml-4 space-y-0.5">
          {group.children.map((child) => (
            <li key={child.to}>
              <NavLink
                to={child.to}
                end={child.to !== '/admin/settings/lookup'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-medium'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`
                }
              >
                <child.icon className="h-4 w-4 shrink-0" />
                {child.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function SidebarNav({ onNavigate }: { onNavigate: () => void }) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user && ADMIN_ROLES.includes(user.role);
  const items = isAdmin ? adminNav : appNav;

  return (
    <nav className="flex-1 px-3 py-4 overflow-y-auto">
      <ul className="space-y-0.5">
        {items.map((item) => {
          if (isGroup(item)) {
            return <NavGroupItem key={item.label} group={item} onNavigate={onNavigate} />;
          }
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/admin' || item.to === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </NavLink>
            </li>
          );
        })}
        {!isAdmin && (
          <li className="mt-4 px-3">
            <p className="text-xs text-gray-400 dark:text-gray-600 italic">
              Asset management features coming in Iteration 3
            </p>
          </li>
        )}
      </ul>
    </nav>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
}

export default function AppShell({ children, title }: AppShellProps) {
  const user = useAuthStore((s) => s.user);
  const { theme, toggle } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useTelemetry();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex">
      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-transform duration-300 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-sky-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">AM</span>
            </div>
            <span className="text-sm font-bold text-gray-900 dark:text-white">Asset Manager</span>
          </div>
          <button
            className="lg:hidden text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            onClick={() => setSidebarOpen(false)}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <SidebarNav onNavigate={() => setSidebarOpen(false)} />

        {/* User footer */}
        {user && (
          <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center gap-3">
            <Avatar firstName={user.firstName} lastName={user.lastName} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
            </div>
          </div>
        )}
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 lg:px-6">
          {/* Mobile hamburger */}
          <button
            className="lg:hidden text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Bars3Icon className="h-6 w-6" />
          </button>

          {/* Page title */}
          <h1 className="flex-1 text-base font-semibold text-gray-900 dark:text-white truncate">
            {title ?? 'Asset Manager'}
          </h1>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            {/* Theme toggle */}
            <button
              onClick={toggle}
              className="rounded-full p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark'
                ? <SunIcon className="h-5 w-5" />
                : <MoonIcon className="h-5 w-5" />
              }
            </button>

            {/* Profile dropdown */}
            <ProfileDropdown />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
