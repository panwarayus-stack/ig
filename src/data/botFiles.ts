export interface BotFile {
  path: string;
  language: string;
  description: string;
  content: string;
}

export const botFiles: BotFile[] = [
  {
    path: "package.json",
    language: "json",
    description: "Project manifest with all dependencies",
    content: `{
  "name": "ig-bot",
  "version": "1.0.0",
  "description": "Instagram bot with command system",
  "type": "module",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/"
  },
  "dependencies": {
    "instagram-private-api": "^0.8.47",
    "dotenv": "^16.4.5",
    "express": "^4.21.0",
    "better-sqlite3": "^11.3.0",
    "axios": "^1.7.7",
    "pino": "^9.4.0",
    "zod": "^3.23.8",
    "cheerio": "^1.0.0",
    "sharp": "^0.33.5",
    "file-type": "^19.6.0",
    "mime-types": "^2.1.35",
    "nanoid": "^5.0.7",
    "p-limit": "^6.1.0"
  },
  "devDependencies": {
    "vitest": "^2.1.1",
    "eslint": "^9.11.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}`
  },
  {
    path: ".env.example",
    language: "bash",
    description: "Environment variable template (copy to .env and fill in)",
    content: `# Instagram Credentials
IG_USERNAME=your_instagram_username
IG_PASSWORD=your_instagram_password

# Session storage path
SESSION_PATH=./data/session.json

# Server port (for health checks)
PORT=3000

# Log level: trace, debug, info, warn, error, fatal
LOG_LEVEL=info

# Database path
DATABASE_PATH=./data/bot.db`
  },
  {
    path: ".gitignore",
    language: "text",
    description: "Files and directories to exclude from version control",
    content: `# Environment
.env
.env.local
.env.*.local

# Session data
data/session.json
data/*.db
data/*.db-journal

# Logs
logs/
*.log

# Dependencies
node_modules/

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Build artifacts
dist/
coverage/`
  },
  {
    path: "src/index.js",
    language: "javascript",
    description: "Main entry point — initializes services, connects to Instagram, starts message listener",
    content: `import 'dotenv/config';
import { createLogger } from './lib/logger.js';
import { InstagramClient } from './instagram.js';
import { CommandHandler } from './handler.js';
import { registerCommands } from './commands/index.js';

const logger = createLogger('main');

// Track startup time for uptime command
const startTime = Date.now();

async function main() {
  logger.info('Starting IG Bot...');

  // Validate required environment variables
  const requiredEnv = ['IG_USERNAME', 'IG_PASSWORD', 'SESSION_PATH'];
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    logger.fatal({ missing }, 'Missing required environment variables');
    process.exit(1);
  }

  // Initialize Instagram client
  const igClient = new InstagramClient({
    username: process.env.IG_USERNAME,
    password: process.env.IG_PASSWORD,
    sessionPath: process.env.SESSION_PATH || './data/session.json',
  });

  // Initialize command handler
  const handler = new CommandHandler({ prefix: '!', logger });

  // Register all commands
  registerCommands(handler, { startTime, logger });
  logger.info({ count: handler.commandCount }, 'Commands registered');

  // Attempt login / session restore
  try {
    await igClient.connect();
    logger.info('Instagram connection established');
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to connect to Instagram');
    logger.info('Bot will retry on next start. Check credentials and session.');
    process.exit(1);
  }

  // Start listening for direct messages
  igClient.onMessage(async (message) => {
    const { text, threadId, userId } = message;

    if (!text || typeof text !== 'string') return;

    // Check if message starts with command prefix
    if (!text.startsWith(handler.prefix)) return;

    logger.debug({ text, userId, threadId }, 'Processing command');

    try {
      const response = await handler.execute(text, {
        threadId,
        userId,
        timestamp: Date.now(),
      });

      if (response) {
        await igClient.sendMessage(threadId, response);
        logger.debug({ threadId }, 'Response sent');
      }
    } catch (err) {
      logger.error({ err: err.message, text }, 'Command execution failed');
      await igClient.sendMessage(threadId, '⚠️ An error occurred processing your command.');
    }
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down gracefully...');
    igClient.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason: String(reason) }, 'Unhandled rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err: err.message, stack: err.stack }, 'Uncaught exception');
    process.exit(1);
  });

  logger.info('IG Bot is running. Listening for commands...');
}

main().catch((err) => {
  logger.fatal({ err: err.message }, 'Fatal startup error');
  process.exit(1);
});`
  },
  {
    path: "src/instagram.js",
    language: "javascript",
    description: "Instagram connection module — handles login, session persistence, and messaging",
    content: `import { IgApiClient, IgLoginTwoFactorRequiredError } from 'instagram-private-api';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { EventEmitter } from 'events';
import { createLogger } from './lib/logger.js';

const logger = createLogger('instagram');

export class InstagramClient extends EventEmitter {
  #ig;
  #config;
  #connected = false;
  #pollingInterval = null;
  #lastMessageTimestamp = 0;

  constructor(config) {
    super();
    this.#config = config;
    this.#ig = new IgApiClient();
    this.#ig.state.generateAnonymousDevice();
  }

  /**
   * Connect to Instagram — restore session or perform fresh login.
   * Never logs passwords, cookies, or session contents.
   */
  async connect() {
    const { username, password, sessionPath } = this.#config;

    // Ensure data directory exists
    const dir = dirname(sessionPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Try to restore existing session
    if (existsSync(sessionPath)) {
      logger.info('Session file found. Attempting to restore...');
      try {
        const sessionData = JSON.parse(readFileSync(sessionPath, 'utf-8'));
        await this.#ig.state.deserialize(sessionData);

        // Verify session is still valid
        await this.#ig.account.currentUser();
        logger.info('Session restored successfully');
        this.#connected = true;
        this.#startMessagePolling();
        return;
      } catch (err) {
        logger.warn({ err: err.message }, 'Session restore failed. Attempting fresh login...');
        // Re-initialize client for fresh login
        this.#ig = new IgApiClient();
        this.#ig.state.generateAnonymousDevice();
      }
    }

    // Fresh login
    logger.info('Performing fresh login...');
    try {
      // Pre-login flow (simulates real app behavior)
      await this.#ig.simulate.preLoginFlow();

      const loginResult = await this.#ig.account.login(username, password);

      // Post-login flow
      await this.#ig.simulate.postLoginFlow();

      // Save session for future use
      const serialized = await this.#ig.state.serialize();
      // Remove sensitive fields before saving
      delete serialized.password;
      writeFileSync(sessionPath, JSON.stringify(serialized, null, 2));
      logger.info('Login successful. Session saved.');

      this.#connected = true;
      this.#startMessagePolling();
    } catch (err) {
      if (err instanceof IgLoginTwoFactorRequiredError) {
        logger.error('Two-factor authentication required. Please complete 2FA manually.');
        logger.error('2FA bypass is not supported for security reasons.');
        throw new Error('2FA required — complete authentication manually');
      }

      if (err.message?.includes('challenge')) {
        logger.error('Instagram security challenge detected.');
        logger.error('Complete the challenge in the Instagram app, then restart the bot.');
        throw new Error('Security challenge — resolve in Instagram app');
      }

      if (err.message?.includes('login') || err.message?.includes('password')) {
        logger.error('Authentication failed. Check your credentials in .env');
        throw new Error('Authentication failed — verify credentials');
      }

      throw err;
    }
  }

  /**
   * Poll for new direct messages using the inbox.
   */
  #startMessagePolling() {
    const POLL_INTERVAL = 5000; // 5 seconds

    this.#pollingInterval = setInterval(async () => {
      try {
        const inbox = await this.#ig.feed.directInbox();
        const threads = inbox.inbox.threads || [];

        for (const thread of threads) {
          const messages = thread.last_permanent_item
            ? [thread.last_permanent_item]
            : [];

          for (const item of messages) {
            const timestamp = parseInt(item.timestamp, 10);
            if (timestamp <= this.#lastMessageTimestamp) continue;

            // Only process text messages from other users
            if (item.item_type === 'text' && item.user_id !== this.#ig.state.cookieUserId) {
              this.#lastMessageTimestamp = timestamp;
              this.emit('message', {
                text: item.text,
                threadId: thread.thread_id,
                userId: String(item.user_id),
                timestamp,
              });
            }
          }
        }
      } catch (err) {
        logger.debug({ err: err.message }, 'Polling error (will retry)');
      }
    }, POLL_INTERVAL);

    logger.debug('Message polling started');
  }

  /**
   * Send a text message to a thread.
   */
  async sendMessage(threadId, text) {
    if (!this.#connected) {
      throw new Error('Not connected to Instagram');
    }

    const thread = this.#ig.entity.directThread(threadId);
    await thread.broadcastText(text);
  }

  /**
   * Disconnect and clean up.
   */
  disconnect() {
    if (this.#pollingInterval) {
      clearInterval(this.#pollingInterval);
      this.#pollingInterval = null;
    }
    this.#connected = false;
    logger.info('Disconnected from Instagram');
  }

  get isConnected() {
    return this.#connected;
  }
}`
  },
  {
    path: "src/handler.js",
    language: "javascript",
    description: "Command router — parses messages and dispatches to registered command handlers",
    content: `import { createLogger } from './lib/logger.js';

const logger = createLogger('handler');

export class CommandHandler {
  #commands = new Map();
  #prefix;
  #logger;

  constructor({ prefix = '!', logger: customLogger } = {}) {
    this.#prefix = prefix;
    this.#logger = customLogger || logger;
  }

  get prefix() {
    return this.#prefix;
  }

  get commandCount() {
    return this.#commands.size;
  }

  /**
   * Register a command.
   * @param {string} name - Command name (without prefix)
   * @param {object} config - Command configuration
   * @param {string} config.description - Help text
   * @param {string} [config.usage] - Usage example
   * @param {string[]} [config.aliases] - Alternative names
   * @param {function} config.execute - Handler function (args, context) => string
   */
  register(name, config) {
    const command = {
      name: name.toLowerCase(),
      description: config.description || 'No description',
      usage: config.usage || null,
      aliases: (config.aliases || []).map((a) => a.toLowerCase()),
      execute: config.execute,
    };

    if (typeof command.execute !== 'function') {
      throw new Error(\`Command "\${name}" must have an execute function\`);
    }

    this.#commands.set(command.name, command);

    // Register aliases
    for (const alias of command.aliases) {
      this.#commands.set(alias, command);
    }

    this.#logger.debug(\`Command registered: \${command.name}\`);
  }

  /**
   * Parse a raw message string into command name and arguments.
   * Exported for testing without Instagram credentials.
   */
  parse(message) {
    if (!message || typeof message !== 'string') return null;

    const trimmed = message.trim();
    if (!trimmed.startsWith(this.#prefix)) return null;

    const withoutPrefix = trimmed.slice(this.#prefix.length).trim();
    if (!withoutPrefix) return null;

    const parts = withoutPrefix.split(/\\s+/);
    const name = parts[0].toLowerCase();
    const args = parts.slice(1);

    return { name, args };
  }

  /**
   * Execute a command from raw message text.
   * @param {string} message - Full message text
   * @param {object} context - Execution context (threadId, userId, etc.)
   * @returns {string|null} Response text or null
   */
  async execute(message, context = {}) {
    const parsed = this.parse(message);
    if (!parsed) return null;

    const { name, args } = parsed;
    const command = this.#commands.get(name);

    if (!command) {
      this.#logger.debug({ name }, 'Unknown command');
      return \`❓ Unknown command: \${this.#prefix}\${name}\\nType \${this.#prefix}help for available commands.\`;
    }

    this.#logger.info({ command: command.name, args }, 'Executing command');

    try {
      const result = await command.execute(args, context);
      return result || null;
    } catch (err) {
      this.#logger.error({ err: err.message, command: command.name }, 'Command error');
      throw err;
    }
  }

  /**
   * Get all unique commands (excluding aliases) for help display.
   */
  getCommands() {
    const seen = new Set();
    const commands = [];

    for (const [key, cmd] of this.#commands) {
      if (!seen.has(cmd.name)) {
        seen.add(cmd.name);
        commands.push(cmd);
      }
    }

    return commands;
  }
}`
  },
  {
    path: "src/commands/index.js",
    language: "javascript",
    description: "Command registry — imports and registers all commands with the handler",
    content: `import { helpCommand } from './help.js';
import { pingCommand } from './ping.js';
import { uptimeCommand } from './uptime.js';
import { infoCommand } from './info.js';

/**
 * Register all available commands with the handler.
 * @param {import('../handler.js').CommandHandler} handler
 * @param {object} shared - Shared state (startTime, logger, etc.)
 */
export function registerCommands(handler, shared = {}) {
  handler.register('help', helpCommand);
  handler.register('ping', pingCommand);
  handler.register('uptime', uptimeCommand(shared));
  handler.register('info', infoCommand);
}`
  },
  {
    path: "src/commands/help.js",
    language: "javascript",
    description: "!help command — displays available commands and usage",
    content: `export const helpCommand = {
  description: 'Show available commands and usage',
  usage: '!help [command]',
  aliases: ['h', 'commands'],

  execute(args, context) {
    // This will be enhanced when handler reference is available
    const commands = [
      { name: 'help', desc: 'Show this help message', aliases: ['h', 'commands'] },
      { name: 'ping', desc: 'Check bot response time', aliases: [] },
      { name: 'uptime', desc: 'Show how long the bot has been running', aliases: [] },
      { name: 'info', desc: 'Display bot information', aliases: ['about'] },
    ];

    let response = '📋 *Available Commands*\\n\\n';

    for (const cmd of commands) {
      const aliasStr = cmd.aliases.length > 0
        ? \` (aliases: \${cmd.aliases.map((a) => \`!\${a}\`).join(', ')})\`
        : '';
      response += \`• *!\${cmd.name}* — \${cmd.desc}\${aliasStr}\\n\`;
    }

    response += '\\nType !help <command> for detailed usage.';
    return response;
  },
};`
  },
  {
    path: "src/commands/ping.js",
    language: "javascript",
    description: "!ping command — measures and displays response latency",
    content: `export const pingCommand = {
  description: 'Check bot response time',
  usage: '!ping',
  aliases: [],

  execute(args, context) {
    const now = Date.now();
    const latency = context.timestamp ? now - context.timestamp : 0;

    return \`🏓 Pong!\\nResponse time: \${latency}ms\`;
  },
};`
  },
  {
    path: "src/commands/uptime.js",
    language: "javascript",
    description: "!uptime command — shows how long the bot has been running",
    content: `/**
 * Uptime command factory — needs access to bot start time.
 * @param {object} shared - Shared state with startTime
 * @returns {object} Command configuration
 */
export function uptimeCommand(shared = {}) {
  return {
    description: 'Show how long the bot has been running',
    usage: '!uptime',
    aliases: [],

    execute() {
      const startTime = shared.startTime || Date.now();
      const uptimeMs = Date.now() - startTime;

      const seconds = Math.floor(uptimeMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      const parts = [];
      if (days > 0) parts.push(\`\${days}d\`);
      if (hours % 24 > 0) parts.push(\`\${hours % 24}h\`);
      if (minutes % 60 > 0) parts.push(\`\${minutes % 60}m\`);
      parts.push(\`\${seconds % 60}s\`);

      return \`⏱️ Uptime: \${parts.join(' ')}\`;
    },
  };
}`
  },
  {
    path: "src/commands/info.js",
    language: "javascript",
    description: "!info command — displays bot version, environment, and status",
    content: `export const infoCommand = {
  description: 'Display bot information',
  usage: '!info',
  aliases: ['about'],

  execute() {
    const nodeVersion = process.version;
    const platform = process.platform;
    const memoryUsage = process.memoryUsage();
    const heapMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(1);

    const lines = [
      '🤖 *IG Bot Information*',
      '',
      \`• Version: 1.0.0\`,
      \`• Node.js: \${nodeVersion}\`,
      \`• Platform: \${platform}\`,
      \`• Memory: \${heapMB} MB\`,
      \`• Prefix: !\`,
      '',
      'Built with instagram-private-api',
    ];

    return lines.join('\\n');
  },
};`
  },
  {
    path: "src/lib/logger.js",
    language: "javascript",
    description: "Structured logging utility using pino",
    content: `import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const rootLogger = pino({
  level: LOG_LEVEL,
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

/**
 * Create a child logger with a module name.
 * @param {string} module - Module identifier
 * @returns {import('pino').Logger}
 */
export function createLogger(module) {
  return rootLogger.child({ module });
}`
  },
  {
    path: "src/lib/utils.js",
    language: "javascript",
    description: "Shared utility functions",
    content: `/**
 * Format milliseconds into a human-readable duration.
 * @param {number} ms - Milliseconds
 * @returns {string}
 */
export function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts = [];
  if (days > 0) parts.push(\`\${days}d\`);
  if (hours % 24 > 0) parts.push(\`\${hours % 24}h\`);
  if (minutes % 60 > 0) parts.push(\`\${minutes % 60}m\`);
  parts.push(\`\${seconds % 60}s\`);

  return parts.join(' ');
}

/**
 * Sanitize user input to prevent injection.
 * @param {string} input
 * @returns {string}
 */
export function sanitize(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[\\n\\r]/g, ' ').trim().slice(0, 2000);
}

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}`
  },
  {
    path: "tests/handler.test.js",
    language: "javascript",
    description: "Tests for the command handler — verifies parsing and execution without Instagram credentials",
    content: `import { describe, it, expect, beforeEach } from 'vitest';
import { CommandHandler } from '../src/handler.js';

describe('CommandHandler', () => {
  let handler;

  beforeEach(() => {
    handler = new CommandHandler({ prefix: '!' });
  });

  describe('parse()', () => {
    it('returns null for empty messages', () => {
      expect(handler.parse('')).toBeNull();
      expect(handler.parse(null)).toBeNull();
      expect(handler.parse(undefined)).toBeNull();
    });

    it('returns null for messages without prefix', () => {
      expect(handler.parse('hello world')).toBeNull();
      expect(handler.parse('!')).toBeNull();
    });

    it('parses command name correctly', () => {
      const result = handler.parse('!ping');
      expect(result).toEqual({ name: 'ping', args: [] });
    });

    it('parses command with arguments', () => {
      const result = handler.parse('!help ping');
      expect(result).toEqual({ name: 'help', args: ['ping'] });
    });

    it('handles extra whitespace', () => {
      const result = handler.parse('  !ping   arg1   arg2  ');
      expect(result).toEqual({ name: 'ping', args: ['arg1', 'arg2'] });
    });

    it('is case-insensitive for command names', () => {
      const result = handler.parse('!PING');
      expect(result).toEqual({ name: 'ping', args: [] });
    });
  });

  describe('register()', () => {
    it('registers a command', () => {
      handler.register('test', {
        description: 'Test command',
        execute: () => 'ok',
      });
      expect(handler.commandCount).toBe(1);
    });

    it('registers aliases', () => {
      handler.register('test', {
        description: 'Test',
        aliases: ['t', 'tst'],
        execute: () => 'ok',
      });
      expect(handler.commandCount).toBe(3); // test + 2 aliases
    });

    it('throws if execute is not a function', () => {
      expect(() => {
        handler.register('bad', { description: 'Bad', execute: 'not a function' });
      }).toThrow('must have an execute function');
    });
  });

  describe('execute()', () => {
    beforeEach(() => {
      handler.register('echo', {
        description: 'Echo args',
        execute: (args) => args.join(' '),
      });
    });

    it('executes a registered command', async () => {
      const result = await handler.execute('!echo hello world');
      expect(result).toBe('hello world');
    });

    it('returns null for non-command messages', async () => {
      const result = await handler.execute('just a message');
      expect(result).toBeNull();
    });

    it('returns error for unknown commands', async () => {
      const result = await handler.execute('!unknown');
      expect(result).toContain('Unknown command');
    });
  });
});`
  },
];
