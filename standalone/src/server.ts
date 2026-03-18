import { existsSync } from 'fs';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

import { loadAllAssets } from './assetLoader.js';
import { findBeadsRoot, pollBeads } from './beadsPoller.js';
import { getConfig, loadConfig, resolveCharacterId, watchConfig } from './config.js';
import {
  DEFAULT_PORT,
  FILE_WATCHER_POLL_INTERVAL_MS,
  LAYOUT_FILE_DIR,
  LAYOUT_FILE_NAME,
  LAYOUT_REVISION_KEY,
  PROJECT_SCAN_INTERVAL_MS,
} from './constants.js';
import { detectTerminals } from './terminalDetector.js';
import type { TerminalInfo } from './terminalDetector.js';
import { focusTerminal } from './terminalFocus.js';
import {
  cancelPermissionTimer,
  cancelWaitingTimer,
  clearAgentActivity,
  processTranscriptLine,
} from './transcriptParser.js';
import type { AgentState } from './types.js';

// -- State --

const agents = new Map<number, AgentState>();
const agentTodos = new Map<number, Map<string, { subject: string; status: string }>>();
const fileWatchers = new Map<number, fs.FSWatcher>();
const pollingTimers = new Map<number, ReturnType<typeof setInterval>>();
const waitingTimers = new Map<number, ReturnType<typeof setTimeout>>();
const permissionTimers = new Map<number, ReturnType<typeof setTimeout>>();
const knownJsonlFiles = new Set<string>();
const knownProjectDirs = new Set<string>();
let nextAgentId = 1;
const clients = new Set<WebSocket>();

// -- Terminal detection cache --

let terminalCache = new Map<number, TerminalInfo>();
const TERMINAL_DETECT_INTERVAL_MS = 10_000;

/**
 * Decode a Claude projects directory name back to a filesystem path.
 * Claude encodes paths by replacing non-alphanumeric chars (except -) with '-'.
 * e.g. "-Users-kquillen-Code-tesla" -> "/Users/kquillen/Code/tesla"
 *
 * We try to reconstruct by checking if replacing '-' with '/' yields an existing directory.
 */
function decodeDirName(dirName: string): string {
  // The encoding replaces '/' with '-', so "-Users-foo-bar" came from "/Users/foo/bar"
  // Strategy: replace leading '-' with '/', then try each '-' as '/' or '-'
  // Simple greedy approach: split on '-', try to build the longest valid path
  const parts = dirName.split('-').filter(Boolean);
  if (parts.length === 0) return dirName;

  let bestPath = '/' + parts.join('/');

  // Check if the simple full-slash replacement exists
  try {
    if (fs.existsSync(bestPath)) return bestPath;
  } catch {
    // continue
  }

  // Greedy approach: build path segment by segment, preferring '/' when the path exists
  let current = '';
  for (let i = 0; i < parts.length; i++) {
    const withSlash = current + '/' + parts[i];
    const withDash = i === 0 ? current + '/' + parts[i] : current + '-' + parts[i];

    if (i === 0) {
      // First part always starts with /
      current = '/' + parts[i];
      continue;
    }

    try {
      if (fs.existsSync(withSlash) || fs.statSync(withSlash + '/').isDirectory()) {
        current = withSlash;
        continue;
      }
    } catch {
      // path doesn't exist with slash
    }

    try {
      if (fs.existsSync(withDash)) {
        current = withDash;
        continue;
      }
    } catch {
      // neither exists
    }

    // Default to slash
    current = withSlash;
  }

  return current || bestPath;
}

/**
 * Encode a filesystem path the same way Claude Code does for ~/.claude/projects/ dir names.
 * Replaces non-alphanumeric chars (except -) with '-'.
 */
function encodePath(fsPath: string): string {
  return fsPath.replace(/[^a-zA-Z0-9-]/g, '-');
}

