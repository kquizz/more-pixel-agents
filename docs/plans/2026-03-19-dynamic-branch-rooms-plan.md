# Dynamic Branch Rooms Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-generate branch rooms with PR status that expand the office as agents work on different git branches.

**Architecture:** A GitHub poller runs `gh pr list` every 30s and broadcasts PR status. A branch detector parses agent tool output for git commands. The webview dynamically generates rooms to the right of the main layout, each with a label, whiteboard, server rack, desk + chair. Agents walk between rooms based on active branch.

**Tech Stack:** TypeScript, `gh` CLI, standalone server polling, webview canvas rendering.

---

### Task 1: GitHub PR Poller

**Files:**
- Create: `standalone/src/githubPoller.ts`
- Modify: `standalone/src/server.ts`
- Modify: `standalone/src/types.ts`

**Step 1: Create the poller module**

```typescript
// standalone/src/githubPoller.ts
import { execSync } from 'child_process';

export interface PrStatus {
  number: number;
  title: string;
  branch: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  ciStatus: 'pending' | 'pass' | 'fail' | 'none';
  reviewStatus: 'pending' | 'approved' | 'changes_requested' | 'none';
  mergeable: boolean;
}

export function pollGitHubPRs(cwd: string): PrStatus[] {
  try {
    const output = execSync(
      'gh pr list --state all --limit 20 --json number,title,headRefName,state,statusCheckRollup,reviewDecision,mergeable',
      { cwd, encoding: 'utf-8', timeout: 10000 }
    );
    const prs = JSON.parse(output) as Array<Record<string, unknown>>;
    return prs.map(pr => ({
      number: pr.number as number,
      title: pr.title as string,
      branch: pr.headRefName as string,
      state: pr.state as 'OPEN' | 'CLOSED' | 'MERGED',
      ciStatus: mapCiStatus(pr.statusCheckRollup),
      reviewStatus: mapReviewStatus(pr.reviewDecision as string | null),
      mergeable: pr.mergeable !== 'CONFLICTING',
    }));
  } catch {
    return [];
  }
}

function mapCiStatus(rollup: unknown): PrStatus['ciStatus'] {
  if (!Array.isArray(rollup) || rollup.length === 0) return 'none';
  const hasFailure = rollup.some((c: Record<string, unknown>) =>
    c.conclusion === 'FAILURE' || c.conclusion === 'ERROR'
  );
  if (hasFailure) return 'fail';
  const hasPending = rollup.some((c: Record<string, unknown>) =>
    c.status === 'IN_PROGRESS' || c.status === 'QUEUED' || c.status === 'PENDING'
  );
  if (hasPending) return 'pending';
  return 'pass';
}

function mapReviewStatus(decision: string | null): PrStatus['reviewStatus'] {
  if (!decision) return 'none';
  if (decision === 'APPROVED') return 'approved';
  if (decision === 'CHANGES_REQUESTED') return 'changes_requested';
  return 'pending';
}
```

**Step 2: Integrate into server.ts**

Add a 30s polling interval in the server that calls `pollGitHubPRs` for each agent's project directory, detects state changes, and broadcasts events.

```typescript
// In server.ts — add after beads polling setup
import { pollGitHubPRs, PrStatus } from './githubPoller.js';

const prCache = new Map<string, PrStatus[]>(); // projectPath → last known PRs
const PR_POLL_INTERVAL = 30000;

setInterval(() => {
  for (const [agentId, agent] of agents) {
    if (!agent.projectPath) continue;
    const newPrs = pollGitHubPRs(agent.projectPath);
    const oldPrs = prCache.get(agent.projectPath) || [];
    // Detect changes and broadcast events
    for (const pr of newPrs) {
      const old = oldPrs.find(o => o.number === pr.number);
      if (!old || old.ciStatus !== pr.ciStatus || old.state !== pr.state ||
          old.reviewStatus !== pr.reviewStatus) {
        broadcast({ type: 'prStatusUpdate', pr, agentId });
      }
    }
    prCache.set(agent.projectPath, newPrs);
  }
  // Also broadcast full PR list for room generation
  const allPrs: PrStatus[] = [];
  for (const prs of prCache.values()) {
    for (const pr of prs) {
      if (!allPrs.some(p => p.number === pr.number)) allPrs.push(pr);
    }
  }
  broadcast({ type: 'prList', prs: allPrs });
}, PR_POLL_INTERVAL);
```

**Step 3: Commit**
```
feat: add GitHub PR poller via gh CLI
```

---

### Task 2: Branch Detection from Agent Tool Output

**Files:**
- Modify: `standalone/src/transcriptParser.ts`
- Modify: `standalone/src/server.ts`

**Step 1: Detect git branch commands in Bash tool output**

In `formatToolStatus` or the tool_use processing, detect git branch/checkout commands:

