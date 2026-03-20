import * as path from 'path';

import {
  BASH_COMMAND_DISPLAY_MAX_LENGTH,
  PERMISSION_TIMER_DELAY_MS,
  TASK_DESCRIPTION_DISPLAY_MAX_LENGTH,
  TEXT_IDLE_DELAY_MS,
  TOOL_DONE_DELAY_MS,
} from './constants.js';
import type { AgentState } from './types.js';

export const PERMISSION_EXEMPT_TOOLS = new Set(['Task', 'Agent', 'AskUserQuestion']);

/**
 * Extract cd target paths from a shell command string.
 * Handles commands like:
 *   cd ../foo
 *   cd /absolute/path && npm install
 *   npm install ; cd ~/other
 *   cd "path with spaces"
 *   cd 'quoted/path'
 */
function extractCdTargets(command: string): string[] {
  const targets: string[] = [];
  // Split on && and ; to get individual commands, handling quoted strings
  // We use a regex to find cd commands rather than splitting, which is more robust
  const cdPattern = /(?:^|&&|;)\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))/g;
  let match: RegExpExecArray | null;
  while ((match = cdPattern.exec(command)) !== null) {
    const target = match[1] ?? match[2] ?? match[3];
    if (target) {
      targets.push(target);
    }
  }
  return targets;
}

/**
 * Detect if a Bash command contains a cd that switches to a different project.
 * Returns the resolved new project path if a switch is detected, null otherwise.
 *
 * @param command - The bash command string from tool_use input
 * @param currentProjectPath - The agent's current project path (e.g., "/Users/foo/Code/myproject")
 * @returns The new absolute project path, or null if no switch detected
 */
export function detectProjectSwitch(command: string, currentProjectPath: string): string | null {
  if (!command || !currentProjectPath) return null;

  const targets = extractCdTargets(command);
  if (targets.length === 0) return null;

  // Use the last cd target (the one that takes effect)
  const target = targets[targets.length - 1];

  // Handle bare `cd` (goes to home) — treat as no meaningful switch
  if (!target || target === '~') return null;

  let resolved: string;
  if (target.startsWith('/')) {
    // Absolute path
    resolved = path.resolve(target);
  } else if (target.startsWith('~/') || target === '~') {
    // Home-relative path
    const home = process.env.HOME || process.env.USERPROFILE || '/';
    resolved = path.resolve(home, target.slice(2));
  } else {
    // Relative path — resolve against current project
    resolved = path.resolve(currentProjectPath, target);
  }

  // Normalize both paths for comparison
  const normalizedCurrent = path.resolve(currentProjectPath);
  const normalizedNew = path.resolve(resolved);

  // Same directory or subdirectory of current project — not a switch
  if (normalizedNew === normalizedCurrent || normalizedNew.startsWith(normalizedCurrent + '/')) {
    return null;
  }

  // Parent of current project or entirely different tree — it's a switch
  return normalizedNew;
}

type Broadcast = (msg: Record<string, unknown>) => void;

/** Extract project directory name from an absolute file path.
 *  e.g., "/Users/kquillen/Code/tesla-site/src/foo.ts" → "tesla-site" */
function extractProjectFromPath(filePath: unknown): string | null {
  if (typeof filePath !== 'string' || !filePath.startsWith('/')) return null;
  const segments = filePath.split('/');
  const codeRoots = ['Code', 'Projects', 'repos', 'src', 'work', 'dev', 'games'];
  for (let i = 0; i < segments.length - 1; i++) {
    if (codeRoots.includes(segments[i]) && segments[i + 1]) {
      return segments[i + 1];
    }
  }
  if (segments.length > 4 && segments[4]) {
    return segments[4];
  }
  return null;
}

export function formatToolStatus(toolName: string, input: Record<string, unknown>): string {
  const base = (p: unknown) => (typeof p === 'string' ? path.basename(p) : '');
  switch (toolName) {
    case 'Read':
      return `Reading ${base(input.file_path)}`;
    case 'Edit':
      return `Editing ${base(input.file_path)}`;
    case 'Write':
      return `Writing ${base(input.file_path)}`;
    case 'Bash': {
      let cmd = (input.command as string) || '';
      // Strip leading "cd ... &&" prefixes for cleaner display
      cmd = cmd.replace(/^(?:cd\s+\S+\s*&&\s*)+/, '');
      return `Running: ${cmd.length > BASH_COMMAND_DISPLAY_MAX_LENGTH ? cmd.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH) + '\u2026' : cmd}`;
    }
    case 'Glob':
      return 'Searching files';
    case 'Grep':
      return 'Searching code';
    case 'WebFetch':
      return 'Fetching web content';
    case 'WebSearch':
      return 'Searching the web';
    case 'Task':
    case 'Agent': {
      const desc = typeof input.description === 'string' ? input.description : '';
      return desc
        ? `Subtask: ${desc.length > TASK_DESCRIPTION_DISPLAY_MAX_LENGTH ? desc.slice(0, TASK_DESCRIPTION_DISPLAY_MAX_LENGTH) + '\u2026' : desc}`
        : 'Running subtask';
    }
    case 'AskUserQuestion':
      return 'Waiting for your answer';
    case 'EnterPlanMode':
      return 'Planning';
    case 'NotebookEdit':
      return 'Editing notebook';
    default:
      return `Using ${toolName}`;
  }
}