function updateTerminalInfo(): void {
  try {
    terminalCache = detectTerminals();
    if (terminalCache.size > 0) {
      console.log(`[Terminal] Found ${terminalCache.size} Claude process(es)`);
      for (const [pid, info] of terminalCache) {
        console.log(`  PID=${pid} app=${info.terminalApp} tty=${info.tty} cwd=${info.cwd}`);
      }
    }

    // Match terminal info to agents.
    // The cache is keyed by Claude PID, so multiple agents in the same folder work.
    // We match by encoding the terminal's CWD and comparing to the agent's project dir name.
    const agentDirName = new Map<number, string>();
    for (const [, agent] of agents) {
      agentDirName.set(agent.id, path.basename(agent.projectDir));
    }

    for (const [, agent] of agents) {
      const dirName = agentDirName.get(agent.id);
      if (!dirName) continue;

      // If agent already has a claudePid and it's still in the cache, use it directly
      if (agent.claudePid && terminalCache.has(agent.claudePid)) {
        const info = terminalCache.get(agent.claudePid)!;
        agent.terminalApp = info.terminalApp;
        agent.shellPid = info.shellPid;
        agent.tty = info.tty;
        agent.projectPath = info.cwd;
        continue;
      }

      // If agent had a claudePid but it's no longer in cache, the process exited
      if (agent.claudePid && !terminalCache.has(agent.claudePid)) {
        const hadTerminal = !!agent.terminalApp;
        agent.claudePid = undefined;
        agent.terminalApp = undefined;
        agent.shellPid = null;
        agent.tty = null;
        // Notify webview that this agent lost its terminal and is now idle
        if (hadTerminal) {
          broadcast({
            type: 'agentTerminalUpdate',
            id: agent.id,
            terminalApp: null,
            projectPath: agent.projectPath,
          });
          broadcast({
            type: 'agentStatus',
            id: agent.id,
            status: 'idle',
          });
        }
        continue;
      }

      // No PID yet — find a matching terminal by encoded CWD
      const claimedPids = new Set<number>();
      for (const [, a] of agents) {
        if (a.claudePid) claimedPids.add(a.claudePid);
      }

      for (const [pid, info] of terminalCache) {
        if (claimedPids.has(pid)) continue;
        if (encodePath(info.cwd) === dirName) {
          agent.terminalApp = info.terminalApp;
          agent.claudePid = pid;
          agent.shellPid = info.shellPid;
          agent.tty = info.tty;
          agent.projectPath = info.cwd;
          // Notify webview that this agent now has a terminal
          broadcast({
            type: 'agentTerminalUpdate',
            id: agent.id,
            terminalApp: info.terminalApp,
            projectPath: info.cwd,
          });
          break;
        }
      }
    }
  } catch {
    // Don't crash on detection errors
  }
}

// -- Helpers --

function handleTodoBroadcast(msg: Record<string, unknown>): void {
  if (msg.type === 'todoCreated' || msg.type === 'todoUpdated') {
    const agentId = msg.agentId as number;
    const agent = agents.get(agentId);
    if (agent?.hasBeads) return; // BEADS handles todos for this agent

    if (msg.type === 'todoCreated') {
      const taskId = msg.taskId as string;
      if (!agentTodos.has(agentId)) agentTodos.set(agentId, new Map());
      agentTodos.get(agentId)!.set(taskId, {
        subject: msg.subject as string,
        status: 'pending',
      });
    } else {
      const taskId = msg.taskId as string;
      const todos = agentTodos.get(agentId);
      if (todos?.has(taskId)) {
        const todo = todos.get(taskId)!;
        todo.status = msg.status as string;
        if (msg.subject) todo.subject = msg.subject as string;
      }
    }
  } else if (msg.type === 'beadsPollRequested') {
    const agentId = msg.agentId as number;
    const agent = agents.get(agentId);
    if (agent?.hasBeads && agent.beadsRoot) {
      const prevTodos = agentTodos.get(agentId);
      const issues = pollBeads(agent.beadsRoot);

      // Detect newly closed issues (for whiteboard animation)
      if (prevTodos) {
        for (const issue of issues) {
          const prev = prevTodos.get(issue.taskId);
          if (prev && prev.status !== 'completed' && issue.status === 'completed') {
            broadcast({ type: 'todoCompleted', agentId, taskId: issue.taskId });
          }
        }
      }

      // Update todo cache
      const todoMap = new Map<string, { subject: string; status: string }>();
      for (const issue of issues) {
        todoMap.set(issue.taskId, { subject: issue.subject, status: issue.status });
      }
      agentTodos.set(agentId, todoMap);

      // Broadcast full todo list for this agent
      broadcast({
        type: 'todosLoaded',
        todos: { [agentId]: issues },
      });
    }
  }
}

function broadcast(msg: Record<string, unknown>): void {
  handleTodoBroadcast(msg);
  const json = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === 1) {
      // WebSocket.OPEN
      ws.send(json);
    }
  }
}

function getProjectName(dirPath: string): string {
  // Convert ~/.claude/projects/-Users-rolle-Projects-foo back to project name
  const base = path.basename(dirPath);
  const parts = base.split('-').filter(Boolean);
  // Take last meaningful segment as project name
  return parts[parts.length - 1] || base;
}

