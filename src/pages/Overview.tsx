import { useApp } from '../store';
import { Play, Square, RotateCcw, RefreshCw, Activity, Cpu, Zap, Brain, Instagram, AlertTriangle, Clock, TrendingUp } from 'lucide-react';

export function OverviewPage() {
  const { state, startBot, stopBot, restartBot } = useApp();

  const uptime = state.botStartedAt ? formatUptime(Date.now() - state.botStartedAt) : '—';
  const enabledCommands = state.commands.filter(c => c.enabled).length;
  const enabledRules = state.automationRules.filter(r => r.enabled).length;
  const recentErrors = state.logs.filter(l => l.severity === 'error').slice(0, 5);
  const recentActivity = state.logs.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Bot Controls */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              state.botStatus === 'online' ? 'bg-green-accent/15' :
              state.botStatus === 'error' ? 'bg-red-accent/15' :
              state.botStatus === 'starting' ? 'bg-yellow-accent/15' :
              'bg-bg-600'
            }`}>
              <Cpu size={24} className={
                state.botStatus === 'online' ? 'text-green-accent' :
                state.botStatus === 'error' ? 'text-red-accent' :
                state.botStatus === 'starting' ? 'text-yellow-accent' :
                'text-gray-500'
              } />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Bot Runtime</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`status-dot ${
                  state.botStatus === 'online' ? 'status-online' :
                  state.botStatus === 'error' ? 'status-error' :
                  state.botStatus === 'starting' ? 'status-starting' :
                  'status-offline'
                }`} />
                <span className="text-sm text-gray-400 capitalize">{state.botStatus}</span>
                {state.botStatus === 'online' && (
                  <span className="text-xs text-gray-500">• Uptime: {uptime}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={startBot}
              disabled={state.botStatus === 'online' || state.botStatus === 'starting' || !state.igSession}
              className="btn-success flex items-center gap-1.5 text-sm"
              title={!state.igSession ? 'Connect Instagram first' : ''}
            >
              <Play size={14} /> Start
            </button>
            <button
              onClick={stopBot}
              disabled={state.botStatus === 'offline'}
              className="btn-danger flex items-center gap-1.5 text-sm"
            >
              <Square size={14} /> Stop
            </button>
            <button
              onClick={restartBot}
              disabled={state.botStatus === 'offline' || state.botStatus === 'starting'}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <RotateCcw size={14} /> Restart
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Instagram size={18} className="text-ig-pink" />}
          label="Instagram"
          value={state.igSession ? `@${state.igSession.username}` : 'Not connected'}
          sub={state.igSession ? `${state.igSession.followerCount || 0} followers` : 'Connect to start'}
          status={state.igSession ? 'online' : 'offline'}
        />
        <StatCard
          icon={<Zap size={18} className="text-yellow-accent" />}
          label="Commands"
          value={`${enabledCommands}/${state.commands.length}`}
          sub={`${state.commands.reduce((a, c) => a + c.executionCount, 0)} total executions`}
          status={enabledCommands > 0 ? 'online' : 'offline'}
        />
        <StatCard
          icon={<Activity size={18} className="text-blue-accent" />}
          label="Automation"
          value={`${enabledRules} active`}
          sub={`${state.automationRules.length} rules configured`}
          status={enabledRules > 0 ? 'online' : 'offline'}
        />
        <StatCard
          icon={<Brain size={18} className="text-accent" />}
          label="AI Assistant"
          value={state.aiConfig.apiKey ? 'Configured' : 'Not set'}
          sub={state.aiQueue.filter(r => r.status === 'running').length > 0 ? 'Processing...' : 'Idle'}
          status={state.aiConfig.apiKey ? 'online' : 'offline'}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-accent" />
            Recent Activity
          </h3>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No activity yet</p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map(log => (
                <div key={log.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                  <span className={`status-dot mt-1.5 shrink-0 ${
                    log.severity === 'error' ? 'status-error' :
                    log.severity === 'warn' ? 'bg-yellow-accent' :
                    log.severity === 'success' ? 'status-online' :
                    'status-offline'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-300 truncate">{log.message}</p>
                    <p className="text-[11px] text-gray-500">{log.module} • {formatTime(log.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Errors & Status */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-accent" />
            Recent Errors ({state.errorCount})
          </h3>
          {recentErrors.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">No errors recorded</p>
              <p className="text-xs text-gray-600 mt-1">System is running smoothly</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentErrors.map(log => (
                <div key={log.id} className="bg-red-900/5 border border-red-800/20 rounded-lg p-3">
                  <p className="text-sm text-red-300">{log.message}</p>
                  <p className="text-[11px] text-gray-500 mt-1">{log.module} • {formatTime(log.timestamp)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Automation Rules Status */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Activity size={16} className="text-blue-accent" />
          Automation Rules
        </h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {state.automationRules.map(rule => (
            <div key={rule.id} className={`rounded-lg p-3 border ${rule.enabled ? 'bg-bg-700 border-border' : 'bg-bg-800 border-border opacity-60'}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">{rule.name}</span>
                <span className={`badge ${rule.enabled ? 'bg-green-accent/15 text-green-accent' : 'bg-bg-600 text-gray-500'}`}>
                  {rule.enabled ? 'Active' : 'Disabled'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{rule.description}</p>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500">
                <span className="flex items-center gap-1"><Clock size={10} /> {rule.cooldown}s cooldown</span>
                <span>{rule.executionCount} runs</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Config Status */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Brain size={16} className="text-accent" />
          AI Configuration
        </h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="bg-bg-700 rounded-lg p-3">
            <p className="text-xs text-gray-500">Model</p>
            <p className="text-sm text-white font-mono truncate">{state.aiConfig.model || 'Not set'}</p>
          </div>
          <div className="bg-bg-700 rounded-lg p-3">
            <p className="text-xs text-gray-500">API Key</p>
            <p className="text-sm text-white">{state.aiConfig.apiKey ? '•••••••• Configured' : 'Not set'}</p>
          </div>
          <div className="bg-bg-700 rounded-lg p-3">
            <p className="text-xs text-gray-500">Queue</p>
            <p className="text-sm text-white">
              {state.aiQueue.filter(r => r.status === 'running').length} running,
              {' '}{state.aiQueue.filter(r => r.status === 'queued').length} queued
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, status }: {
  icon: React.ReactNode; label: string; value: string; sub: string; status: 'online' | 'offline';
}) {
  return (
    <div className="card card-hover p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-lg font-bold text-white truncate">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
    </div>
  );
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
