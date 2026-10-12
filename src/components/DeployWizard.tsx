import { useState } from 'react';
import { Download, Copy, Check, AlertTriangle, CheckCircle2 } from 'lucide-react';

export function DeployWizard() {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState({
    igUsername: '',
    igPassword: '',
    sessionSecret: '',
    sessionPath: './data/session.json',
    logLevel: 'info',
    port: '3000',
  });
  const [copied, setCopied] = useState('');

  const handleCopy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const generateEnvFile = () => {
    return `# Instagram Credentials
IG_USERNAME=${config.igUsername}
IG_PASSWORD=${config.igPassword}

# Session Configuration
SESSION_PATH=${config.sessionPath}
SESSION_SECRET=${config.sessionSecret}

# Server Configuration
PORT=${config.port}

# Logging
LOG_LEVEL=${config.logLevel}

# Database
DATABASE_PATH=./data/bot.db`;
  };

  const generateRenderYaml = () => {
    return `services:
  - type: web
    name: ig-bot
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: IG_USERNAME
        sync: false
      - key: IG_PASSWORD
        sync: false
      - key: SESSION_SECRET
        generateValue: true
      - key: SESSION_PATH
        value: ./data/session.json
      - key: PORT
        value: "3000"
      - key: LOG_LEVEL
        value: info
      - key: DATABASE_PATH
        value: ./data/bot.db`;
  };

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isStep1Valid = config.igUsername && config.igPassword && config.sessionSecret;

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <Download size={24} className="text-purple-400" />
        Deployment Wizard
      </h3>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                s <= step
                  ? 'bg-gradient-to-br from-ig-orange to-ig-pink text-white'
                  : 'bg-[#21262d] text-gray-500'
              }`}
            >
              {s < step ? <CheckCircle2 size={16} /> : s}
            </div>
            {s < 3 && <div className={`flex-1 h-0.5 ${s < step ? 'bg-purple-500' : 'bg-[#30363d]'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Configuration */}
      {step === 1 && (
        <div className="space-y-4">
          <h4 className="text-lg font-semibold text-white">Step 1: Configuration</h4>
          <p className="text-sm text-gray-400">
            Enter your Instagram credentials and configuration. All values are stored locally in your browser.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Instagram Username <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={config.igUsername}
                onChange={(e) => setConfig({ ...config, igUsername: e.target.value })}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                placeholder="your_instagram_username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Instagram Password <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                value={config.igPassword}
                onChange={(e) => setConfig({ ...config, igPassword: e.target.value })}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Session Secret <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.sessionSecret}
                  onChange={(e) => setConfig({ ...config, sessionSecret: e.target.value })}
                  className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-purple-500"
                  placeholder="Random secret for session encryption"
                />
                <button
                  onClick={() =>
                    setConfig({
                      ...config,
                      sessionSecret: Array.from({ length: 32 }, () =>
                        Math.random().toString(36)[2]
                      ).join(''),
                    })
                  }
                  className="px-3 py-2 bg-[#21262d] border border-[#30363d] rounded-lg text-gray-300 hover:bg-[#30363d] text-sm"
                >
                  Generate
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Port</label>
                <input
                  type="text"
                  value={config.port}
                  onChange={(e) => setConfig({ ...config, port: e.target.value })}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Log Level</label>
                <select
                  value={config.logLevel}
                  onChange={(e) => setConfig({ ...config, logLevel: e.target.value })}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="trace">trace</option>
                  <option value="debug">debug</option>
                  <option value="info">info</option>
                  <option value="warn">warn</option>
                  <option value="error">error</option>
                </select>
              </div>
            </div>
          </div>

          <button
            onClick={() => setStep(2)}
            disabled={!isStep1Valid}
            className="w-full py-2 bg-gradient-to-r from-ig-orange to-ig-pink text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            Next: Generate Files
          </button>
        </div>
      )}

      {/* Step 2: Generated Files */}
      {step === 2 && (
        <div className="space-y-4">
          <h4 className="text-lg font-semibold text-white">Step 2: Generated Configuration</h4>
          <p className="text-sm text-gray-400">
            Download these files and add them to your project root.
          </p>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-300">.env file</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopy(generateEnvFile(), 'env')}
                    className="px-3 py-1 bg-[#21262d] border border-[#30363d] rounded text-xs text-gray-300 hover:bg-[#30363d] flex items-center gap-1"
                  >
                    {copied === 'env' ? <Check size={12} /> : <Copy size={12} />}
                    Copy
                  </button>
                  <button
                    onClick={() => handleDownload(generateEnvFile(), '.env')}
                    className="px-3 py-1 bg-purple-600 rounded text-xs text-white hover:bg-purple-700 flex items-center gap-1"
                  >
                    <Download size={12} />
                    Download
                  </button>
                </div>
              </div>
              <pre className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3 text-xs text-gray-300 overflow-x-auto">
                {generateEnvFile()}
              </pre>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-300">render.yaml (for Render.com)</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopy(generateRenderYaml(), 'render')}
                    className="px-3 py-1 bg-[#21262d] border border-[#30363d] rounded text-xs text-gray-300 hover:bg-[#30363d] flex items-center gap-1"
                  >
                    {copied === 'render' ? <Check size={12} /> : <Copy size={12} />}
                    Copy
                  </button>
                  <button
                    onClick={() => handleDownload(generateRenderYaml(), 'render.yaml')}
                    className="px-3 py-1 bg-purple-600 rounded text-xs text-white hover:bg-purple-700 flex items-center gap-1"
                  >
                    <Download size={12} />
                    Download
                  </button>
                </div>
              </div>
              <pre className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3 text-xs text-gray-300 overflow-x-auto">
                {generateRenderYaml()}
              </pre>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-2 bg-[#21262d] border border-[#30363d] text-gray-300 font-semibold rounded-lg hover:bg-[#30363d]"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex-1 py-2 bg-gradient-to-r from-ig-orange to-ig-pink text-white font-semibold rounded-lg hover:opacity-90"
            >
              Next: Deploy Instructions
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Deployment Instructions */}
      {step === 3 && (
        <div className="space-y-4">
          <h4 className="text-lg font-semibold text-white">Step 3: Deploy to Render.com</h4>

          <div className="bg-yellow-900/10 border border-yellow-800/30 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle size={20} className="text-yellow-400 shrink-0 mt-0.5" />
              <div className="text-sm text-gray-300">
                <strong className="text-yellow-400">Important:</strong> Make sure you've added the downloaded files to your GitHub repository before deploying.
              </div>
            </div>
          </div>

          <div className="space-y-3 text-sm text-gray-300">
            <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4">
              <h5 className="text-white font-semibold mb-2">1. Add files to your repository</h5>
              <code className="text-green-400 text-xs">
                git add .env render.yaml<br />
                git commit -m "Add deployment configuration"<br />
                git push
              </code>
            </div>

            <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4">
              <h5 className="text-white font-semibold mb-2">2. Connect to Render.com</h5>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Go to <a href="https://render.com" target="_blank" rel="noopener" className="text-purple-400 hover:underline">render.com</a></li>
                <li>Click "New +" → "Web Service"</li>
                <li>Connect your GitHub repository</li>
                <li>Render will auto-detect render.yaml</li>
                <li>Click "Create Web Service"</li>
              </ol>
            </div>

            <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4">
              <h5 className="text-white font-semibold mb-2">3. Set Environment Variables in Render Dashboard</h5>
              <p className="text-xs mb-2">Even with render.yaml, you need to set sensitive values manually in Render's dashboard:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Go to your service → "Environment"</li>
                <li>Add IG_USERNAME and IG_PASSWORD from your .env file</li>
                <li>SESSION_SECRET is auto-generated by render.yaml</li>
              </ul>
            </div>

            <div className="bg-green-900/10 border border-green-800/30 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 size={20} className="text-green-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <strong className="text-green-400">Success!</strong> Your bot will now deploy automatically. Check the logs to verify it's running.
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              className="flex-1 py-2 bg-[#21262d] border border-[#30363d] text-gray-300 font-semibold rounded-lg hover:bg-[#30363d]"
            >
              Back
            </button>
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-2 bg-gradient-to-r from-ig-orange to-ig-pink text-white font-semibold rounded-lg hover:opacity-90"
            >
              Start Over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