// -- Layout persistence --

function getLayoutFilePath(): string {
  return path.join(os.homedir(), LAYOUT_FILE_DIR, LAYOUT_FILE_NAME);
}

function readLayoutFromFile(): Record<string, unknown> | null {
  const filePath = getLayoutFilePath();
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeLayoutToFile(layout: Record<string, unknown>): void {
  const filePath = getLayoutFilePath();
  const dir = path.dirname(filePath);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(layout, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.error('[Layout] Write error:', err);
  }
}

// -- File watching (ported from extension) --

function startFileWatching(agentId: number, filePath: string): void {
  try {
    const watcher = fs.watch(filePath, () => {
      readNewLines(agentId);
    });
    fileWatchers.set(agentId, watcher);
  } catch {
    /* fs.watch can fail */
  }

  try {
    fs.watchFile(filePath, { interval: FILE_WATCHER_POLL_INTERVAL_MS }, () => {
      readNewLines(agentId);
    });
  } catch {
    /* ignore */
  }

  const interval = setInterval(() => {
    if (!agents.has(agentId)) {
      clearInterval(interval);
      try {
        fs.unwatchFile(filePath);
      } catch {
        /* ignore */
      }
      return;
    }
    readNewLines(agentId);
  }, FILE_WATCHER_POLL_INTERVAL_MS);
  pollingTimers.set(agentId, interval);
}

function readNewLines(agentId: number): void {
  const agent = agents.get(agentId);
  if (!agent) return;
  try {
    const stat = fs.statSync(agent.jsonlFile);
    if (stat.size <= agent.fileOffset) return;

    const buf = Buffer.alloc(stat.size - agent.fileOffset);
    const fd = fs.openSync(agent.jsonlFile, 'r');
    fs.readSync(fd, buf, 0, buf.length, agent.fileOffset);
    fs.closeSync(fd);
    agent.fileOffset = stat.size;

    const text = agent.lineBuffer + buf.toString('utf-8');
    const lines = text.split('\n');
    agent.lineBuffer = lines.pop() || '';

    const hasLines = lines.some((l) => l.trim());
    if (hasLines) {
      cancelWaitingTimer(agentId, waitingTimers);
      cancelPermissionTimer(agentId, permissionTimers);
      if (agent.permissionSent) {
        agent.permissionSent = false;
        broadcast({ type: 'agentToolPermissionClear', id: agentId });
      }
    }

    for (const line of lines) {
      if (!line.trim()) continue;
      processTranscriptLine(agentId, line, agents, waitingTimers, permissionTimers, broadcast);
    }
  } catch {
    // Read error - file may have been removed
  }
}

function removeAgent(agentId: number): void {
  const agent = agents.get(agentId);
  if (!agent) return;

  fileWatchers.get(agentId)?.close();
  fileWatchers.delete(agentId);
  const pt = pollingTimers.get(agentId);
  if (pt) clearInterval(pt);
  pollingTimers.delete(agentId);
  try {
    fs.unwatchFile(agent.jsonlFile);
  } catch {
    /* ignore */
  }

  cancelWaitingTimer(agentId, waitingTimers);
  cancelPermissionTimer(agentId, permissionTimers);

  agents.delete(agentId);
  broadcast({ type: 'agentClosed', id: agentId });
}

// -- Session discovery --

function isFileActive(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    const staleMinutes = getConfig().staleTimeout;
    return Date.now() - stat.mtimeMs < staleMinutes * 60 * 1000;
  } catch {
    return false;
  }
}

function isFileGrowing(filePath: string): boolean {
  // Check if file has grown recently (last 60 seconds) - sign of active session
  try {
    const stat = fs.statSync(filePath);
    return Date.now() - stat.mtimeMs < 60 * 1000;
  } catch {
    return false;
  }
}

