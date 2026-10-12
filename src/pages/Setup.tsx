import { useState } from 'react';
import { useApp } from '../store';
import { Bot, User, Lock, Instagram, ArrowRight, ArrowLeft, Shield, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

// Simple hash for demo (in production, use bcrypt/argon2 server-side)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'igbot-salt-v1');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function SetupPage() {
  const { state, dispatch, connectInstagram } = useApp();
  const [step, setStep] = useState(1);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [igUsername, setIgUsername] = useState('');
  const [igPassword, setIgPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [igConnecting, setIgConnecting] = useState(false);

  const handleCreateAdmin = async () => {
    setError('');
    if (!adminUsername || adminUsername.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    if (!adminPassword || adminPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (adminPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    const hash = await hashPassword(adminPassword);
    dispatch({
      type: 'COMPLETE_SETUP',
      admin: { username: adminUsername, passwordHash: hash, createdAt: Date.now() },
    });
    setLoading(false);
    setStep(2);
  };

  const handleConnectInstagram = async () => {
    setError('');
    if (!igUsername || !igPassword) {
      setError('Please enter both username and password');
      return;
    }
    setIgConnecting(true);
    try {
      const success = await connectInstagram(igUsername, igPassword);
      if (success) {
        setStep(3);
      } else {
        setError('Connection failed. Please check your credentials.');
      }
    } catch {
      setError('Connection error. Please try again.');
    }
    setIgConnecting(false);
  };

  const handleFinish = () => {
    dispatch({ type: 'LOGIN', session: crypto.randomUUID() });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg-900">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                s < step ? 'bg-green-accent text-white' :
                s === step ? 'bg-accent text-white ring-2 ring-accent/30' :
                'bg-bg-700 text-gray-500'
              }`}>
                {s < step ? <CheckCircle2 size={18} /> : s}
              </div>
              {s < 3 && <div className={`w-12 h-0.5 ${s < step ? 'bg-green-accent' : 'bg-bg-600'}`} />}
            </div>
          ))}
        </div>

        <div className="card p-8">
          {/* Step 1: Admin Account */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-ig-orange via-ig-pink to-ig-purple flex items-center justify-center mx-auto mb-4">
                  <Bot size={28} className="text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white">Welcome to IG Bot Platform</h1>
                <p className="text-sm text-gray-400 mt-2">Create your administrator account to get started</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Admin Username</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="text"
                      value={adminUsername}
                      onChange={e => setAdminUsername(e.target.value)}
                      className="input-field pl-10"
                      placeholder="admin"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={adminPassword}
                      onChange={e => setAdminPassword(e.target.value)}
                      className="input-field pl-10 pr-10"
                      placeholder="Min 6 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <Shield size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="input-field pl-10"
                      placeholder="Re-enter password"
                    />
                  </div>
                </div>
              </div>

              {error && <p className="text-red-400 text-sm bg-red-900/10 border border-red-800/30 rounded-lg p-3">{error}</p>}

              <button onClick={handleCreateAdmin} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                {loading ? 'Creating...' : 'Create Account'}
                <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* Step 2: Instagram Login */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-ig-orange via-ig-pink to-ig-purple flex items-center justify-center mx-auto mb-4">
                  <Instagram size={28} className="text-white" />
                </div>
                <h2 className="text-xl font-bold text-white">Connect Instagram</h2>
                <p className="text-sm text-gray-400 mt-2">Enter your Instagram credentials to connect the bot</p>
              </div>

              <div className="bg-yellow-900/10 border border-yellow-800/30 rounded-lg p-3">
                <p className="text-xs text-yellow-300">
                  <Shield size={12} className="inline mr-1" />
                  Your password is used only for authentication and is never stored in plaintext. Session data is encrypted at rest.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Instagram Username</label>
                  <input
                    type="text"
                    value={igUsername}
                    onChange={e => setIgUsername(e.target.value)}
                    className="input-field"
                    placeholder="your_instagram_username"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Instagram Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={igPassword}
                      onChange={e => setIgPassword(e.target.value)}
                      className="input-field pr-10"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              {error && <p className="text-red-400 text-sm bg-red-900/10 border border-red-800/30 rounded-lg p-3">{error}</p>}

              {igConnecting && (
                <div className="bg-bg-700 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-gray-300">Authenticating with Instagram...</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">This may take a moment. If 2FA is required, you'll be prompted.</p>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="btn-secondary flex items-center gap-2">
                  <ArrowLeft size={16} /> Back
                </button>
                <button
                  onClick={handleConnectInstagram}
                  disabled={igConnecting}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {igConnecting ? 'Connecting...' : 'Connect Instagram'}
                  {!igConnecting && <ArrowRight size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Complete */}
          {step === 3 && (
            <div className="space-y-6 text-center">
              <div className="w-16 h-16 rounded-full bg-green-accent/20 flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-green-accent" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Setup Complete!</h2>
                <p className="text-sm text-gray-400 mt-2">
                  Your dashboard is ready. You're connected as <strong className="text-white">@{state.igSession?.username}</strong>.
                </p>
              </div>

              <div className="bg-bg-700 rounded-lg p-4 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Admin</span>
                  <span className="text-white">{adminUsername}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Instagram</span>
                  <span className="text-white">@{state.igSession?.username}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Status</span>
                  <span className="text-green-accent">Connected</span>
                </div>
              </div>

              <button onClick={handleFinish} className="btn-primary w-full flex items-center justify-center gap-2">
                Open Dashboard
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Login Page ──────────────────────────────────────────────────────────────

export function LoginPage() {
  const { state, dispatch } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const hash = await hashPassword(password);
    if (state.admin && username === state.admin.username && hash === state.admin.passwordHash) {
      dispatch({ type: 'LOGIN', session: crypto.randomUUID() });
    } else {
      setError('Invalid username or password');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg-900">
      <div className="w-full max-w-sm">
        <div className="card p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-ig-orange via-ig-pink to-ig-purple flex items-center justify-center mx-auto mb-3">
              <Bot size={24} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">IG Bot Platform</h1>
            <p className="text-sm text-gray-400 mt-1">Sign in to your dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Username</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="input-field pl-10"
                  placeholder="admin"
                  autoFocus
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input-field pl-10"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && <p className="text-red-400 text-sm bg-red-900/10 border border-red-800/30 rounded-lg p-3">{error}</p>}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
