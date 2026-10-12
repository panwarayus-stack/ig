import { useState, type ReactNode } from 'react';
import { CodeBlock } from './components/CodeBlock';
import { FileTree } from './components/FileTree';
import { DeployWizard } from './components/DeployWizard';
import { botFiles } from './data/botFiles';
import {
  Terminal,
  FileCode,
  Shield,
  Zap,
  Package,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Server,
  Clock,
  MessageSquare,
  HelpCircle,
  Info,
  Rocket,
} from 'lucide-react';

type Tab = 'overview' | 'setup' | 'files' | 'commands' | 'architecture' | 'deploy';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedFile, setSelectedFile] = useState(0);

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Info size={16} /> },
    { id: 'setup', label: 'Setup', icon: <Terminal size={16} /> },
    { id: 'files', label: 'Source Code', icon: <FileCode size={16} /> },
    { id: 'commands', label: 'Commands', icon: <MessageSquare size={16} /> },
    { id: 'architecture', label: 'Architecture', icon: <Shield size={16} /> },
    { id: 'deploy', label: 'Deploy', icon: <Rocket size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Header */}
      <header className="border-b border-[#30363d] bg-[#0d1117]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-ig-orange via-ig-pink to-ig-purple flex items-center justify-center">
                <MessageSquare size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold gradient-text">IG Bot</h1>
                <p className="text-xs text-gray-500">Setup & Documentation</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 text-xs rounded-full bg-green-900/30 text-green-400 border border-green-800/50">
                v1.0.0
              </span>
              <span className="px-2 py-1 text-xs rounded-full bg-purple-900/30 text-purple-400 border border-purple-800/50">
                Node.js v26
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="border-b border-[#30363d] bg-[#0d1117]/50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-purple-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'setup' && <SetupTab />}
        {activeTab === 'files' && (
          <FilesTab selectedFile={selectedFile} setSelectedFile={setSelectedFile} />
        )}
        {activeTab === 'commands' && <CommandsTab />}
        {activeTab === 'architecture' && <ArchitectureTab />}
        {activeTab === 'deploy' && <DeployTab />}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#30363d] py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>IG Bot — Built with instagram-private-api • ES Modules • Pino Logger</p>
          <p className="mt-1">Compatible with Termux (Android) and Linux VPS deployments</p>
        </div>
      </footer>
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center py-8">
        <h2 className="text-4xl font-bold gradient-text mb-4">
          Instagram Bot with Command System
        </h2>
        <p className="text-gray-400 max-w-2xl mx-auto text-lg">
          A modular, production-ready Instagram bot built for Termux and Linux VPS.
          Features session management, a command router, structured logging, and extensible architecture.
        </p>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <FeatureCard
          icon={<Shield className="text-purple-400" size={24} />}
          title="Secure Sessions"
          description="Session persistence with automatic restore. Credentials never logged. Handles 2FA and challenges safely."
        />
        <FeatureCard
          icon={<Zap className="text-yellow-400" size={24} />}
          title="Command System"
          description="Modular command router with ! prefix. Easy to register, extend, and test independently."
        />
        <FeatureCard
          icon={<Package className="text-blue-400" size={24} />}
          title="Rich Dependencies"
          description="14 production packages including sharp, better-sqlite3, cheerio, zod validation, and more."
        />
        <FeatureCard
          icon={<Server className="text-green-400" size={24} />}
          title="Cross-Platform"
          description="Designed for Termux on Android with seamless migration to Linux VPS deployment."
        />
        <FeatureCard
          icon={<Clock className="text-pink-400" size={24} />}
          title="Structured Logging"
          description="Pino-based logging with module-scoped child loggers. Never exposes sensitive data."
        />
        <FeatureCard
          icon={<FileCode className="text-orange-400" size={24} />}
          title="ES Modules"
          description="Modern JavaScript with native ES module imports. Clean, testable, and maintainable."
        />
      </div>

      {/* Quick Start */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Terminal size={20} className="text-green-400" />
          Quick Start
        </h3>
        <div className="space-y-3">
          <CodeBlock
            language="bash"
            code={`# 1. Clone and enter the project
cd ~/ig-bot

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
nano .env  # Add your Instagram credentials

# 4. Start the bot
npm start

# Or for development with auto-reload:
npm run dev`}
          />
        </div>
      </div>

      {/* Important Notes */}
      <div className="bg-yellow-900/10 border border-yellow-800/30 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-yellow-400 mb-3 flex items-center gap-2">
          <AlertTriangle size={20} />
          Important Notes
        </h3>
        <ul className="space-y-2 text-gray-300 text-sm">
          <li className="flex items-start gap-2">
            <ChevronRight size={14} className="text-yellow-500 mt-1 shrink-0" />
            <span>Instagram's unofficial API may change or trigger account security restrictions.</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight size={14} className="text-yellow-500 mt-1 shrink-0" />
            <span>Two-factor authentication and CAPTCHAs cannot be bypassed — handle them manually.</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight size={14} className="text-yellow-500 mt-1 shrink-0" />
            <span>On Termux, <code className="bg-[#21262d] px-1 rounded">better-sqlite3</code> and <code className="bg-[#21262d] px-1 rounded">sharp</code> may need native build tools.</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight size={14} className="text-yellow-500 mt-1 shrink-0" />
            <span>Real Instagram login and message delivery require valid credentials and cannot be tested here.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 card-glow">
      <div className="mb-3">{icon}</div>
      <h3 className="text-white font-semibold mb-2">{title}</h3>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
  );
}