function adoptJsonlFile(filePath: string, projectDir: string): void {
  if (knownJsonlFiles.has(filePath)) return;
  knownJsonlFiles.add(filePath);

  if (!isFileActive(filePath)) return;

  const id = nextAgentId++;
  const projectName = getProjectName(projectDir);
  const dirBaseName = path.basename(projectDir);
  const projectPath = decodeDirName(dirBaseName);

  // Look up terminal info from cache by matching encoded CWD to dir name
  let termInfo: TerminalInfo | undefined;
  const claimedPids = new Set<number>();
  for (const [, a] of agents) {
    if (a.claudePid) claimedPids.add(a.claudePid);
  }
  for (const [, info] of terminalCache) {
    if (claimedPids.has(info.claudePid)) continue;
    if (encodePath(info.cwd) === dirBaseName) {
      termInfo = info;
      break;
    }
  }

  // Resolve character ID from config
  // Character assignment: config takes priority, otherwise deterministic hash of folder path
  const configCharId = projectPath ? resolveCharacterId(projectPath) : -1;
  let characterId: number;
  if (configCharId >= 0) {
    characterId = configCharId;
  } else {
    // Hash the project dir name so the same folder always gets the same character
    const dirName = path.basename(projectDir);
    let hash = 0;
    for (let i = 0; i < dirName.length; i++) {
      hash = ((hash << 5) - hash + dirName.charCodeAt(i)) | 0;
    }
    characterId = ((hash % 6) + 6) % 6;
  }

  // Check if project (or a parent directory) has a .beads/ directory
  const resolvedProjectPath = termInfo?.cwd ?? projectPath;
  const beadsRoot = resolvedProjectPath ? findBeadsRoot(resolvedProjectPath) : null;
  const hasBeads = beadsRoot !== null;

  const agent: AgentState = {
    id,
    projectDir,
    projectName,
    jsonlFile: filePath,
    fileOffset: 0,
    lineBuffer: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    folderName: projectName,
    projectPath: resolvedProjectPath,
    terminalApp: termInfo?.terminalApp,
    claudePid: termInfo?.claudePid,
    shellPid: termInfo?.shellPid ?? null,
    tty: termInfo?.tty ?? null,
    characterId,
    hasBeads,
    beadsRoot: beadsRoot ?? undefined,
  };

  // Skip to near end of file - only read recent activity
  try {
    const stat = fs.statSync(filePath);
    // Start reading from max 50KB before end to catch recent activity
    agent.fileOffset = Math.max(0, stat.size - 50 * 1024);
  } catch {
    /* start from beginning */
  }

  agents.set(id, agent);
  if (hasBeads) {
    console.log(`[Agent ${id}] BEADS detected at ${beadsRoot} (project: ${resolvedProjectPath})`);
  }
  console.log(`[Agent ${id}] Adopted session in ${projectName}: ${path.basename(filePath)}`);
  broadcast({
    type: 'agentCreated',
    id,
    folderName: projectName,
    terminalApp: agent.terminalApp,
    projectPath: agent.projectPath,
    characterId: agent.characterId,
  });

  // If no active terminal detected, start as idle (don't show typing animation)
  if (!agent.terminalApp) {
    broadcast({ type: 'agentStatus', id, status: 'idle' });
  }

  startFileWatching(id, filePath);
  readNewLines(id);

  // Initial BEADS poll
  if (agent.hasBeads && agent.beadsRoot) {
    const issues = pollBeads(agent.beadsRoot);
    if (issues.length > 0) {
      const todoMap = new Map<string, { subject: string; status: string }>();
      for (const issue of issues) {
        todoMap.set(issue.taskId, { subject: issue.subject, status: issue.status });
      }
      agentTodos.set(id, todoMap);
    }
  }
}

function scanProjectDir(projectDir: string): void {
  try {
    const files = fs
      .readdirSync(projectDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => path.join(projectDir, f));

    for (const file of files) {
      if (!knownJsonlFiles.has(file)) {
        adoptJsonlFile(file, projectDir);
      }
    }
  } catch {
    /* dir may not exist */
  }
}

function scanAllProjects(): void {
  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');
  try {
    if (!fs.existsSync(claudeProjectsDir)) return;
    const entries = fs.readdirSync(claudeProjectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectDir = path.join(claudeProjectsDir, entry.name);
      knownProjectDirs.add(projectDir);
      scanProjectDir(projectDir);
    }
  } catch {
    /* ignore */
  }
}

function cleanupStaleAgents(): void {
  for (const [id, agent] of agents) {
    if (!fs.existsSync(agent.jsonlFile)) {
      console.log(`[Agent ${id}] Session file removed, cleaning up`);
      removeAgent(id);
      continue;
    }
    // Remove agents whose sessions haven't been active for the configured stale timeout
    if (!isFileActive(agent.jsonlFile) && !isFileGrowing(agent.jsonlFile)) {
      console.log(`[Agent ${id}] Session inactive, cleaning up`);
      removeAgent(id);
    }
  }
}

// -- Send full state to new client --

