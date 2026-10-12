import { type ReactNode, useState } from 'react';
import { useApp } from '../store';
import {
  LayoutDashboard, Terminal, Zap, Bot, Brain, Instagram,
  Shield, ScrollText, Settings, Rocket, HelpCircle, LogOut, Menu, X, ChevronLeft
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'console', label: 'Console', icon: Terminal },
  { id: 'commands', label: 'Commands', icon: Zap },
  { id: 'automation', label: 'Automation', icon: Bot },
  { id: 'ai', label: 'AI Assistant', icon: Brain },
  { id: 'instagram', label: 'Instagram', icon: Instagram },
  { id: 'sessions', label: 'Sessions', icon: Shield },
  { id: 'logs', label: 'Activity Logs', icon: ScrollText },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'deploy', label: 'Deployment', icon: Rocket },
  { id: 'help', label: 'Help', icon: HelpCircle },
];

export function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const { state, dispatch } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    dispatch({ type: 'LOGOUT' });
  };

  const botStatusLabel = {
    online: 'Online',
    offline: 'Offline',
    starting: 'Starting...',
    error: 'Error',
  }[state.botStatus];

  const botStatusClass = {
    online: 'status-online',
    offline: 'status-offline',
    starting: 'status-starting',
    error: 'status-error',
  }[state.botStatus];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:relative z-50 h-full flex flex-col
        bg-bg-800 border-r border-border
        transition-all duration-300 ease-in-out
        ${sidebarOpen ? 'w-60' : 'w-16'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-ig-orange via-ig-pink to-ig-purple flex items-center justify-center shrink-0">
            <Bot size={16} className="text-white" />
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <h1 className="text-sm font-bold gradient-text whitespace-nowrap">IG Bot Platform</h1>
              <p className="text-[10px] text-gray-500 whitespace-nowrap">Hosting Dashboard</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto hidden lg:flex p-1 rounded hover:bg-bg-700 text-gray-500"
          >
            <ChevronLeft size={14} className={`transition-transform ${!sidebarOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Bot Status */}
        {sidebarOpen && (
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className={`status-dot ${botStatusClass}`} />
              <span className="text-xs font-medium text-gray-300">Bot: {botStatusLabel}</span>
            </div>
            {state.igSession && (
              <p className="text-[11px] text-gray-500 mt-1 truncate">
                @{state.igSession.username}
              </p>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id); setMobileOpen(false); }}
              className={`sidebar-link ${currentPage === item.id ? 'active' : ''}`}
              title={!sidebarOpen ? item.label : undefined}
            >
              <item.icon size={18} className="shrink-0" />
              {sidebarOpen && <span className="truncate">{item.label}</span>}
              {item.id === 'ai' && state.aiQueue.filter(r => r.status === 'running' || r.status === 'queued').length > 0 && sidebarOpen && (
                <span className="ml-auto badge bg-yellow-900/30 text-yellow-400 text-[10px]">
                  {state.aiQueue.filter(r => r.status === 'running' || r.status === 'queued').length}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-border p-3">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold">
                {state.admin?.username?.[0]?.toUpperCase() || 'A'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-300 truncate">{state.admin?.username}</p>
                <p className="text-[10px] text-gray-500">Admin</p>
              </div>
              <button onClick={handleLogout} className="p-1.5 rounded hover:bg-bg-700 text-gray-500 hover:text-red-400" title="Logout">
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button onClick={handleLogout} className="w-full flex justify-center p-2 rounded hover:bg-bg-700 text-gray-500 hover:text-red-400" title="Logout">
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-12 border-b border-border bg-bg-800/80 backdrop-blur flex items-center px-4 gap-3 shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-1.5 rounded hover:bg-bg-700 text-gray-400"
          >
            <Menu size={18} />
          </button>
          <h2 className="text-sm font-semibold text-white capitalize">
            {navItems.find(n => n.id === currentPage)?.label || 'Dashboard'}
          </h2>
          <div className="ml-auto flex items-center gap-3">
            {state.errorCount > 0 && (
              <span className="badge bg-red-900/30 text-red-400 text-[10px]">
                {state.errorCount} error{state.errorCount > 1 ? 's' : ''}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <span className={`status-dot ${botStatusClass}`} />
              <span className="text-xs text-gray-400">{botStatusLabel}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
