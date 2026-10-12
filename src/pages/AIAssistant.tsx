import { useState, useRef, useEffect } from 'react';
import { useApp, type AIRequest } from '../store';
import { Brain, Send, Settings, Trash2, XCircle, Clock, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp, Key, Cpu } from 'lucide-react';

export function AIAssistantPage() {
  const { state, dispatch, sendAIMessage, cancelAIRequest, addLog } = useApp();
  const [prompt, setPrompt] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showQueue, setShowQueue] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<AIRequest | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    apiKey: state.aiConfig.apiKey,
    model: state.aiConfig.model,
    maxTokens: state.aiConfig.maxTokens,
    timeout: state.aiConfig.timeout,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.aiHistory]);

  const handleSend = async () => {
    if (!prompt.trim() || sending) return;
    if (!state.aiConfig.apiKey) {
      setShowSettings(true);
      addLog('warn', 'ai', 'Cannot send: API key not configured');
      return;
    }
    const currentPrompt = prompt.trim();
    setPrompt('');
    setSending(true);
    await sendAIMessage(currentPrompt);
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveSettings = () => {
    dispatch({ type: 'SET_AI_CONFIG', config: settingsForm });
    addLog('info', 'ai', 'AI configuration updated');
    setShowSettings(false);
  };

  const runningRequest = state.aiQueue.find(r => r.status === 'running');
  const queuedRequests = state.aiQueue.filter(r => r.status === 'queued');
  const completedHistory = state.aiHistory.filter(r => r.status === 'completed' || r.status === 'failed');

  const quickPrompts = [
    'Find and fix the latest bot error',
    'Why does Instagram login fail?',
    'Review the recent console logs',
    'Check if all dependencies are installed',
    'Create a new !greet command',
    'Explain the command handler architecture',
  ];

  return (
    <div className="space-y-4 h-[calc(100vh-10rem)]">
      {/* Top Bar */}
      <div className="card p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain size={20} className="text-accent" />
          <div>
            <h2 className="text-sm font-semibold text-white">AI Assistant</h2>
            <p className="text-xs text-gray-500">
              Model: <span className="text-gray-400 font-mono">{state.aiConfig.model}</span>
              {state.aiConfig.apiKey ? ' • Connected' : ' • No API key'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {runningRequest && (
            <span className="badge bg-yellow-900/30 text-yellow-400 text-[10px] flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> Processing
            </span>
          )}
          {queuedRequests.length > 0 && (
            <span className="badge bg-bg-600 text-gray-400 text-[10px]">
              {queuedRequests.length} queued
            </span>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg bg-bg-700 text-gray-400 hover:text-white"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="card p-5 fade-in">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Settings size={16} /> AI Configuration
          </h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                <Key size={10} /> OpenRouter API Key
              </label>
              <input
                type="password"
                value={settingsForm.apiKey}
                onChange={e => setSettingsForm({ ...settingsForm, apiKey: e.target.value })}
                className="input-field text-sm font-mono"
                placeholder="sk-or-v1-..."
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Get your free API key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" className="text-accent hover:underline">openrouter.ai/keys</a>
              </p>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                <Cpu size={10} /> Model
              </label>
              <select
                value={settingsForm.model}
                onChange={e => setSettingsForm({ ...settingsForm, model: e.target.value })}
                className="input-field text-sm"
              >
                {state.aiConfig.availableModels.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Max Tokens</label>
              <input
                type="number"
                value={settingsForm.maxTokens}
                onChange={e => setSettingsForm({ ...settingsForm, maxTokens: parseInt(e.target.value) || 4096 })}
                className="input-field text-sm"
                min={256}
                max={32000}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Timeout (ms)</label>
              <input
                type="number"
                value={settingsForm.timeout}
                onChange={e => setSettingsForm({ ...settingsForm, timeout: parseInt(e.target.value) || 60000 })}
                className="input-field text-sm"
                min={5000}
                max={300000}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowSettings(false)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={handleSaveSettings} className="btn-primary text-sm">Save Configuration</button>
          </div>
        </div>
      )}

      {/* Queue Status */}
      <div className="card p-3">
        <button
          onClick={() => setShowQueue(!showQueue)}
          className="flex items-center justify-between w-full text-left"
        >
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Request Queue ({state.aiQueue.length})
          </span>
          {showQueue ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
        </button>
        {showQueue && (
          <div className="mt-3 space-y-2">
            {state.aiQueue.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-2">No requests in queue</p>
            ) : (
              state.aiQueue.map(req => (
                <div key={req.id} className={`queue-item ${req.status} rounded-lg p-3 flex items-center justify-between`}>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {req.status === 'running' && <Loader2 size={12} className="text-yellow-accent animate-spin shrink-0" />}
                    {req.status === 'queued' && <Clock size={12} className="text-gray-500 shrink-0" />}
                    <span className="text-xs text-gray-300 truncate">{req.prompt}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`badge text-[10px] ${
                      req.status === 'running' ? 'bg-yellow-900/30 text-yellow-400' : 'bg-bg-600 text-gray-500'
                    }`}>
                      {req.status}
                    </span>
                    <button
                      onClick={() => cancelAIRequest(req.id)}
                      className="p-1 rounded hover:bg-bg-700 text-gray-500 hover:text-red-accent"
                      title="Cancel"
                    >
                      <XCircle size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Chat Area */}
      <div className="card flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {completedHistory.length === 0 ? (
            <div className="text-center py-12">
              <Brain size={40} className="text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-sm">Ask the AI assistant anything about your bot</p>
              <p className="text-gray-500 text-xs mt-1">Diagnose errors, generate commands, review logs</p>
              <div className="flex flex-wrap gap-2 justify-center mt-6 max-w-lg mx-auto">
                {quickPrompts.map(p => (
                  <button
                    key={p}
                    onClick={() => setPrompt(p)}
                    className="px-3 py-1.5 rounded-lg bg-bg-700 border border-border text-xs text-gray-400 hover:text-white hover:border-accent/50 transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            completedHistory.map(req => (
              <div key={req.id} className="space-y-3">
                {/* User message */}
                <div className="flex justify-end">
                  <div className="bg-accent/15 border border-accent/20 rounded-xl rounded-br-sm px-4 py-2.5 max-w-[80%]">
                    <p className="text-sm text-white">{req.prompt}</p>
                    <p className="text-[10px] text-gray-500 mt-1">{new Date(req.createdAt).toLocaleTimeString()}</p>
                  </div>
                </div>
                {/* AI response */}
                {req.status === 'completed' && req.response && (
                  <div className="flex justify-start">
                    <div className="bg-bg-700 border border-border rounded-xl rounded-bl-sm px-4 py-2.5 max-w-[85%]">
                      <div className="text-sm text-gray-300 whitespace-pre-wrap break-words">{req.response}</div>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
                        <span>{req.model}</span>
                        {req.tokensUsed && <span>{req.tokensUsed} tokens</span>}
                        <span>{new Date(req.completedAt!).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                )}
                {req.status === 'failed' && (
                  <div className="flex justify-start">
                    <div className="bg-red-900/10 border border-red-800/30 rounded-xl px-4 py-2.5 max-w-[80%]">
                      <p className="text-sm text-red-300 flex items-center gap-2">
                        <AlertCircle size={14} /> {req.error || 'Request failed'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-bg-700 border border-border rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="text-accent animate-spin" />
                  <span className="text-sm text-gray-400">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border p-3">
          <div className="flex gap-2">
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              className="input-field flex-1 resize-none text-sm"
              rows={2}
              placeholder={state.aiConfig.apiKey ? "Ask about errors, commands, logs..." : "Configure API key first..."}
              disabled={!state.aiConfig.apiKey}
            />
            <button
              onClick={handleSend}
              disabled={!prompt.trim() || sending || !state.aiConfig.apiKey}
              className="btn-primary self-end px-4 py-2.5"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* History Toggle */}
      <button
        onClick={() => setShowHistory(!showHistory)}
        className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
      >
        {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        History ({completedHistory.length} requests)
      </button>
      {showHistory && completedHistory.length > 0 && (
        <div className="card p-3 space-y-2 max-h-48 overflow-y-auto">
          {completedHistory.slice(0, 20).map(req => (
            <button
              key={req.id}
              onClick={() => setSelectedRequest(selectedRequest?.id === req.id ? null : req)}
              className="w-full text-left p-2 rounded-lg hover:bg-bg-700 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-gray-300 truncate flex-1">{req.prompt}</span>
                <span className={`ml-2 ${req.status === 'completed' ? 'text-green-accent' : 'text-red-accent'}`}>
                  {req.status === 'completed' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                </span>
              </div>
            </button>
          ))}
          <button
            onClick={() => { dispatch({ type: 'CLEAR_AI_HISTORY' }); addLog('info', 'ai', 'AI history cleared'); }}
            className="w-full text-left p-2 rounded-lg hover:bg-bg-700 text-xs text-red-400 flex items-center gap-1"
          >
            <Trash2 size={10} /> Clear History
          </button>
        </div>
      )}
    </div>
  );
}