function sendInitialState(ws: WebSocket, assets: ReturnType<typeof loadAllAssets>): void {
  const send = (msg: Record<string, unknown>) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  };

  // Send assets first
  send({ type: 'characterSpritesLoaded', characters: assets.characters });
  send({ type: 'floorTilesLoaded', sprites: assets.floorTiles });
  send({ type: 'wallTilesLoaded', sets: assets.wallSets });
  send({ type: 'furnitureAssetsLoaded', catalog: assets.catalog, sprites: assets.sprites });

  // Send settings
  send({ type: 'settingsLoaded', soundEnabled: true });

  // Send standalone mode flag
  send({ type: 'standaloneMode', enabled: true });

  // Send existing agents - these get buffered in pendingAgents by the webview
  const agentIds = [...agents.keys()].sort((a, b) => a - b);
  const folderNames: Record<number, string> = {};
  const terminalApps: Record<number, string> = {};
  const projectPaths: Record<number, string> = {};
  const characterIds: Record<number, number> = {};
  for (const [id, agent] of agents) {
    if (agent.folderName) folderNames[id] = agent.folderName;
    if (agent.terminalApp) terminalApps[id] = agent.terminalApp;
    if (agent.projectPath) projectPaths[id] = agent.projectPath;
    if (agent.characterId !== undefined) characterIds[id] = agent.characterId;
  }
  send({
    type: 'existingAgents',
    agents: agentIds,
    agentMeta: {},
    folderNames,
    terminalApps,
    projectPaths,
    characterIds,
  });

  // Re-poll BEADS for all agents on client connect (ensures fresh data)
  for (const [agentId, agent] of agents) {
    if (agent.hasBeads && agent.beadsRoot) {
      const issues = pollBeads(agent.beadsRoot);
      const todoMap = new Map<string, { subject: string; status: string }>();
      for (const issue of issues) {
        todoMap.set(issue.taskId, { subject: issue.subject, status: issue.status });
      }
      agentTodos.set(agentId, todoMap);
    }
  }

  // Send existing todos for all agents
  const allTodos: Record<number, Array<{ taskId: string; subject: string; status: string }>> = {};
  for (const [agentId, todos] of agentTodos) {
    allTodos[agentId] = Array.from(todos.entries()).map(([taskId, t]) => ({
      taskId,
      subject: t.subject,
      status: t.status,
    }));
  }
  send({ type: 'todosLoaded', todos: allTodos });

  // Send layout LAST - this triggers the webview to flush pendingAgents into OfficeState
  const savedLayout = readLayoutFromFile();
  const layout = savedLayout ?? assets.defaultLayout;
  if (layout) {
    if (savedLayout && assets.defaultLayout) {
      const fileRevision = (savedLayout[LAYOUT_REVISION_KEY] as number) ?? 0;
      const defaultRevision = (assets.defaultLayout[LAYOUT_REVISION_KEY] as number) ?? 0;
      if (defaultRevision > fileRevision) {
        writeLayoutToFile(assets.defaultLayout);
        send({ type: 'layoutLoaded', layout: assets.defaultLayout, wasReset: true });
      } else {
        send({ type: 'layoutLoaded', layout: savedLayout });
      }
    } else if (savedLayout) {
      send({ type: 'layoutLoaded', layout: savedLayout });
    } else if (assets.defaultLayout) {
      writeLayoutToFile(assets.defaultLayout);
      send({ type: 'layoutLoaded', layout: assets.defaultLayout });
    }
  } else {
    send({ type: 'layoutLoaded', layout: null });
  }

  // Re-send current tool states
  for (const [agentId, agent] of agents) {
    for (const [toolId, status] of agent.activeToolStatuses) {
      send({ type: 'agentToolStart', id: agentId, toolId, status });
    }
    if (agent.isWaiting) {
      send({ type: 'agentStatus', id: agentId, status: 'waiting' });
    }
  }
}

// -- Static file server --

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon',
  };
  return mimes[ext] || 'application/octet-stream';
}

// -- Main --

