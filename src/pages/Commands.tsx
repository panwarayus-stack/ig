import { useState } from 'react';
import { useApp, type BotCommand } from '../store';
import { Zap, Plus, ToggleLeft, ToggleRight, Trash2, Edit2, Play, X, Check } from 'lucide-react';

export function CommandsPage() {
  const { state, dispatch, addLog, addConsole } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [newCmd, setNewCmd] = useState({ name: '', description: '', usage: '', aliases: '' });

  const handleToggle = (id: string) => {
    dispatch({ type: 'TOGGLE_COMMAND', id });
    const cmd = state.commands.find(c => c.id === id);
    if (cmd) {
      addLog('info', 'commands', `Command "${cmd.name}" ${cmd.enabled ? 'disabled' : 'enabled'}`);
    }
  };

  const handleDelete = (id: string) => {
    const cmd = state.commands.find(c => c.id === id);
    if (cmd) {
      dispatch({ type: 'DELETE_COMMAND', id });
      addLog('info', 'commands', `Command "${cmd.name}" deleted`);
    }
  };

  const handleTest = (cmd: BotCommand) => {
    dispatch({ type: 'EXECUTE_COMMAND', id: cmd.id });
    addConsole('info', 'commands', `Test executed: !${cmd.name}`);
    addConsole('success', 'commands', `Command "${cmd.name}" executed successfully`);
    addLog('info', 'commands', `Command "${cmd.name}" test executed`);
  };

  const handleAdd = () => {
    if (!newCmd.name) return;
    const command: BotCommand = {
      id: crypto.randomUUID(),
      name: newCmd.name.toLowerCase().replace(/[^a-z0-9_]/g, ''),
      description: newCmd.description || 'No description',
      usage: newCmd.usage || `!${newCmd.name}`,
      aliases: newCmd.aliases.split(',').map(a => a.trim()).filter(Boolean),
      enabled: true,
      executionCount: 0,
      createdAt: Date.now(),
    };
    dispatch({ type: 'ADD_COMMAND', command });
    addLog('success', 'commands', `New command "${command.name}" registered`);
    setNewCmd({ name: '', description: '', usage: '', aliases: '' });
    setShowAdd(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Command Manager</h2>
          <p className="text-sm text-gray-400 mt-1">
            {state.commands.length} commands registered • {state.commands.filter(c => c.enabled).length} enabled
          </p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-2">
          {showAdd ? <X size={16} /> : <Plus size={16} />}
          {showAdd ? 'Cancel' : 'Add Command'}
        </button>
      </div>

      {/* Add Command Form */}
      {showAdd && (
        <div className="card p-5 fade-in">
          <h3 className="text-sm font-semibold text-white mb-4">Register New Command</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Command Name *</label>
              <input
                type="text"
                value={newCmd.name}
                onChange={e => setNewCmd({ ...newCmd, name: e.target.value })}
                className="input-field text-sm"
                placeholder="e.g., greet"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Usage</label>
              <input
                type="text"
                value={newCmd.usage}
                onChange={e => setNewCmd({ ...newCmd, usage: e.target.value })}
                className="input-field text-sm"
                placeholder="e.g., !greet [name]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Description</label>
              <input
                type="text"
                value={newCmd.description}
                onChange={e => setNewCmd({ ...newCmd, description: e.target.value })}
                className="input-field text-sm"
                placeholder="What does this command do?"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Aliases (comma-separated)</label>
              <input
                type="text"
                value={newCmd.aliases}
                onChange={e => setNewCmd({ ...newCmd, aliases: e.target.value })}
                className="input-field text-sm"
                placeholder="e.g., hello, hi, hey"
              />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button onClick={handleAdd} className="btn-primary flex items-center gap-2">
              <Check size={14} /> Register Command
            </button>
          </div>
        </div>
      )}

      {/* Command List */}
      <div className="space-y-3">
        {state.commands.map(cmd => (
          <div key={cmd.id} className={`card card-hover p-4 transition-all ${!cmd.enabled ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-bold text-accent">!{cmd.name}</code>
                  <span className={`badge ${cmd.enabled ? 'bg-green-accent/15 text-green-accent' : 'bg-bg-600 text-gray-500'}`}>
                    {cmd.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">{cmd.description}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span>Usage: <code className="text-gray-400">{cmd.usage}</code></span>
                  {cmd.aliases.length > 0 && (
                    <span>Aliases: {cmd.aliases.map(a => <code key={a} className="text-gray-400">!{a}</code>).join(', ')}</span>
                  )}
                  <span>{cmd.executionCount} executions</span>
                  {cmd.lastExecuted && <span>Last: {new Date(cmd.lastExecuted).toLocaleDateString()}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleTest(cmd)}
                  className="p-2 rounded-lg hover:bg-bg-700 text-gray-400 hover:text-green-accent"
                  title="Test command"
                >
                  <Play size={14} />
                </button>
                <button
                  onClick={() => handleToggle(cmd.id)}
                  className="p-2 rounded-lg hover:bg-bg-700"
                  title={cmd.enabled ? 'Disable' : 'Enable'}
                >
                  {cmd.enabled ?
                    <ToggleRight size={18} className="text-green-accent" /> :
                    <ToggleLeft size={18} className="text-gray-500" />
                  }
                </button>
                <button
                  onClick={() => handleDelete(cmd.id)}
                  className="p-2 rounded-lg hover:bg-bg-700 text-gray-400 hover:text-red-accent"
                  title="Delete command"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Automation Page ─────────────────────────────────────────────────────────

import { Bot, Clock, PlayCircle } from 'lucide-react';
import { type AutomationRule } from '../store';

export function AutomationPage() {
  const { state, dispatch, addLog } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [newRule, setNewRule] = useState({ name: '', description: '', trigger: 'keyword_match', action: 'send_message', cooldown: '60' });

  const handleToggle = (id: string) => {
    dispatch({ type: 'TOGGLE_RULE', id });
    const rule = state.automationRules.find(r => r.id === id);
    if (rule) {
      addLog('info', 'automation', `Rule "${rule.name}" ${rule.enabled ? 'disabled' : 'enabled'}`);
    }
  };

  const handleDelete = (id: string) => {
    const rule = state.automationRules.find(r => r.id === id);
    if (rule) {
      dispatch({ type: 'DELETE_RULE', id });
      addLog('info', 'automation', `Rule "${rule.name}" deleted`);
    }
  };

  const handleAdd = () => {
    if (!newRule.name) return;
    const rule: AutomationRule = {
      id: crypto.randomUUID(),
      name: newRule.name,
      description: newRule.description,
      trigger: newRule.trigger,
      action: newRule.action,
      enabled: true,
      cooldown: parseInt(newRule.cooldown) || 60,
      executionCount: 0,
      createdAt: Date.now(),
    };
    dispatch({ type: 'ADD_RULE', rule });
    addLog('success', 'automation', `New rule "${rule.name}" created`);
    setNewRule({ name: '', description: '', trigger: 'keyword_match', action: 'send_message', cooldown: '60' });
    setShowAdd(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Automation Rules</h2>
          <p className="text-sm text-gray-400 mt-1">
            {state.automationRules.length} rules • {state.automationRules.filter(r => r.enabled).length} active
          </p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-2">
          {showAdd ? <X size={16} /> : <Plus size={16} />}
          {showAdd ? 'Cancel' : 'Add Rule'}
        </button>
      </div>

      {showAdd && (
        <div className="card p-5 fade-in">
          <h3 className="text-sm font-semibold text-white mb-4">Create Automation Rule</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Rule Name *</label>
              <input
                type="text"
                value={newRule.name}
                onChange={e => setNewRule({ ...newRule, name: e.target.value })}
                className="input-field text-sm"
                placeholder="e.g., Auto Welcome"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Description</label>
              <input
                type="text"
                value={newRule.description}
                onChange={e => setNewRule({ ...newRule, description: e.target.value })}
                className="input-field text-sm"
                placeholder="What does this rule do?"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Trigger</label>
              <select
                value={newRule.trigger}
                onChange={e => setNewRule({ ...newRule, trigger: e.target.value })}
                className="input-field text-sm"
              >
                <option value="new_follower">New Follower</option>
                <option value="keyword_match">Keyword Match</option>
                <option value="new_message">New Message</option>
                <option value="schedule:daily">Daily Schedule</option>
                <option value="schedule:hourly">Hourly Schedule</option>
                <option value="mention">Mention/Tag</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Action</label>
              <select
                value={newRule.action}
                onChange={e => setNewRule({ ...newRule, action: e.target.value })}
                className="input-field text-sm"
              >
                <option value="send_message">Send Message</option>
                <option value="send_reply">Send Reply</option>
                <option value="send_stats">Send Statistics</option>
                <option value="execute_command">Execute Command</option>
                <option value="log_event">Log Event</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Cooldown (seconds)</label>
              <input
                type="number"
                value={newRule.cooldown}
                onChange={e => setNewRule({ ...newRule, cooldown: e.target.value })}
                className="input-field text-sm"
                min="0"
              />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button onClick={handleAdd} className="btn-primary flex items-center gap-2">
              <Check size={14} /> Create Rule
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {state.automationRules.map(rule => (
          <div key={rule.id} className={`card card-hover p-4 ${!rule.enabled ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Bot size={16} className="text-blue-accent" />
                  <span className="text-sm font-semibold text-white">{rule.name}</span>
                  <span className={`badge ${rule.enabled ? 'bg-green-accent/15 text-green-accent' : 'bg-bg-600 text-gray-500'}`}>
                    {rule.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">{rule.description}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><PlayCircle size={10} /> Trigger: {rule.trigger}</span>
                  <span>Action: {rule.action}</span>
                  <span className="flex items-center gap-1"><Clock size={10} /> {rule.cooldown}s cooldown</span>
                  <span>{rule.executionCount} executions</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleToggle(rule.id)}
                  className="p-2 rounded-lg hover:bg-bg-700"
                >
                  {rule.enabled ?
                    <ToggleRight size={18} className="text-green-accent" /> :
                    <ToggleLeft size={18} className="text-gray-500" />
                  }
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  className="p-2 rounded-lg hover:bg-bg-700 text-gray-400 hover:text-red-accent"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