```typescript
// In transcriptParser.ts — add helper
function extractBranchFromCommand(command: string): string | null {
  // git checkout <branch>, git switch <branch>, git checkout -b <branch>
  const patterns = [
    /git\s+checkout\s+(?:-b\s+)?(\S+)/,
    /git\s+switch\s+(?:-c\s+)?(\S+)/,
  ];
  for (const pat of patterns) {
    const match = command.match(pat);
    if (match && match[1] && !match[1].startsWith('-')) return match[1];
  }
  return null;
}
```

**Step 2: Broadcast branch changes**

When a Bash tool_use contains a git branch command, broadcast:
```typescript
const branch = extractBranchFromCommand(input.command as string);
if (branch) {
  broadcast({ type: 'agentBranchChange', agentId, branch });
}
```

**Step 3: Also poll current branch per project**

Add to the PR polling interval:
```typescript
function getCurrentBranch(cwd: string): string | null {
  try {
    return execSync('git branch --show-current', { cwd, encoding: 'utf-8', timeout: 3000 }).trim();
  } catch { return null; }
}
```

**Step 4: Commit**
```
feat: detect git branch changes from agent tool output
```

---

### Task 3: Webview PR State + Branch Room Data Model

**Files:**
- Modify: `webview-ui/src/hooks/useExtensionMessages.ts`
- Modify: `webview-ui/src/office/engine/officeState.ts`
- Modify: `webview-ui/src/office/types.ts`

**Step 1: Add PR and branch types**

```typescript
// In types.ts
export interface PrStatus {
  number: number;
  title: string;
  branch: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  ciStatus: 'pending' | 'pass' | 'fail' | 'none';
  reviewStatus: 'pending' | 'approved' | 'changes_requested' | 'none';
  mergeable: boolean;
}

export interface BranchRoom {
  branch: string;
  gridCol: number;  // which column in the room grid (0 = main room)
  gridRow: number;
  roomCol: number;  // tile offset in the layout
  roomRow: number;
  width: number;    // room size in tiles
  height: number;
  pr?: PrStatus;    // linked PR if any
  agentIds: number[];
}
```

**Step 2: Add to OfficeState**

```typescript
// In officeState.ts
branchRooms: Map<string, BranchRoom> = new Map();
prStatuses: PrStatus[] = [];
agentBranches: Map<number, string> = new Map(); // agentId → branch name
```

**Step 3: Handle messages in useExtensionMessages**

```typescript
} else if (msg.type === 'prList') {
  os.updatePrList(msg.prs as PrStatus[]);
} else if (msg.type === 'prStatusUpdate') {
  os.updatePrStatus(msg.pr as PrStatus, msg.agentId as number);
} else if (msg.type === 'agentBranchChange') {
  os.setAgentBranch(msg.agentId as number, msg.branch as string);
}
```

**Step 4: Commit**
```
feat: webview data model for PR status and branch rooms
```

---

### Task 4: Dynamic Room Generation Engine

**Files:**
- Modify: `webview-ui/src/office/engine/officeState.ts`
- Modify: `webview-ui/src/office/layout/layoutSerializer.ts`

**Step 1: Room generation on branch change**

When `setAgentBranch` is called and no room exists for that branch:

```typescript
setAgentBranch(agentId: number, branch: string): void {
  const prev = this.agentBranches.get(agentId);
  if (prev === branch) return;
  this.agentBranches.set(agentId, branch);

  // Skip room generation for main/master
  if (branch === 'main' || branch === 'master') {
    // Move agent back to main room
    return;
  }

  // Create room if doesn't exist
  if (!this.branchRooms.has(branch)) {
    this.generateBranchRoom(branch);
  }

  // Move agent to branch room
  this.moveAgentToRoom(agentId, branch);
}
```

**Step 2: Generate room layout**

```typescript
private generateBranchRoom(branch: string): void {
  const ROOM_W = 6;
  const ROOM_H = 8;
  const existingRooms = Array.from(this.branchRooms.values());

  // Find next grid position (fill columns then rows)
  const MAX_COLS = 3;
  const idx = existingRooms.length;
  const gridCol = (idx % MAX_COLS) + 1; // +1 because col 0 is main room
  const gridRow = Math.floor(idx / MAX_COLS);

  // Calculate tile offset (right of main room)
  const mainCols = this.layout.cols;
  const roomCol = mainCols + (gridCol - 1) * ROOM_W;
  const roomRow = gridRow * ROOM_H;

  // Expand the layout grid
  const newCols = Math.max(this.layout.cols, roomCol + ROOM_W);
  const newRows = Math.max(this.layout.rows, roomRow + ROOM_H);
  this.expandLayoutTo(newCols, newRows);

  // Fill room tiles (floor + walls)
  this.fillRoomTiles(roomCol, roomRow, ROOM_W, ROOM_H);

  // Place furniture
  this.placeBranchRoomFurniture(branch, roomCol, roomRow, ROOM_W, ROOM_H);

  // Store room
  this.branchRooms.set(branch, {
    branch, gridCol, gridRow, roomCol, roomRow,
    width: ROOM_W, height: ROOM_H,
    agentIds: [],
  });

  // Rebuild derived state
  this.rebuildFromLayout(this.layout);
}
```

