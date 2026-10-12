import React, { createContext, useContext, useReducer, useEffect, useCallback, type ReactNode } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type BotStatus = 'online' | 'offline' | 'starting' | 'error';
export type LogSeverity = 'info' | 'warn' | 'error' | 'success' | 'debug';
export type AIRequestStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AdminAccount {
  username: string;
  passwordHash: string;
  createdAt: number;
}

export interface IGSession {
  username: string;
  connectedAt: number;
  status: 'connected' | 'disconnected' | 'challenge';
  profilePic?: string;
  followerCount?: number;
  followingCount?: number;
  mediaCount?: number;
  sessionData?: string;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  severity: LogSeverity;
  module: string;
  message: string;
  details?: string;
}

export interface BotCommand {
  id: string;
  name: string;
  description: string;
  usage: string;
  aliases: string[];
  enabled: boolean;
  executionCount: number;
  lastExecuted?: number;
  createdAt: number;
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  action: string;
  enabled: boolean;
  cooldown: number;
  lastTriggered?: number;
  executionCount: number;
  createdAt: number;
}

export interface AIRequest {
  id: string;
  prompt: string;
  response?: string;
  status: AIRequestStatus;
  model: string;
  createdAt: number;
  completedAt?: number;
  error?: string;
  tokensUsed?: number;
}

export interface AIConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  timeout: number;
  availableModels: string[];
}

export interface CodePatch {
  id: string;
  filePath: string;
  originalContent: string;
  proposedContent: string;
  explanation: string;
  status: 'pending' | 'approved' | 'rejected' | 'rolled_back';
  createdAt: number;
  appliedAt?: number;
}

export interface AppState {
  setupComplete: boolean;
  admin: AdminAccount | null;
  dashboardSession: string | null;
  igSession: IGSession | null;
  botStatus: BotStatus;
  botStartedAt: number | null;
  botLastRestart: number | null;
  commands: BotCommand[];
  automationRules: AutomationRule[];
  logs: LogEntry[];
  consoleOutput: LogEntry[];
  aiConfig: AIConfig;
  aiQueue: AIRequest[];
  aiHistory: AIRequest[];
  codePatches: CodePatch[];
  settings: {
    logLevel: string;
    retryLimit: number;
    retryBackoff: number;
    healthCheckInterval: number;
  };
  errorCount: number;
}

// ─── Default State ───────────────────────────────────────────────────────────

const defaultCommands: BotCommand[] = [
  { id: 'cmd-1', name: 'help', description: 'Show available commands', usage: '!help', aliases: ['h', 'commands'], enabled: true, executionCount: 0, createdAt: Date.now() },
  { id: 'cmd-2', name: 'ping', description: 'Check bot response time', usage: '!ping', aliases: [], enabled: true, executionCount: 0, createdAt: Date.now() },
  { id: 'cmd-3', name: 'uptime', description: 'Show bot uptime', usage: '!uptime', aliases: [], enabled: true, executionCount: 0, createdAt: Date.now() },
  { id: 'cmd-4', name: 'info', description: 'Display bot information', usage: '!info', aliases: ['about'], enabled: true, executionCount: 0, createdAt: Date.now() },
  { id: 'cmd-5', name: 'account', description: 'Check Instagram account info', usage: '!account', aliases: ['me', 'profile'], enabled: true, executionCount: 0, createdAt: Date.now() },
  { id: 'cmd-6', name: 'inbox', description: 'List recent direct messages', usage: '!inbox [count]', aliases: ['messages', 'dm'], enabled: true, executionCount: 0, createdAt: Date.now() },
  { id: 'cmd-7', name: 'activity', description: 'Show recent activity feed', usage: '!activity', aliases: ['recent', 'feed'], enabled: true, executionCount: 0, createdAt: Date.now() },
  { id: 'cmd-8', name: 'stats', description: 'Show bot statistics', usage: '!stats', aliases: ['statistics'], enabled: true, executionCount: 0, createdAt: Date.now() },
];

const defaultRules: AutomationRule[] = [
  { id: 'rule-1', name: 'Auto Welcome', description: 'Welcome new followers', trigger: 'new_follower', action: 'send_message', enabled: false, cooldown: 3600, executionCount: 0, createdAt: Date.now() },
  { id: 'rule-2', name: 'Auto Reply Keywords', description: 'Reply to messages containing keywords', trigger: 'keyword_match', action: 'send_reply', enabled: false, cooldown: 60, executionCount: 0, createdAt: Date.now() },
  { id: 'rule-3', name: 'Daily Stats Report', description: 'Send daily statistics summary', trigger: 'schedule:daily', action: 'send_stats', enabled: false, cooldown: 86400, executionCount: 0, createdAt: Date.now() },
];

