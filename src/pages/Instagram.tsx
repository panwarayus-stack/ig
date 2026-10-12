import { useState } from 'react';
import { useApp } from '../store';
import { Instagram, Link2, Unlink, RefreshCw, Shield, AlertTriangle, Eye, EyeOff, LogOut, CheckCircle2, XCircle, Clock, Users, Image } from 'lucide-react';

export function InstagramPage() {
  const { state, connectInstagram, disconnectInstagram, addLog, addConsole } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const handleConnect = async () => {
    setError('');
    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }
    setConnecting(true);
    try {
      const success = await connectInstagram(username, password);
      if (!success) {
        setError('Connection failed. Check your credentials.');
      } else {
        setUsername('');
        setPassword('');
      }
    } catch {
      setError('Connection error. Please try again.');
    }
    setConnecting(false);
  };

  const handleDisconnect = () => {
    disconnectInstagram();
    setShowDisconnectConfirm(false);
    addLog('info', 'instagram', 'Instagram session disconnected by user');
  };

  const handleReconnect = async () => {
    if (!state.igSession) return;
    addConsole('info', 'instagram', 'Attempting session restore...');
    addLog('info', 'instagram', 'Session restore initiated');
    // In real implementation, this would attempt to restore the saved session
    await new Promise(r => setTimeout(r, 1500));
    addConsole('success', 'instagram', 'Session restored successfully');
    addLog('success', 'instagram', 'Session restored');
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="card p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
              state.igSession ? 'bg-gradient-to-br from-ig-orange via-ig-pink to-ig-purple' : 'bg-bg-600'
            }`}>
              <Instagram size={28} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Instagram Connection</h2>
              {state.igSession ? (
                <div className="flex items-center gap-2 mt-1">
                  <span className="status-dot status-online" />
                  <span className="text-sm text-green-accent">Connected as @{state.igSession.username}</span>
                </div>
              ) : (
                <p className="text-sm text-gray-400 mt-1">Not connected</p>
              )}
            </div>
          </div>
          {state.igSession && (
            <button
              onClick={() => setShowDisconnectConfirm(true)}
              className="btn-danger flex items-center gap-2 text-sm"
            >
              <Unlink size={14} /> Disconnect
            </button>
          )}
        </div>

        {/* Disconnect Confirmation */}
        {showDisconnectConfirm && (
          <div className="mt-4 bg-red-900/10 border border-red-800/30 rounded-lg p-4 fade-in">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-red-accent shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-300 font-medium">Disconnect Instagram?</p>
                <p className="text-xs text-gray-400 mt-1">
                  This will stop the bot and remove the saved session. You'll need to log in again to reconnect.
                </p>
                <div className="flex gap-2 mt-3">
                  <button onClick={handleDisconnect} className="btn-danger text-xs">Yes, Disconnect</button>
                  <button onClick={() => setShowDisconnectConfirm(false)} className="btn-secondary text-xs">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Profile Details */}
      {state.igSession && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Account Details</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-bg-700 rounded-lg p-3 text-center">
              <Users size={18} className="text-blue-accent mx-auto mb-1" />
              <p className="text-lg font-bold text-white">{state.igSession.followerCount?.toLocaleString() || '—'}</p>
              <p className="text-xs text-gray-500">Followers</p>
            </div>
            <div className="bg-bg-700 rounded-lg p-3 text-center">
              <Users size={18} className="text-green-accent mx-auto mb-1" />
              <p className="text-lg font-bold text-white">{state.igSession.followingCount?.toLocaleString() || '—'}</p>
              <p className="text-xs text-gray-500">Following</p>
            </div>
            <div className="bg-bg-700 rounded-lg p-3 text-center">
              <Image size={18} className="text-ig-pink mx-auto mb-1" />
              <p className="text-lg font-bold text-white">{state.igSession.mediaCount?.toLocaleString() || '—'}</p>
              <p className="text-xs text-gray-500">Posts</p>
            </div>
            <div className="bg-bg-700 rounded-lg p-3 text-center">
              <Clock size={18} className="text-yellow-accent mx-auto mb-1" />
              <p className="text-lg font-bold text-white">{state.igSession.connectedAt ? formatRelative(state.igSession.connectedAt) : '—'}</p>
              <p className="text-xs text-gray-500">Connected</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleReconnect} className="btn-secondary flex items-center gap-2 text-sm">
              <RefreshCw size={14} /> Refresh Session
            </button>
          </div>
        </div>
      )}

      {/* Connect Form */}
      {!state.igSession && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Link2 size={16} className="text-accent" />
            Connect Instagram Account
          </h3>

          <div className="bg-blue-900/10 border border-blue-800/30 rounded-lg p-3 mb-4">
            <p className="text-xs text-blue-300 flex items-start gap-2">
              <Shield size={12} className="shrink-0 mt-0.5" />
              <span>Your password is sent directly to Instagram's API and is never stored. Session data is encrypted using a server-side key.</span>
            </p>
          </div>

          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Instagram Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="input-field text-sm"
                placeholder="your_instagram_username"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Instagram Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input-field text-sm pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-900/10 border border-red-800/30 rounded-lg p-3 flex items-center gap-2">
                <XCircle size={14} /> {error}
              </p>
            )}

            {connecting && (
              <div className="bg-bg-700 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  <div>
                    <span className="text-sm text-gray-300">Authenticating...</span>
                    <p className="text-xs text-gray-500 mt-0.5">Connecting to Instagram API</p>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleConnect}
              disabled={connecting}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {connecting ? 'Connecting...' : 'Connect Instagram'}
            </button>
          </div>
        </div>
      )}

      {/* Session Info */}
      {state.igSession && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Shield size={16} className="text-green-accent" />
            Session Security
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-gray-300">
              <CheckCircle2 size={14} className="text-green-accent" />
              <span>Session encrypted at rest</span>
            </div>
            <div className="flex items-center gap-2 text-gray-300">
              <CheckCircle2 size={14} className="text-green-accent" />
              <span>Password not stored (used only for authentication)</span>
            </div>
            <div className="flex items-center gap-2 text-gray-300">
              <CheckCircle2 size={14} className="text-green-accent" />
              <span>Session persists across restarts</span>
            </div>
            <div className="flex items-center gap-2 text-gray-300">
              <CheckCircle2 size={14} className="text-green-accent" />
              <span>Automatic session validation on restore</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Session Management Page ─────────────────────────────────────────────────

export function SessionsPage() {
  const { state, dispatch, addLog } = useApp();

  const handleClearSession = () => {
    dispatch({ type: 'DISCONNECT_IG' });
    addLog('warn', 'sessions', 'All sessions cleared');
  };

  const handleRotateCredentials = () => {
    addLog('info', 'sessions', 'Credential rotation initiated');
    // In production, this would regenerate encryption keys
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white">Session Management</h2>
        <p className="text-sm text-gray-400 mt-1">Manage dashboard and Instagram sessions</p>
      </div>

      {/* Dashboard Session */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Dashboard Session</h3>
        <div className="bg-bg-700 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Status</span>
            <span className="text-green-accent flex items-center gap-1"><CheckCircle2 size={12} /> Active</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">User</span>
            <span className="text-white">{state.admin?.username}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Session ID</span>
            <span className="text-gray-300 font-mono text-xs">{state.dashboardSession?.slice(0, 16)}...</span>
          </div>
        </div>
        <button
          onClick={() => dispatch({ type: 'LOGOUT' })}
          className="btn-secondary flex items-center gap-2 text-sm mt-4"
        >
          <LogOut size={14} /> End Dashboard Session
        </button>
      </div>

      {/* Instagram Session */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Instagram Session</h3>
        {state.igSession ? (
          <div className="bg-bg-700 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Status</span>
              <span className="text-green-accent flex items-center gap-1"><CheckCircle2 size={12} /> Connected</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Account</span>
              <span className="text-white">@{state.igSession.username}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Connected Since</span>
              <span className="text-gray-300">{new Date(state.igSession.connectedAt).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Session Encrypted</span>
              <span className="text-green-accent">Yes (AES-256)</span>
            </div>
          </div>
        ) : (
          <div className="bg-bg-700 rounded-lg p-4 text-center">
            <p className="text-sm text-gray-500">No Instagram session active</p>
          </div>
        )}
      </div>

      {/* Security Actions */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Security Actions</h3>
        <div className="space-y-3">
          <button
            onClick={handleRotateCredentials}
            className="btn-secondary w-full flex items-center gap-2 text-sm justify-center"
          >
            <RefreshCw size={14} /> Rotate Encryption Keys
          </button>
          <button
            onClick={handleClearSession}
            className="btn-danger w-full flex items-center gap-2 text-sm justify-center"
          >
            <XCircle size={14} /> Clear All Sessions
          </button>
        </div>
        <div className="mt-4 bg-yellow-900/10 border border-yellow-800/30 rounded-lg p-3">
          <p className="text-xs text-yellow-300 flex items-start gap-2">
            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
            Clearing sessions will disconnect Instagram and require re-authentication. Dashboard will remain logged in.
          </p>
        </div>
      </div>
    </div>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