export function clearAgentActivity(
  agent: AgentState | undefined,
  agentId: number,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  broadcast: Broadcast,
): void {
  if (!agent) return;
  agent.activeToolIds.clear();
  agent.activeToolStatuses.clear();
  agent.activeToolNames.clear();
  agent.activeSubagentToolIds.clear();
  agent.activeSubagentToolNames.clear();
  agent.isWaiting = false;
  agent.permissionSent = false;
  cancelPermissionTimer(agentId, permissionTimers);
  broadcast({ type: 'agentToolsClear', id: agentId });
  broadcast({ type: 'agentStatus', id: agentId, status: 'active' });
}

export function cancelWaitingTimer(
  agentId: number,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
): void {
  const timer = waitingTimers.get(agentId);
  if (timer) {
    clearTimeout(timer);
    waitingTimers.delete(agentId);
  }
}

export function startWaitingTimer(
  agentId: number,
  delayMs: number,
  agents: Map<number, AgentState>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  broadcast: Broadcast,
): void {
  cancelWaitingTimer(agentId, waitingTimers);
  const timer = setTimeout(() => {
    waitingTimers.delete(agentId);
    const agent = agents.get(agentId);
    if (agent) {
      agent.isWaiting = true;
    }
    broadcast({ type: 'agentStatus', id: agentId, status: 'waiting' });
  }, delayMs);
  waitingTimers.set(agentId, timer);
}

export function cancelPermissionTimer(
  agentId: number,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
): void {
  const timer = permissionTimers.get(agentId);
  if (timer) {
    clearTimeout(timer);
    permissionTimers.delete(agentId);
  }
}

export function startPermissionTimer(
  agentId: number,
  agents: Map<number, AgentState>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  broadcast: Broadcast,
): void {
  cancelPermissionTimer(agentId, permissionTimers);
  const timer = setTimeout(() => {
    permissionTimers.delete(agentId);
    const agent = agents.get(agentId);
    if (!agent) return;

    let hasNonExempt = false;
    for (const toolId of agent.activeToolIds) {
      const toolName = agent.activeToolNames.get(toolId);
      if (!PERMISSION_EXEMPT_TOOLS.has(toolName || '')) {
        hasNonExempt = true;
        break;
      }
    }

    const stuckSubagentParentToolIds: string[] = [];
    for (const [parentToolId, subToolNames] of agent.activeSubagentToolNames) {
      for (const [, toolName] of subToolNames) {
        if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
          stuckSubagentParentToolIds.push(parentToolId);
          hasNonExempt = true;
          break;
        }
      }
    }

    if (hasNonExempt) {
      agent.permissionSent = true;
      broadcast({ type: 'agentToolPermission', id: agentId });
      for (const parentToolId of stuckSubagentParentToolIds) {
        broadcast({ type: 'subagentToolPermission', id: agentId, parentToolId });
      }
    }
  }, PERMISSION_TIMER_DELAY_MS);
  permissionTimers.set(agentId, timer);
}