// ─── Setup Tab ───────────────────────────────────────────────────────────────

function SetupTab() {
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-white">Setup Guide</h2>

      {/* Step 1 */}
      <SetupStep number={1} title="Create Project Directory">
        <CodeBlock
          language="bash"
          code={`mkdir -p ~/ig-bot && cd ~/ig-bot
mkdir -p src/commands src/lib data tests`}
        />
      </SetupStep>

      {/* Step 2 */}
      <SetupStep number={2} title="Initialize Project & Install Dependencies">
        <CodeBlock
          language="bash"
          code={`# Initialize package.json
npm init -y

# Set module type to ES modules
# (Edit package.json: add "type": "module")

# Install production dependencies
npm install instagram-private-api dotenv express \\
  better-sqlite3 axios pino zod cheerio sharp \\
  file-type mime-types nanoid p-limit

# Install dev dependencies
npm install -D vitest eslint`}
        />
        <div className="mt-4 bg-blue-900/10 border border-blue-800/30 rounded-lg p-4">
          <h4 className="text-blue-400 font-medium text-sm mb-2">📱 Termux-Specific Notes</h4>
          <ul className="text-sm text-gray-300 space-y-1">
            <li>• Install build tools first: <code className="bg-[#21262d] px-1 rounded">pkg install build-essential python</code></li>
            <li>• For <code className="bg-[#21262d] px-1 rounded">better-sqlite3</code>: may need <code className="bg-[#21262d] px-1 rounded">npm install --build-from-source</code></li>
            <li>• For <code className="bg-[#21262d] px-1 rounded">sharp</code>: use <code className="bg-[#21262d] px-1 rounded">SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install sharp</code></li>
            <li>• If ECONNABORTED occurs: <code className="bg-[#21262d] px-1 rounded">npm config set fetch-timeout 120000</code></li>
          </ul>
        </div>
      </SetupStep>

      {/* Step 3 */}
      <SetupStep number={3} title="Configure Environment">
        <CodeBlock
          language="bash"
          code={`# Copy the example env file
cp .env.example .env

# Edit with your credentials
nano .env`}
        />
        <p className="text-sm text-gray-400 mt-2">
          Fill in your Instagram username and password. Never commit <code className="bg-[#21262d] px-1 rounded">.env</code> to version control.
        </p>
      </SetupStep>

      {/* Step 4 */}
      <SetupStep number={4} title="Create Source Files">
        <p className="text-sm text-gray-400 mb-3">
          Copy each file from the <strong>Source Code</strong> tab into the corresponding path.
          The project structure is shown below:
        </p>
        <FileTree />
      </SetupStep>

      {/* Step 5 */}
      <SetupStep number={5} title="Run Tests">
        <CodeBlock
          language="bash"
          code={`# Run all tests (command handler tests work without credentials)
npm test

# Run tests in watch mode
npm run test:watch`}
        />
      </SetupStep>

      {/* Step 6 */}
      <SetupStep number={6} title="Start the Bot">
        <CodeBlock
          language="bash"
          code={`# Production mode
npm start

# Development mode (auto-reload on changes)
npm run dev`}
        />
        <div className="mt-4 bg-green-900/10 border border-green-800/30 rounded-lg p-4">
          <h4 className="text-green-400 font-medium text-sm mb-2">✅ Expected Output</h4>
          <CodeBlock
            language="text"
            code={`[INFO] Starting IG Bot...
[INFO] Commands registered (count: 4)
[INFO] Session file found. Attempting to restore...
[INFO] Session restored successfully
[INFO] Instagram connection established
[INFO] IG Bot is running. Listening for commands...`}
          />
        </div>
      </SetupStep>

      {/* VPS Deployment */}
      <SetupStep number={7} title="Deploy to Linux VPS">
        <CodeBlock
          language="bash"
          code={`# On your VPS
git clone <your-repo> ~/ig-bot
cd ~/ig-bot
npm install --production

# Use pm2 for process management
npm install -g pm2
pm2 start src/index.js --name ig-bot
pm2 save
pm2 startup

# Or use systemd (create /etc/systemd/system/ig-bot.service)`}
        />
      </SetupStep>
    </div>
  );
}