**Step 3: Place furniture in generated room**

```typescript
private placeBranchRoomFurniture(
  branch: string, col: number, row: number, w: number, h: number
): void {
  const uid = () => `br-${branch}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;

  // Branch label sign (top of room) — use projectLabel on a desk
  // Whiteboard
  this.layout.furniture.push({
    uid: uid(), type: 'WHITEBOARD', col: col + 1, row: row,
  });

  // Server rack (for PR status)
  this.layout.furniture.push({
    uid: uid(), type: 'SERVER_RACK', col: col + w - 2, row: row + 1,
  });

  // Desk with chair
  this.layout.furniture.push({
    uid: uid(), type: 'DESK_FRONT', col: col + 1, row: row + 3,
    projectLabel: branch,
  });
  this.layout.furniture.push({
    uid: uid(), type: 'TRIPLE_MONITOR_OFF', col: col + 1, row: row + 3,
  });
  this.layout.furniture.push({
    uid: uid(), type: 'CUSHIONED_CHAIR_BACK', col: col + 2, row: row + 5,
  });
}
```

**Step 4: Commit**
```
feat: dynamic branch room generation engine
```

---

### Task 5: PR Status Visual Effects

**Files:**
- Create: `webview-ui/src/office/sprites/fire.json` (2 animation frames)
- Modify: `webview-ui/src/office/engine/renderer.ts`
- Modify: `webview-ui/src/office/engine/officeState.ts`

**Step 1: Create fire sprite**

Two-frame animated fire sprite (8x12) in orange/red/yellow.

**Step 2: PR status method on OfficeState**

```typescript
updatePrStatus(pr: PrStatus, agentId: number): void {
  // Find the branch room for this PR
  const room = this.branchRooms.get(pr.branch);
  if (room) {
    room.pr = pr;
  }

  // Trigger visual effects based on status changes
  if (pr.ciStatus === 'fail') {
    this.triggerScreenShake();
    // Show sweat on all agents in this room
    for (const aid of room?.agentIds ?? []) {
      this.showReactionBubble(aid, 'sweat');
    }
  } else if (pr.state === 'MERGED') {
    // Celebration! Heart bubbles on all agents
    for (const ch of this.characters.values()) {
      this.showReactionBubble(ch.id, 'heart');
    }
  } else if (pr.reviewStatus === 'approved') {
    if (agentId) this.showReactionBubble(agentId, 'idea');
  } else if (pr.reviewStatus === 'changes_requested') {
    if (agentId) this.showReactionBubble(agentId, 'sweat');
  }
}
```

**Step 3: Render persistent fire on CI-fail rooms**

In the renderer, after furniture draw, check each branch room's PR status. If `ciStatus === 'fail'`, draw animated fire sprite on the server rack position.

**Step 4: Render branch name labels**

Draw the branch name as text above each branch room.

**Step 5: Commit**
```
feat: PR status visual effects — fire, celebrations, branch labels
```

---

### Task 6: Agent Movement Between Rooms

**Files:**
- Modify: `webview-ui/src/office/engine/officeState.ts`

**Step 1: moveAgentToRoom method**

```typescript
moveAgentToRoom(agentId: number, branch: string): void {
  const ch = this.characters.get(agentId);
  if (!ch) return;

  const room = this.branchRooms.get(branch);
  if (!room) return;

  // Find a seat in the room (by projectLabel matching branch)
  const seatId = this.findProjectSeat(branch);
  if (seatId && seatId !== ch.seatId) {
    // Release old seat
    if (ch.seatId) {
      const old = this.seats.get(ch.seatId);
      if (old) old.assigned = false;
    }
    // Claim new seat and pathfind
    const seat = this.seats.get(seatId)!;
    seat.assigned = true;
    ch.seatId = seatId;
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow,
        this.tileMap, this.blockedTiles)
    );
    if (path.length > 0) {
      ch.path = path;
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
    }
    ch.dir = seat.facingDir;
  }

  // Track agent in room
  room.agentIds = room.agentIds.filter(id => id !== agentId);
  room.agentIds.push(agentId);
}
```

**Step 2: Commit**
```
feat: agent movement between branch rooms
```

---

### Task 7: Build and Integration Test

**Step 1: Build**
```bash
npm run standalone:build
```

**Step 2: Manual test**
- Start standalone server
- Create an agent that checks out a feature branch
- Verify: branch room auto-generates to the right
- Verify: agent walks to the new room
- Verify: PR status shows on server rack
- Trigger CI failure, verify fire/red effects
- Merge PR, verify celebration + room cleanup

**Step 3: Commit**
```
feat: dynamic branch rooms with PR status — complete
```