const defaultModels = [
  'google/gemini-2.0-flash-exp:free',
  'google/gemma-3-27b-it:free',
  'meta-llama/llama-4-maverick:free',
  'meta-llama/llama-4-scout:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'qwen/qwen3-235b-a22b:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
];

const initialState: AppState = {
  setupComplete: false,
  admin: null,
  dashboardSession: null,
  igSession: null,
  botStatus: 'offline',
  botStartedAt: null,
  botLastRestart: null,
  commands: defaultCommands,
  automationRules: defaultRules,
  logs: [],
  consoleOutput: [],
  aiConfig: {
    apiKey: '',
    model: defaultModels[0],
    maxTokens: 4096,
    timeout: 60000,
    availableModels: defaultModels,
  },
  aiQueue: [],
  aiHistory: [],
  codePatches: [],
  settings: {
    logLevel: 'info',
    retryLimit: 3,
    retryBackoff: 5000,
    healthCheckInterval: 30000,
  },
  errorCount: 0,
};

// ─── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'igbot-platform-state';

function loadState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...initialState, ...parsed };
    }
  } catch { /* ignore */ }
  return initialState;
}

function saveState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

type Action =
  | { type: 'COMPLETE_SETUP'; admin: AdminAccount }
  | { type: 'LOGIN'; session: string }
  | { type: 'LOGOUT' }
  | { type: 'CONNECT_IG'; session: IGSession }
  | { type: 'DISCONNECT_IG' }
  | { type: 'SET_BOT_STATUS'; status: BotStatus }
  | { type: 'TOGGLE_COMMAND'; id: string }
  | { type: 'ADD_COMMAND'; command: BotCommand }
  | { type: 'EXECUTE_COMMAND'; id: string }
  | { type: 'DELETE_COMMAND'; id: string }
  | { type: 'TOGGLE_RULE'; id: string }
  | { type: 'ADD_RULE'; rule: AutomationRule }
  | { type: 'DELETE_RULE'; id: string }
  | { type: 'ADD_LOG'; entry: LogEntry }
  | { type: 'CLEAR_LOGS' }
  | { type: 'ADD_CONSOLE'; entry: LogEntry }
  | { type: 'CLEAR_CONSOLE' }
  | { type: 'SET_AI_CONFIG'; config: Partial<AIConfig> }
  | { type: 'ADD_AI_REQUEST'; request: AIRequest }
  | { type: 'UPDATE_AI_REQUEST'; id: string; updates: Partial<AIRequest> }
  | { type: 'CANCEL_AI_REQUEST'; id: string }
  | { type: 'CLEAR_AI_HISTORY' }
  | { type: 'ADD_CODE_PATCH'; patch: CodePatch }
  | { type: 'UPDATE_CODE_PATCH'; id: string; status: CodePatch['status'] }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<AppState['settings']> }
  | { type: 'INCREMENT_ERROR' }
  | { type: 'RESET_STATE' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'COMPLETE_SETUP':
      return { ...state, setupComplete: true, admin: action.admin };
    case 'LOGIN':
      return { ...state, dashboardSession: action.session };
    case 'LOGOUT':
      return { ...state, dashboardSession: null };
    case 'CONNECT_IG':
      return { ...state, igSession: action.session };
    case 'DISCONNECT_IG':
      return { ...state, igSession: null, botStatus: 'offline', botStartedAt: null };
    case 'SET_BOT_STATUS':
      return {
        ...state,
        botStatus: action.status,
        botStartedAt: action.status === 'online' ? Date.now() : state.botStartedAt,
        botLastRestart: action.status === 'online' ? Date.now() : state.botLastRestart,
      };
    case 'TOGGLE_COMMAND':
      return {
        ...state,
        commands: state.commands.map(c => c.id === action.id ? { ...c, enabled: !c.enabled } : c),
      };
    case 'ADD_COMMAND':
      return { ...state, commands: [...state.commands, action.command] };
    case 'EXECUTE_COMMAND':
      return {
        ...state,
        commands: state.commands.map(c =>
          c.id === action.id ? { ...c, executionCount: c.executionCount + 1, lastExecuted: Date.now() } : c
        ),
      };
    case 'DELETE_COMMAND':
      return { ...state, commands: state.commands.filter(c => c.id !== action.id) };
    case 'TOGGLE_RULE':
      return {
        ...state,
        automationRules: state.automationRules.map(r => r.id === action.id ? { ...r, enabled: !r.enabled } : r),
      };
    case 'ADD_RULE':
      return { ...state, automationRules: [...state.automationRules, action.rule] };
    case 'DELETE_RULE':
      return { ...state, automationRules: state.automationRules.filter(r => r.id !== action.id) };
    case 'ADD_LOG':
      return { ...state, logs: [action.entry, ...state.logs].slice(0, 1000) };
    case 'CLEAR_LOGS':
      return { ...state, logs: [] };
    case 'ADD_CONSOLE':
      return { ...state, consoleOutput: [action.entry, ...state.consoleOutput].slice(0, 2000) };
    case 'CLEAR_CONSOLE':
      return { ...state, consoleOutput: [] };
    case 'SET_AI_CONFIG':
      return { ...state, aiConfig: { ...state.aiConfig, ...action.config } };
    case 'ADD_AI_REQUEST':
      return {
        ...state,
        aiQueue: [...state.aiQueue, action.request],
        aiHistory: [action.request, ...state.aiHistory].slice(0, 100),
      };
    case 'UPDATE_AI_REQUEST': {
      const updateInArray = (arr: AIRequest[]) =>
        arr.map(r => r.id === action.id ? { ...r, ...action.updates } : r);
      return {
        ...state,
        aiQueue: updateInArray(state.aiQueue),
        aiHistory: updateInArray(state.aiHistory),
      };
    }
    case 'CANCEL_AI_REQUEST':
      return {
        ...state,
        aiQueue: state.aiQueue.filter(r => r.id !== action.id),
        aiHistory: state.aiHistory.map(r =>
          r.id === action.id ? { ...r, status: 'cancelled' as const } : r
        ),
      };
    case 'CLEAR_AI_HISTORY':
      return { ...state, aiHistory: [], aiQueue: [] };
    case 'ADD_CODE_PATCH':
      return { ...state, codePatches: [action.patch, ...state.codePatches] };
    case 'UPDATE_CODE_PATCH':
      return {
        ...state,
        codePatches: state.codePatches.map(p =>
          p.id === action.id ? { ...p, status: action.status, appliedAt: action.status === 'approved' ? Date.now() : p.appliedAt } : p
        ),
      };
    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.settings } };
    case 'INCREMENT_ERROR':
      return { ...state, errorCount: state.errorCount + 1 };
    case 'RESET_STATE':
      return initialState;
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  addLog: (severity: LogSeverity, module: string, message: string, details?: string) => void;
  addConsole: (severity: LogSeverity, module: string, message: string) => void;
  startBot: () => Promise<void>;
  stopBot: () => Promise<void>;
  restartBot: () => Promise<void>;
  connectInstagram: (username: string, password: string) => Promise<boolean>;
  disconnectInstagram: () => void;
  sendAIMessage: (prompt: string) => Promise<string | null>;
  cancelAIRequest: (id: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  // Persist state changes
  useEffect(() => {
    saveState(state);
  }, [state]);

  const addLog = useCallback((severity: LogSeverity, module: string, message: string, details?: string) => {
    dispatch({
      type: 'ADD_LOG',
      entry: { id: crypto.randomUUID(), timestamp: Date.now(), severity, module, message, details },
    });
  }, []);

  const addConsole = useCallback((severity: LogSeverity, module: string, message: string) => {
    dispatch({
      type: 'ADD_CONSOLE',
      entry: { id: crypto.randomUUID(), timestamp: Date.now(), severity, module, message },
    });
  }, []);

  const startBot = useCallback(async () => {
    if (state.botStatus === 'online' || state.botStatus === 'starting') return;
    if (!state.igSession) {
      addLog('error', 'bot', 'Cannot start bot: Instagram not connected');
      return;
    }
    dispatch({ type: 'SET_BOT_STATUS', status: 'starting' });
    addConsole('info', 'bot', 'Starting bot process...');
    addLog('info', 'bot', 'Bot starting');

    await new Promise(r => setTimeout(r, 1500));
    addConsole('info', 'instagram', 'Restoring session...');
    await new Promise(r => setTimeout(r, 800));
    addConsole('success', 'instagram', `Session restored for @${state.igSession?.username}`);
    addConsole('info', 'commands', `Loading ${state.commands.filter(c => c.enabled).length} commands...`);
    await new Promise(r => setTimeout(r, 500));
    addConsole('success', 'commands', 'All commands registered');
    addConsole('info', 'bot', 'Listening for incoming messages...');

    dispatch({ type: 'SET_BOT_STATUS', status: 'online' });
    addLog('success', 'bot', 'Bot started successfully');
    addConsole('success', 'bot', '✓ Bot is online and ready');
  }, [state.botStatus, state.igSession, state.commands, addLog, addConsole]);

  const stopBot = useCallback(async () => {
    if (state.botStatus === 'offline') return;
    addConsole('warn', 'bot', 'Shutting down bot...');
    addLog('info', 'bot', 'Bot stopping');
    await new Promise(r => setTimeout(r, 800));
    addConsole('info', 'bot', 'Closing Instagram connection...');
    await new Promise(r => setTimeout(r, 400));
    dispatch({ type: 'SET_BOT_STATUS', status: 'offline' });
    addConsole('success', 'bot', 'Bot stopped');
    addLog('info', 'bot', 'Bot stopped');
  }, [state.botStatus, addLog, addConsole]);

  const restartBot = useCallback(async () => {
    await stopBot();
    await new Promise(r => setTimeout(r, 500));
    await startBot();
  }, [stopBot, startBot]);

  const connectInstagram = useCallback(async (username: string, password: string): Promise<boolean> => {
    addConsole('info', 'instagram', `Authenticating @${username}...`);
    addLog('info', 'instagram', 'Login attempt started');

    await new Promise(r => setTimeout(r, 2000));
    addConsole('info', 'instagram', 'Generating device fingerprint...');
    await new Promise(r => setTimeout(r, 800));
    addConsole('info', 'instagram', 'Sending login request...');
    await new Promise(r => setTimeout(r, 1500));

    // Simulate successful connection
    dispatch({
      type: 'CONNECT_IG',
      session: {
        username,
        connectedAt: Date.now(),
        status: 'connected',
        followerCount: Math.floor(Math.random() * 5000) + 100,
        followingCount: Math.floor(Math.random() * 1000) + 50,
        mediaCount: Math.floor(Math.random() * 200) + 10,
      },
    });
    addConsole('success', 'instagram', `✓ Connected as @${username}`);
    addLog('success', 'instagram', `Instagram connected: @${username}`);
    // Note: password is never stored
    return true;
  }, [addConsole, addLog]);

  const disconnectInstagram = useCallback(() => {
    dispatch({ type: 'DISCONNECT_IG' });
    addConsole('warn', 'instagram', 'Session disconnected');
    addLog('info', 'instagram', 'Instagram disconnected');
  }, [addConsole, addLog]);

  const sendAIMessage = useCallback(async (prompt: string): Promise<string | null> => {
    const { aiConfig, aiQueue } = state;
    if (!aiConfig.apiKey) {
      addLog('error', 'ai', 'OpenRouter API key not configured');
      return null;
    }

    const requestId = crypto.randomUUID();
    const request: AIRequest = {
      id: requestId,
      prompt,
      status: 'queued',
      model: aiConfig.model,
      createdAt: Date.now(),
    };

    dispatch({ type: 'ADD_AI_REQUEST', request });
    addLog('info', 'ai', `AI request queued: ${prompt.slice(0, 50)}...`);

    // Wait if there's already a running request
    const hasRunning = aiQueue.some(r => r.status === 'running');
    if (hasRunning) {
      await new Promise(r => setTimeout(r, 2000));
    }

    dispatch({ type: 'UPDATE_AI_REQUEST', id: requestId, updates: { status: 'running' } });
    addConsole('info', 'ai', `Processing AI request [${aiConfig.model}]...`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), aiConfig.timeout);

      const systemPrompt = `You are an AI assistant for an Instagram bot hosting platform. You help diagnose errors, explain logs, suggest code fixes, and manage bot commands. Be concise and technical. The bot uses instagram-private-api with a command system (! prefix). Current commands: ${state.commands.map(c => c.name).join(', ')}. Bot status: ${state.botStatus}. Recent errors: ${state.logs.filter(l => l.severity === 'error').slice(0, 5).map(l => l.message).join('; ') || 'none'}.`;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'IG Bot Platform',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: aiConfig.maxTokens,
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || 'No response generated.';
      const tokens = data.usage?.total_tokens;

      dispatch({
        type: 'UPDATE_AI_REQUEST',
        id: requestId,
        updates: { status: 'completed', response: content, completedAt: Date.now(), tokensUsed: tokens },
      });
      addConsole('success', 'ai', 'AI request completed');
      return content;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      const isAbort = errorMsg.includes('abort') || errorMsg.includes('AbortError');
      const finalStatus: AIRequestStatus = isAbort ? 'failed' : 'failed';
      const finalError = isAbort ? 'Request timed out' : errorMsg;

      dispatch({
        type: 'UPDATE_AI_REQUEST',
        id: requestId,
        updates: { status: finalStatus, error: finalError, completedAt: Date.now() },
      });
      addConsole('error', 'ai', `AI request failed: ${finalError}`);
      addLog('error', 'ai', `AI request failed: ${finalError}`);
      dispatch({ type: 'INCREMENT_ERROR' });
      return null;
    }
  }, [state, addLog, addConsole]);

  const cancelAIRequest = useCallback((id: string) => {
    dispatch({ type: 'CANCEL_AI_REQUEST', id });
    addConsole('warn', 'ai', `Request ${id.slice(0, 8)} cancelled`);
  }, [addConsole]);

  return (
    <AppContext.Provider value={{
      state, dispatch, addLog, addConsole,
      startBot, stopBot, restartBot,
      connectInstagram, disconnectInstagram,
      sendAIMessage, cancelAIRequest,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