function SetupStep({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-ig-orange to-ig-pink flex items-center justify-center text-white font-bold text-sm">
          {number}
        </div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ─── Files Tab ───────────────────────────────────────────────────────────────

function FilesTab({ selectedFile, setSelectedFile }: { selectedFile: number; setSelectedFile: (n: number) => void }) {
  const file = botFiles[selectedFile];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* File List Sidebar */}
        <div className="lg:w-64 shrink-0">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3 sticky top-24">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 px-2">
              Files ({botFiles.length})
            </h3>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {botFiles.map((f, i) => (
                <button
                  key={f.path}
                  onClick={() => setSelectedFile(i)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-mono transition-colors ${
                    i === selectedFile
                      ? 'bg-purple-900/30 text-purple-300 border border-purple-800/50'
                      : 'text-gray-400 hover:bg-[#1e2a4a] hover:text-gray-200'
                  }`}
                >
                  {f.path}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* File Content */}
        <div className="flex-1 min-w-0">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-white font-mono">{file.path}</h3>
            <p className="text-sm text-gray-400 mt-1">{file.description}</p>
          </div>
          <CodeBlock code={file.content} language={file.language} filename={file.path} />
        </div>
      </div>
    </div>
  );
}

// ─── Commands Tab ────────────────────────────────────────────────────────────

function CommandsTab() {
  const commands = [
    {
      name: 'help',
      prefix: '!help',
      aliases: ['!h', '!commands'],
      description: 'Display all available commands and their usage.',
      example: '!help',
      response: '📋 *Available Commands*\n\n• !help — Show this help message\n• !ping — Check bot response time\n• !uptime — Show bot uptime\n• !info — Display bot information\n\nType !help <command> for detailed usage.',
    },
    {
      name: 'ping',
      prefix: '!ping',
      aliases: [],
      description: 'Measure and display the bot\'s response time in milliseconds.',
      example: '!ping',
      response: '🏓 Pong!\nResponse time: 42ms',
    },
    {
      name: 'uptime',
      prefix: '!uptime',
      aliases: [],
      description: 'Show how long the bot has been running since last start.',
      example: '!uptime',
      response: '⏱️ Uptime: 2h 34m 12s',
    },
    {
      name: 'info',
      prefix: '!info',
      aliases: ['!about'],
      description: 'Display bot version, Node.js version, platform, and memory usage.',
      example: '!info',
      response: '🤖 *IG Bot Information*\n\n• Version: 1.0.0\n• Node.js: v26.4.0\n• Platform: linux\n• Memory: 45.2 MB\n• Prefix: !\n\nBuilt with instagram-private-api',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Command System</h2>
        <p className="text-gray-400">
          All commands use the <code className="bg-[#21262d] px-2 py-0.5 rounded text-purple-300">!</code> prefix.
          Commands are modular and easy to extend.
        </p>
      </div>

      {/* Command Cards */}
      <div className="grid gap-4">
        {commands.map((cmd) => (
          <div key={cmd.name} className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 card-glow">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold text-white font-mono">{cmd.prefix}</h3>
                <p className="text-sm text-gray-400 mt-1">{cmd.description}</p>
              </div>
              {cmd.aliases.length > 0 && (
                <div className="flex gap-1">
                  {cmd.aliases.map((alias) => (
                    <span
                      key={alias}
                      className="px-2 py-1 text-xs rounded bg-purple-900/20 text-purple-400 border border-purple-800/30 font-mono"
                    >
                      {alias}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-3 mt-4">
              <div>
                <span className="text-xs text-gray-500 uppercase tracking-wide">Example Input</span>
                <div className="mt-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 font-mono text-sm text-green-400">
                  {cmd.example}
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase tracking-wide">Bot Response</span>
                <div className="mt-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 font-mono text-sm text-gray-300 whitespace-pre-line">
                  {cmd.response}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Adding New Commands */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Zap size={20} className="text-yellow-400" />
          Adding New Commands
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          Create a new file in <code className="bg-[#21262d] px-1 rounded">src/commands/</code> and register it in <code className="bg-[#21262d] px-1 rounded">src/commands/index.js</code>:
        </p>
        <CodeBlock
          language="javascript"
          code={`// src/commands/example.js
export const exampleCommand = {
  description: 'An example command',
  usage: '!example [arg]',
  aliases: ['ex'],

  execute(args, context) {
    const input = args[0] || 'world';
    return \`Hello, \${input}!\`;
  },
};

// Register in src/commands/index.js:
import { exampleCommand } from './example.js';
handler.register('example', exampleCommand);`}
        />
      </div>
    </div>
  );
}

// ─── Architecture Tab ────────────────────────────────────────────────────────

function ArchitectureTab() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Architecture</h2>
        <p className="text-gray-400">
          The bot follows a modular architecture with clear separation of concerns.
        </p>
      </div>

      {/* Architecture Diagram */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-6 text-center">System Flow</h3>
        <div className="flex flex-col items-center gap-3">
          {/* Instagram */}
          <div className="w-full max-w-md bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-700/50 rounded-xl p-4 text-center">
            <div className="text-purple-300 font-semibold">📱 Instagram DM</div>
            <div className="text-xs text-gray-400 mt-1">Incoming Messages</div>
          </div>

          <ChevronRight size={20} className="text-gray-500 rotate-90" />

          {/* Instagram Client */}
          <div className="w-full max-w-md bg-[#1e2a4a] border border-[#30363d] rounded-xl p-4 text-center">
            <div className="text-blue-300 font-semibold">src/instagram.js</div>
            <div className="text-xs text-gray-400 mt-1">Connection • Session • Message Polling</div>
          </div>

          <ChevronRight size={20} className="text-gray-500 rotate-90" />

          {/* Command Handler */}
          <div className="w-full max-w-md bg-[#1e2a4a] border border-[#30363d] rounded-xl p-4 text-center">
            <div className="text-yellow-300 font-semibold">src/handler.js</div>
            <div className="text-xs text-gray-400 mt-1">Parse • Route • Execute</div>
          </div>

          <ChevronRight size={20} className="text-gray-500 rotate-90" />

          {/* Commands */}
          <div className="w-full max-w-md bg-[#1e2a4a] border border-[#30363d] rounded-xl p-4">
            <div className="text-green-300 font-semibold text-center mb-3">src/commands/</div>
            <div className="grid grid-cols-4 gap-2">
              {['help.js', 'ping.js', 'uptime.js', 'info.js'].map((cmd) => (
                <div key={cmd} className="bg-[#0d1117] border border-[#30363d] rounded-lg px-2 py-1 text-center">
                  <span className="text-xs text-gray-300 font-mono">{cmd}</span>
                </div>
              ))}
            </div>
          </div>

          <ChevronRight size={20} className="text-gray-500 rotate-90" />

          {/* Response */}
          <div className="w-full max-w-md bg-gradient-to-r from-green-900/30 to-blue-900/30 border border-green-700/50 rounded-xl p-4 text-center">
            <div className="text-green-300 font-semibold">📤 Response</div>
            <div className="text-xs text-gray-400 mt-1">Sent back via Instagram DM</div>
          </div>
        </div>
      </div>

      {/* Design Principles */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Shield size={18} className="text-purple-400" />
            Security Principles
          </h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" />
              <span>Passwords never logged or stored in plain text</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" />
              <span>Session files excluded from git</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" />
              <span>No CAPTCHA or 2FA bypass attempts</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" />
              <span>Rate-limited API calls with p-limit</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" />
              <span>Input sanitization for user-provided data</span>
            </li>
          </ul>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Zap size={18} className="text-yellow-400" />
            Design Decisions
          </h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" />
              <span>ES Modules for modern import/export syntax</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" />
              <span>EventEmitter for message handling</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" />
              <span>Command parsing testable without credentials</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" />
              <span>Separation: auth ≠ commands ≠ transport</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" />
              <span>Graceful shutdown on SIGINT/SIGTERM</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Dependencies */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Package size={20} className="text-blue-400" />
          Dependencies
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { name: 'instagram-private-api', purpose: 'Instagram API client' },
            { name: 'dotenv', purpose: 'Environment variable loading' },
            { name: 'express', purpose: 'Health check server' },
            { name: 'better-sqlite3', purpose: 'Local database storage' },
            { name: 'axios', purpose: 'HTTP requests' },
            { name: 'pino', purpose: 'Structured logging' },
            { name: 'zod', purpose: 'Input validation schemas' },
            { name: 'cheerio', purpose: 'HTML parsing' },
            { name: 'sharp', purpose: 'Image processing' },
            { name: 'file-type', purpose: 'MIME type detection' },
            { name: 'mime-types', purpose: 'MIME type lookup' },
            { name: 'nanoid', purpose: 'Unique ID generation' },
            { name: 'p-limit', purpose: 'Concurrency limiting' },
            { name: 'vitest', purpose: 'Unit testing (dev)' },
            { name: 'eslint', purpose: 'Code linting (dev)' },
          ].map((dep) => (
            <div key={dep.name} className="flex items-center gap-2 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2">
              <div className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
              <div>
                <span className="text-sm text-gray-200 font-mono">{dep.name}</span>
                <span className="text-xs text-gray-500 ml-2">{dep.purpose}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Testing */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <HelpCircle size={20} className="text-green-400" />
          Testing Strategy
        </h3>
        <div className="space-y-3 text-sm text-gray-300">
          <p>
            The command handler is designed to be <strong className="text-white">fully testable without Instagram credentials</strong>.
            The <code className="bg-[#21262d] px-1 rounded">parse()</code> method and <code className="bg-[#21262d] px-1 rounded">execute()</code> method
            can be tested independently using Vitest.
          </p>
          <CodeBlock
            language="bash"
            code={`# Run tests
npm test

# Watch mode
npm run test:watch

# Tests cover:
# - Message parsing (prefix detection, arg extraction)
# - Command registration and aliases
# - Command execution and error handling
# - Edge cases (empty input, unknown commands)`}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Deploy Tab ──────────────────────────────────────────────────────────────

function DeployTab() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Deploy Your Bot</h2>
        <p className="text-gray-400">
          Configure and deploy your IG Bot to Render.com with this step-by-step wizard.
          All configuration is handled through the website — no manual environment setup required.
        </p>
      </div>

      <DeployWizard />

      {/* Quick Deploy Info */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-green-400" />
            What You'll Get
          </h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex items-start gap-2">
              <ChevronRight size={14} className="text-green-400 mt-0.5 shrink-0" />
              <span>Pre-configured .env file with your credentials</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight size={14} className="text-green-400 mt-0.5 shrink-0" />
              <span>render.yaml for one-click Render.com deployment</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight size={14} className="text-green-400 mt-0.5 shrink-0" />
              <span>Auto-generated SESSION_SECRET for security</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight size={14} className="text-green-400 mt-0.5 shrink-0" />
              <span>Step-by-step deployment instructions</span>
            </li>
          </ul>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Shield size={18} className="text-purple-400" />
            Security Notes
          </h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex items-start gap-2">
              <ChevronRight size={14} className="text-purple-400 mt-0.5 shrink-0" />
              <span>Your credentials are stored only in your browser</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight size={14} className="text-purple-400 mt-0.5 shrink-0" />
              <span>Never commit .env to public repositories</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight size={14} className="text-purple-400 mt-0.5 shrink-0" />
              <span>Use Render's environment variables for production</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight size={14} className="text-purple-400 mt-0.5 shrink-0" />
              <span>Session files are automatically encrypted</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Alternative Deployment */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Alternative: Manual Deployment</h3>
        <p className="text-sm text-gray-400 mb-4">
          If you prefer to deploy manually or use a different platform, follow these steps:
        </p>
        <CodeBlock
          language="bash"
          code={`# 1. Clone your repository
git clone https://github.com/your-username/igbot.git
cd igbot

# 2. Install dependencies
npm install

# 3. Create .env file (use the wizard above to generate)
nano .env

# 4. Start the bot
npm start

# For production, use pm2:
npm install -g pm2
pm2 start src/index.js --name ig-bot
pm2 save
pm2 startup`}
        />
      </div>
    </div>
  );
}
