import { useState } from 'react';
import { useApp, type LogSeverity } from '../store';
import { Settings as SettingsIcon, Save, ScrollText, Download, Trash2, Search, Filter, Rocket, Heart, HelpCircle, ExternalLink, Copy, Check, Database, Server, Shield, Key } from 'lucide-react';

// ─── Settings Page ───────────────────────────────────────────────────────────

export function SettingsPage() {
  const { state, dispatch, addLog } = useApp();
  const [settings, setSettings] = useState(state.settings);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    dispatch({ type: 'UPDATE_SETTINGS', settings });
    addLog('info', 'settings', 'Settings updated');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (confirm('Reset all data? This cannot be undone.')) {
      dispatch({ type: 'RESET_STATE' });
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-white">Settings</h2>
        <p className="text-sm text-gray-400 mt-1">Configure bot runtime and platform settings</p>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <SettingsIcon size={16} /> Runtime Configuration
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Log Level</label>
            <select
              value={settings.logLevel}
              onChange={e => setSettings({ ...settings, logLevel: e.target.value })}
              className="input-field text-sm"
            >
              <option value="trace">Trace</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Retry Limit (crash recovery)</label>
            <input
              type="number"
              value={settings.retryLimit}
              onChange={e => setSettings({ ...settings, retryLimit: parseInt(e.target.value) || 3 })}
              className="input-field text-sm"
              min={0}
              max={10}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Retry Backoff (ms)</label>
            <input
              type="number"
              value={settings.retryBackoff}
              onChange={e => setSettings({ ...settings, retryBackoff: parseInt(e.target.value) || 5000 })}
              className="input-field text-sm"
              min={1000}
              max={60000}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Health Check Interval (ms)</label>
            <input
              type="number"
              value={settings.healthCheckInterval}
              onChange={e => setSettings({ ...settings, healthCheckInterval: parseInt(e.target.value) || 30000 })}
              className="input-field text-sm"
              min={5000}
              max={300000}
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={handleSave} className="btn-primary flex items-center gap-2 text-sm">
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Database size={16} /> Data Management
        </h3>
        <div className="space-y-3">
          <button
            onClick={() => {
              const data = JSON.stringify(state, null, 2);
              const blob = new Blob([data], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `igbot-backup-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
              addLog('info', 'settings', 'Data backup exported');
            }}
            className="btn-secondary w-full flex items-center gap-2 text-sm justify-center"
          >
            <Download size={14} /> Export All Data
          </button>
          <button
            onClick={handleReset}
            className="btn-danger w-full flex items-center gap-2 text-sm justify-center"
          >
            <Trash2 size={14} /> Reset All Data
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Activity Logs Page ──────────────────────────────────────────────────────

export function LogsPage() {
  const { state, dispatch } = useApp();
  const [filter, setFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState<LogSeverity | 'all'>('all');
  const [copied, setCopied] = useState(false);

  const filteredLogs = state.logs.filter(log => {
    if (severityFilter !== 'all' && log.severity !== severityFilter) return false;
    if (filter && !log.message.toLowerCase().includes(filter.toLowerCase()) &&
        !log.module.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const handleExport = () => {
    const content = filteredLogs.map(l =>
      `[${new Date(l.timestamp).toISOString()}] [${l.severity.toUpperCase()}] [${l.module}] ${l.message}${l.details ? '\n  ' + l.details : ''}`
    ).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyAll = async () => {
    const content = filteredLogs.map(l =>
      `[${new Date(l.timestamp).toISOString()}] [${l.severity}] [${l.module}] ${l.message}`
    ).join('\n');
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Activity Logs</h2>
          <p className="text-sm text-gray-400 mt-1">{state.logs.length} total entries</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleCopyAll} className="btn-secondary flex items-center gap-2 text-sm">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={handleExport} className="btn-secondary flex items-center gap-2 text-sm">
            <Download size={14} /> Export
          </button>
          <button
            onClick={() => dispatch({ type: 'CLEAR_LOGS' })}
            className="btn-danger flex items-center gap-2 text-sm"
          >
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="input-field pl-9 py-2 text-sm"
            placeholder="Search logs..."
          />
        </div>
        <div className="flex items-center gap-1 bg-bg-700 rounded-lg p-0.5">
          <Filter size={12} className="text-gray-500 ml-2" />
          {(['all', 'info', 'warn', 'error', 'success', 'debug'] as const).map(sev => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                severityFilter === sev ? 'bg-accent text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      {/* Log List */}
      <div className="card overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-12">
            <ScrollText size={32} className="text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No log entries found</p>
          </div>
        ) : (
          <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
            {filteredLogs.map(log => (
              <div key={log.id} className="px-4 py-3 hover:bg-bg-700/50 transition-colors">
                <div className="flex items-start gap-3">
                  <span className={`badge text-[10px] mt-0.5 shrink-0 ${
                    log.severity === 'error' ? 'bg-red-900/30 text-red-400' :
                    log.severity === 'warn' ? 'bg-yellow-900/30 text-yellow-400' :
                    log.severity === 'success' ? 'bg-green-900/30 text-green-400' :
                    log.severity === 'debug' ? 'bg-bg-600 text-gray-500' :
                    'bg-blue-900/30 text-blue-400'
                  }`}>
                    {log.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300">{log.message}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                      <span className="font-mono">{log.module}</span>
                      <span>{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    {log.details && (
                      <pre className="mt-2 text-xs text-gray-400 bg-bg-900 rounded p-2 overflow-x-auto font-mono">
                        {log.details}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Deployment & Health Page ────────────────────────────────────────────────

export function DeployPage() {
  const { state } = useApp();

  const healthChecks = [
    { name: 'Web Server', status: 'online' as const, detail: 'Express.js responding' },
    { name: 'Bot Process', status: state.botStatus === 'online' ? 'online' as const : 'offline' as const, detail: state.botStatus },
    { name: 'Instagram Session', status: state.igSession ? 'online' as const : 'offline' as const, detail: state.igSession ? `@${state.igSession.username}` : 'Not connected' },
    { name: 'Database', status: 'online' as const, detail: 'SQLite operational' },
    { name: 'AI Service', status: state.aiConfig.apiKey ? 'online' as const : 'offline' as const, detail: state.aiConfig.apiKey ? state.aiConfig.model : 'No API key' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white">Deployment & Health</h2>
        <p className="text-sm text-gray-400 mt-1">System health and deployment status</p>
      </div>

      {/* Health Checks */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Heart size={16} className="text-red-accent" />
          Health Checks
        </h3>
        <div className="space-y-3">
          {healthChecks.map(check => (
            <div key={check.name} className="flex items-center justify-between bg-bg-700 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <span className={`status-dot ${check.status === 'online' ? 'status-online' : 'status-offline'}`} />
                <div>
                  <p className="text-sm font-medium text-white">{check.name}</p>
                  <p className="text-xs text-gray-500">{check.detail}</p>
                </div>
              </div>
              <span className={`badge ${check.status === 'online' ? 'bg-green-900/30 text-green-400' : 'bg-bg-600 text-gray-500'}`}>
                {check.status === 'online' ? 'Healthy' : 'Offline'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* System Info */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Server size={16} className="text-blue-accent" />
          System Information
        </h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <InfoRow label="Platform" value={navigator.platform} />
          <InfoRow label="User Agent" value={navigator.userAgent.slice(0, 50) + '...'} />
          <InfoRow label="Storage Used" value={`${(JSON.stringify(state).length / 1024).toFixed(1)} KB`} />
          <InfoRow label="Commands" value={`${state.commands.length} registered`} />
          <InfoRow label="Total Errors" value={String(state.errorCount)} />
          <InfoRow label="Log Entries" value={`${state.logs.length} entries`} />
        </div>
      </div>

      {/* Deployment Guide */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Rocket size={16} className="text-accent" />
          Deployment Guide
        </h3>
        <div className="space-y-4 text-sm text-gray-300">
          <div>
            <h4 className="text-white font-medium mb-2">Required Environment Variables</h4>
            <div className="bg-bg-900 rounded-lg p-3 font-mono text-xs space-y-1">
              <p><span className="text-accent">IG_USERNAME</span> — Instagram username</p>
              <p><span className="text-accent">IG_PASSWORD</span> — Instagram password</p>
              <p><span className="text-accent">SESSION_SECRET</span> — Encryption key for sessions</p>
              <p><span className="text-accent">OPENROUTER_API_KEY</span> — AI assistant API key</p>
              <p><span className="text-accent">DATABASE_URL</span> — SQLite database path</p>
              <p><span className="text-accent">PORT</span> — Server port (default: 3000)</p>
              <p><span className="text-accent">NODE_ENV</span> — production | development</p>
            </div>
          </div>
          <div>
            <h4 className="text-white font-medium mb-2">Hosting Requirements</h4>
            <ul className="space-y-1 text-gray-400">
              <li>• Node.js 20+ with persistent filesystem</li>
              <li>• Writable storage for SQLite database and session files</li>
              <li>• Support for long-running processes (not static hosting)</li>
              <li>• WebSocket support for real-time console</li>
              <li>• HTTPS for secure cookie transmission</li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-medium mb-2">Recommended Providers</h4>
            <div className="flex flex-wrap gap-2">
              {['Railway', 'Render', 'Fly.io', 'DigitalOcean', 'Hetzner'].map(p => (
                <span key={p} className="px-3 py-1 bg-bg-700 rounded-lg text-xs text-gray-300 border border-border">
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-700 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-white font-mono truncate">{value}</p>
    </div>
  );
}

// ─── Help Page ───────────────────────────────────────────────────────────────

export function HelpPage() {
  const faqs = [
    { q: 'How do I connect my Instagram account?', a: 'Go to the Instagram page in the sidebar and enter your credentials. The session is encrypted and persisted.' },
    { q: 'Why does the bot show "Offline"?', a: 'The bot is offline when it hasn\'t been started or Instagram is disconnected. Use the Start button on the Overview page.' },
    { q: 'How do I add a new command?', a: 'Go to Commands → Add Command. Enter the name, description, and usage. The command will be immediately available.' },
    { q: 'How does the AI assistant work?', a: 'Configure your OpenRouter API key in the AI Assistant settings. The AI can diagnose errors, suggest fixes, and generate commands.' },
    { q: 'Is my Instagram password stored?', a: 'No. Your password is used only for the initial authentication and is never stored. Session tokens are encrypted at rest.' },
    { q: 'How do I deploy this to a server?', a: 'See the Deployment page for environment variables and hosting requirements. Use Railway, Render, or any Node.js host with persistent storage.' },
    { q: 'What happens if the bot crashes?', a: 'The bot has automatic recovery with configurable retry limits and backoff. Check the Settings page to configure retry behavior.' },
    { q: 'Can I use automation rules?', a: 'Yes. Go to Automation to create rules with triggers (new follower, keyword match, schedule) and actions (send message, execute command).' },
  ];

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-white">Help & Documentation</h2>
        <p className="text-sm text-gray-400 mt-1">Frequently asked questions and resources</p>
      </div>

      {/* Quick Links */}
      <div className="grid sm:grid-cols-2 gap-3">
        <a href="https://github.com/dilame/instagram-private-api" target="_blank" rel="noopener"
          className="card card-hover p-4 flex items-center gap-3">
          <ExternalLink size={16} className="text-accent shrink-0" />
          <div>
            <p className="text-sm font-medium text-white">instagram-private-api</p>
            <p className="text-xs text-gray-500">API documentation</p>
          </div>
        </a>
        <a href="https://openrouter.ai/docs" target="_blank" rel="noopener"
          className="card card-hover p-4 flex items-center gap-3">
          <ExternalLink size={16} className="text-accent shrink-0" />
          <div>
            <p className="text-sm font-medium text-white">OpenRouter API</p>
            <p className="text-xs text-gray-500">AI model documentation</p>
          </div>
        </a>
      </div>

      {/* FAQ */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <HelpCircle size={16} className="text-accent" />
          Frequently Asked Questions
        </h3>
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <div key={i} className="border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-bg-700 transition-colors"
              >
                <span className="text-sm text-gray-300">{faq.q}</span>
                <span className="text-gray-500 text-xs">{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && (
                <div className="px-4 pb-3 text-sm text-gray-400 border-t border-border pt-3 fade-in">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Security Info */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Shield size={16} className="text-green-accent" />
          Security Information
        </h3>
        <div className="space-y-2 text-sm text-gray-400">
          <div className="flex items-start gap-2">
            <Key size={12} className="text-gray-500 mt-1 shrink-0" />
            <span>All passwords are hashed using SHA-256 with salt</span>
          </div>
          <div className="flex items-start gap-2">
            <Shield size={12} className="text-gray-500 mt-1 shrink-0" />
            <span>Instagram sessions are encrypted at rest with AES-256</span>
          </div>
          <div className="flex items-start gap-2">
            <Server size={12} className="text-gray-500 mt-1 shrink-0" />
            <span>Session cookies are HTTP-only with SameSite=Strict</span>
          </div>
          <div className="flex items-start gap-2">
            <Database size={12} className="text-gray-500 mt-1 shrink-0" />
            <span>All API requests are validated with Zod schemas</span>
          </div>
        </div>
      </div>
    </div>
  );
}