export function processTranscriptLine(
  agentId: number,
  line: string,
  agents: Map<number, AgentState>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  broadcast: Broadcast,
): void {
  const agent = agents.get(agentId);
  if (!agent) return;
  try {
    const record = JSON.parse(line);

    if (record.type === 'assistant' && Array.isArray(record.message?.content)) {
      const blocks = record.message.content as Array<{
        type: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
        text?: string;
      }>;

      // Stream full content to terminal panel
      const textBlocks = blocks.filter((b) => b.type === 'text' && b.text);
      const toolBlocks = blocks.filter((b) => b.type === 'tool_use');
      if (textBlocks.length > 0 || toolBlocks.length > 0) {
        broadcast({
          type: 'agentOutput',
          id: agentId,
          role: 'assistant',
          text: textBlocks.map((b) => b.text).join('\n'),
          tools: toolBlocks.map((b) => ({
            name: b.name,
            status: formatToolStatus(b.name || '', b.input || {}),
          })),
        });
      }

      const hasToolUse = blocks.some((b) => b.type === 'tool_use');

      if (hasToolUse) {
        cancelWaitingTimer(agentId, waitingTimers);
        agent.isWaiting = false;
        agent.hadToolsInTurn = true;
        broadcast({ type: 'agentStatus', id: agentId, status: 'active' });
        let hasNonExemptTool = false;
        for (const block of blocks) {
          if (block.type === 'tool_use' && block.id) {
            const toolName = block.name || '';
            const input = block.input || {};
            const status = formatToolStatus(toolName, input);
            const projectHint = extractProjectFromPath(input.file_path || input.path) || null;
            agent.activeToolIds.add(block.id);
            agent.activeToolStatuses.set(block.id, status);
            agent.activeToolNames.set(block.id, toolName);
            if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
              hasNonExemptTool = true;
            }
            broadcast({
              type: 'agentToolStart',
              id: agentId,
              toolId: block.id,
              status,
              ...(projectHint ? { projectHint } : {}),
            });

            // Detect TaskCreate / TaskUpdate for todo tracking
            if (toolName === 'TaskCreate') {
              const subject = (block.input?.subject as string) || '';
              broadcast({
                type: 'todoCreated',
                agentId,
                taskId: block.id,
                subject,
                status: 'pending',
              });
            } else if (toolName === 'TaskUpdate') {
              const taskId = (block.input?.taskId as string) || '';
              const taskStatus = (block.input?.status as string) || '';
              const subject = block.input?.subject as string | undefined;
              broadcast({
                type: 'todoUpdated',
                agentId,
                taskId,
                status: taskStatus,
                ...(subject ? { subject } : {}),
              });
              if (taskStatus === 'completed') {
                broadcast({ type: 'todoCompleted', agentId, taskId });
              }
            }

            // Broadcast sub-agent lifecycle event for Agent/Task tools
            if (toolName === 'Agent' || toolName === 'Task') {
              // Cap at 4 active sub-agents per parent
              const currentSubagentCount = agent.activeSubagentToolIds.size;
              if (currentSubagentCount <= 4) {
                broadcast({
                  type: 'subAgentStarted',
                  id: agentId,
                  subAgentId: block.id,
                });
              }
            }
          }
        }
        if (hasNonExemptTool) {
          startPermissionTimer(agentId, agents, permissionTimers, broadcast);
        }
      } else if (blocks.some((b) => b.type === 'text') && !agent.hadToolsInTurn) {
        startWaitingTimer(agentId, TEXT_IDLE_DELAY_MS, agents, waitingTimers, broadcast);
      }
    } else if (record.type === 'progress') {
      processProgressRecord(agentId, record, agents, waitingTimers, permissionTimers, broadcast);
    } else if (record.type === 'user') {
      const content = record.message?.content;
      if (Array.isArray(content)) {
        const blocks = content as Array<{ type: string; tool_use_id?: string }>;
        const hasToolResult = blocks.some((b) => b.type === 'tool_result');
        if (hasToolResult) {
          for (const block of blocks) {
            if (block.type === 'tool_result' && block.tool_use_id) {
              const completedToolId = block.tool_use_id;
              const completedToolName = agent.activeToolNames.get(completedToolId);
              if (completedToolName === 'Task' || completedToolName === 'Agent') {
                agent.activeSubagentToolIds.delete(completedToolId);
                agent.activeSubagentToolNames.delete(completedToolId);
                broadcast({ type: 'subAgentCompleted', id: agentId, subAgentId: completedToolId });
                broadcast({ type: 'subagentClear', id: agentId, parentToolId: completedToolId });
              }
              agent.activeToolIds.delete(completedToolId);
              agent.activeToolStatuses.delete(completedToolId);
              agent.activeToolNames.delete(completedToolId);
              const toolId = completedToolId;
              setTimeout(() => {
                broadcast({ type: 'agentToolDone', id: agentId, toolId });
              }, TOOL_DONE_DELAY_MS);
            }
          }
          if (agent.activeToolIds.size === 0) {
            agent.hadToolsInTurn = false;
            // Trigger BEADS poll after all tools in a turn complete
            if (agent.hasBeads) {
              broadcast({ type: 'beadsPollRequested', agentId });
            }
          }
        } else {
          cancelWaitingTimer(agentId, waitingTimers);
          clearAgentActivity(agent, agentId, permissionTimers, broadcast);
          agent.hadToolsInTurn = false;
        }
      } else if (typeof content === 'string' && content.trim()) {
        cancelWaitingTimer(agentId, waitingTimers);
        clearAgentActivity(agent, agentId, permissionTimers, broadcast);
        agent.hadToolsInTurn = false;
      }
    } else if (record.type === 'system' && record.subtype === 'turn_duration') {
      cancelWaitingTimer(agentId, waitingTimers);
      cancelPermissionTimer(agentId, permissionTimers);

      if (agent.activeToolIds.size > 0) {
        agent.activeToolIds.clear();
        agent.activeToolStatuses.clear();
        agent.activeToolNames.clear();
        agent.activeSubagentToolIds.clear();
        agent.activeSubagentToolNames.clear();
        broadcast({ type: 'agentToolsClear', id: agentId });
      }

      agent.isWaiting = true;
      agent.permissionSent = false;
      agent.hadToolsInTurn = false;
      broadcast({ type: 'agentStatus', id: agentId, status: 'waiting' });
      // Trigger BEADS poll at end of turn
      if (agent.hasBeads) {
        broadcast({ type: 'beadsPollRequested', agentId });
      }
    }
  } catch {
    // Ignore malformed lines
  }
}