function main(): void {
  const config = loadConfig();
  const port = parseInt(process.env.PORT || '', 10) || config.port || DEFAULT_PORT;

  // Find assets - check dist/assets first, then webview-ui/public/assets
  const projectRoot = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(projectRoot, '..');
  let assetsRoot: string | null = null;

  const distAssets = path.join(projectRoot, 'dist', 'assets');
  const repoDistAssets = path.join(repoRoot, 'dist', 'assets');
  const publicAssets = path.join(repoRoot, 'webview-ui', 'public', 'assets');

  if (fs.existsSync(distAssets)) {
    assetsRoot = path.join(projectRoot, 'dist');
  } else if (fs.existsSync(repoDistAssets)) {
    assetsRoot = path.join(repoRoot, 'dist');
  } else if (fs.existsSync(publicAssets)) {
    assetsRoot = path.join(repoRoot, 'webview-ui', 'public');
  }

  if (!assetsRoot) {
    console.error(
      'Could not find assets directory. Run the main project build first: npm run build',
    );
    process.exit(1);
  }

  console.log(`[Server] Loading assets from: ${assetsRoot}`);
  const assets = loadAllAssets(assetsRoot);

  // Find webview dist
  const webviewDist = path.join(repoRoot, 'dist', 'webview');
  if (!fs.existsSync(webviewDist)) {
    console.error(`Webview not built. Run from repo root: npm run build`);
    process.exit(1);
  }

  // Create HTTP server for static files
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    let filePath = path.join(webviewDist, url.pathname === '/' ? 'index.html' : url.pathname);

    // Also serve fonts from public dir
    if (url.pathname.startsWith('/fonts/')) {
      const fontPath = path.join(repoRoot, 'webview-ui', 'public', url.pathname);
      if (fs.existsSync(fontPath)) {
        filePath = fontPath;
      }
    }

    if (!fs.existsSync(filePath)) {
      // SPA fallback
      filePath = path.join(webviewDist, 'index.html');
    }

    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  // WebSocket server
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`[WS] Client connected (${clients.size} total)`);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log(`[WS] Received: ${msg.type}`);
        if (msg.type === 'webviewReady') {
          // Send initial state only after React app is mounted and listening
          sendInitialState(ws, assets);
        } else {
          handleClientMessage(msg, assets);
        }
      } catch {
        /* ignore bad messages */
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[WS] Client disconnected (${clients.size} total)`);
    });
  });

  // Start scanning for sessions
  scanAllProjects();
  setInterval(() => {
    scanAllProjects();
    cleanupStaleAgents();
  }, PROJECT_SCAN_INTERVAL_MS);

  // Start terminal detection
  updateTerminalInfo();
  setInterval(updateTerminalInfo, TERMINAL_DETECT_INTERVAL_MS);

  // Watch config for changes — reassign characters and broadcast updates
  watchConfig(() => {
    console.log('[Config] Configuration changed, reassigning characters');
    for (const [id, agent] of agents) {
      const newCharId = agent.projectPath ? resolveCharacterId(agent.projectPath) : -1;
      if (newCharId >= 0 && newCharId !== agent.characterId) {
        agent.characterId = newCharId;
        broadcast({
          type: 'agentCharacterUpdate',
          id,
          characterId: newCharId,
        });
      }
    }
  });

  server.listen(port, () => {
    console.log(`\n  Pixel Agents standalone server running at:`);
    console.log(`  http://localhost:${port}\n`);
    console.log(`  Watching all Claude Code sessions in ~/.claude/projects/`);
    console.log(`  Found ${agents.size} active session(s)\n`);
  });
}

function handleClientMessage(
  msg: Record<string, unknown>,
  assets: ReturnType<typeof loadAllAssets>,
): void {
  if (msg.type === 'webviewReady') {
    // Already handled on connection
  } else if (msg.type === 'saveLayout') {
    writeLayoutToFile(msg.layout as Record<string, unknown>);
  } else if (msg.type === 'saveAgentSeats') {
    // In standalone mode, seats are handled client-side (localStorage)
  } else if (msg.type === 'openClaude') {
    // Cannot spawn terminals in standalone mode - ignore
    console.log(
      '[Server] "Open Claude" not available in standalone mode - start claude from your terminal',
    );
  } else if (msg.type === 'focusAgent') {
    const agentId = msg.id as number;
    const agent = agents.get(agentId);
    let success = false;
    console.log(
      `[Focus] Agent ${agentId}: app=${agent?.terminalApp ?? 'none'} pid=${agent?.claudePid ?? 'none'} tty=${agent?.tty ?? 'none'} path=${agent?.projectPath ?? 'none'}`,
    );
    if (agent?.terminalApp && agent.claudePid && agent.projectPath) {
      success = focusTerminal(
        agent.terminalApp,
        agent.claudePid,
        agent.projectPath,
        agent.tty ?? null,
      );
    }
    broadcast({ type: 'focusResult', id: agentId, success });
  } else if (msg.type === 'closeAgent') {
    // Cannot close external terminal sessions
  } else if (msg.type === 'setSoundEnabled') {
    // Client-side only
  }
}

main();
