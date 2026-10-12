import { useState, useRef, useEffect } from 'react';
import { useApp, type LogSeverity } from '../store';
import { Trash2, Download, Search, Filter, Pause, Play } from 'lucide-react';

export function ConsolePage() {
  const { state, dispatch, addConsole } = useApp();
  const [filter, setFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState<LogSeverity | 'all'>('all');
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Generate simulated console output periodically when bot is online
  useEffect(() => {
    if (state.botStatus !== 'online' || paused) return;
    const messages = [
      { sev: 'debug' as const, mod: 'poll', msg: 'Checking for new messages...' },
      { sev: 'debug' as const, mod: 'poll', msg: 'No new messages found' },
      { sev: 'info' as const, mod: 'health', msg: 'Health check passed' },
      { sev: 'debug' as const, mod: 'session', msg: 'Session valid, token refreshed' },
    ];
    const interval = setInterval(() => {
      const msg = messages[Math.floor(Math.random() * messages.length)];
      addConsole(msg.sev, msg.mod, msg.msg);
    }, 8000);
    return () => clearInterval(interval);
  }, [state.botStatus, paused, addConsole]);

  useEffect(() => {
    if (autoScroll && !paused) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.consoleOutput, autoScroll, paused]);

  const filteredLogs = state.consoleOutput.filter(log => {
    if (severityFilter !== 'all' && log.severity !== severityFilter) return false;
    if (filter && !log.message.toLowerCase().includes(filter.toLowerCase()) &&
        !log.module.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const handleExport = () => {
    const content = filteredLogs.map(l =>
      `[${new Date(l.timestamp).toISOString()}] [${l.severity.toUpperCase()}] [${l.module}] ${l.message}`
    ).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `console-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    dispatch({ type: 'CLEAR_CONSOLE' });
  };

  return (
    <div className="space-y-4 h-[calc(100vh-10rem)]">
      {/* Toolbar */}
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

        <div className="flex items-center gap-1">
          <button
            onClick={() => setPaused(!paused)}
            className={`p-2 rounded-lg text-sm ${paused ? 'bg-yellow-accent/15 text-yellow-accent' : 'bg-bg-700 text-gray-400 hover:text-white'}`}
            title={paused ? 'Resume' : 'Pause'}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-3 py-2 rounded-lg text-xs ${autoScroll ? 'bg-accent/15 text-accent' : 'bg-bg-700 text-gray-400'}`}
          >
            Auto-scroll
          </button>
          <button onClick={handleExport} className="p-2 rounded-lg bg-bg-700 text-gray-400 hover:text-white" title="Export logs">
            <Download size={14} />
          </button>
          <button onClick={handleClear} className="p-2 rounded-lg bg-bg-700 text-gray-400 hover:text-red-400" title="Clear console">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Console Output */}
      <div className="card flex-1 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-900/50">
          <div className="flex items-center gap-2">
            <span className="status-dot status-online" />
            <span className="text-xs text-gray-400 font-mono">console — {filteredLogs.length} entries</span>
          </div>
          {paused && (
            <span className="badge bg-yellow-900/30 text-yellow-400 text-[10px]">PAUSED</span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-[#0a0a0f] font-mono">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-sm">No log entries</p>
              <p className="text-gray-600 text-xs mt-1">
                {state.botStatus === 'online' ? 'Waiting for output...' : 'Start the bot to see console output'}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredLogs.map(log => (
                <div key={log.id} className="log-line flex gap-2 hover:bg-bg-800/50 px-1 py-0.5 rounded">
                  <span className="log-timestamp shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className={`shrink-0 w-12 text-right ${
                    log.severity === 'error' ? 'log-error' :
                    log.severity === 'warn' ? 'log-warn' :
                    log.severity === 'success' ? 'log-success' :
                    log.severity === 'debug' ? 'log-debug' :
                    'log-info'
                  }`}>
                    [{log.severity.toUpperCase().slice(0, 4)}]
                  </span>
                  <span className="text-purple-400 shrink-0 w-20 truncate">[{log.module}]</span>
                  <span className="text-gray-300 break-all">{log.message}</span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