function processProgressRecord(
  agentId: number,
  record: Record<string, unknown>,
  agents: Map<number, AgentState>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  broadcast: Broadcast,
): void {
  const agent = agents.get(agentId);
  if (!agent) return;

  const parentToolId = record.parentToolUseID as string | undefined;
  if (!parentToolId) return;

  const data = record.data as Record<string, unknown> | undefined;
  if (!data) return;

  const dataType = data.type as string | undefined;
  if (dataType === 'bash_progress' || dataType === 'mcp_progress') {
    if (agent.activeToolIds.has(parentToolId)) {
      startPermissionTimer(agentId, agents, permissionTimers, broadcast);
    }
    return;
  }

  const parentToolName = agent.activeToolNames.get(parentToolId);
  if (parentToolName !== 'Task' && parentToolName !== 'Agent') return;

  const msg = data.message as Record<string, unknown> | undefined;
  if (!msg) return;

  const msgType = msg.type as string;
  const innerMsg = msg.message as Record<string, unknown> | undefined;
  const content = innerMsg?.content;
  if (!Array.isArray(content)) return;

  if (msgType === 'assistant') {
    let hasNonExemptSubTool = false;
    for (const block of content) {
      if (block.type === 'tool_use' && block.id) {
        const toolName = block.name || '';
        const subInput = block.input || {};
        const status = formatToolStatus(toolName, subInput);
        const projectHint = extractProjectFromPath(subInput.file_path || subInput.path) || null;

        let subTools = agent.activeSubagentToolIds.get(parentToolId);
        if (!subTools) {
          subTools = new Set();
          agent.activeSubagentToolIds.set(parentToolId, subTools);
        }
        subTools.add(block.id);

        let subNames = agent.activeSubagentToolNames.get(parentToolId);
        if (!subNames) {
          subNames = new Map();
          agent.activeSubagentToolNames.set(parentToolId, subNames);
        }
        subNames.set(block.id, toolName);

        if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
          hasNonExemptSubTool = true;
        }

        broadcast({
          type: 'subagentToolStart',
          id: agentId,
          parentToolId,
          toolId: block.id,
          status,
          ...(projectHint ? { projectHint } : {}),
        });
      }
    }
    if (hasNonExemptSubTool) {
      startPermissionTimer(agentId, agents, permissionTimers, broadcast);
    }
  } else if (msgType === 'user') {
    for (const block of content) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        const subTools = agent.activeSubagentToolIds.get(parentToolId);
        if (subTools) {
          subTools.delete(block.tool_use_id);
        }
        const subNames = agent.activeSubagentToolNames.get(parentToolId);
        if (subNames) {
          subNames.delete(block.tool_use_id);
        }

        const toolId = block.tool_use_id;
        setTimeout(() => {
          broadcast({ type: 'subagentToolDone', id: agentId, parentToolId, toolId });
        }, 300);
      }
    }
    let stillHasNonExempt = false;
    for (const [, subNames] of agent.activeSubagentToolNames) {
      for (const [, toolName] of subNames) {
        if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
          stillHasNonExempt = true;
          break;
        }
      }
      if (stillHasNonExempt) break;
    }
    if (stillHasNonExempt) {
      startPermissionTimer(agentId, agents, permissionTimers, broadcast);
    }
  }
}
