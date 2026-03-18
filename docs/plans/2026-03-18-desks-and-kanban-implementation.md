# Desk Labels & Kanban Whiteboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show project names on desk surfaces and turn the whiteboard into a live kanban board that agents interact with when completing todos.

**Architecture:** The transcript parser detects TaskCreate/TaskUpdate tool uses and broadcasts todo events via WebSocket. The server tracks todos per agent. The webview renders project labels on desks and colored blocks on the whiteboard. Clicking the whiteboard opens an HTML overlay with the full kanban view. Agents animate walking to the whiteboard on todo completion.

**Tech Stack:** TypeScript, Canvas 2D, WebSocket, HTML/CSS overlay

---

## Task 1: Detect TaskCreate/TaskUpdate in Transcript Parser

**Files:**
- Modify: `standalone/src/transcriptParser.ts`
- Modify: `standalone/src/types.ts`

**Step 1: Add TodoItem type to types.ts**

In `standalone/src/types.ts`, add:

```typescript
export interface TodoItem {
  taskId: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed';
  agentId: number;
  projectName: string;
  updatedAt: number; // Date.now()
}
```

**Step 2: Detect TaskCreate and TaskUpdate tool uses**

In `standalone/src/transcriptParser.ts`, inside the `tool_use` processing block (around line 187), after the existing tool detection, add detection for `TaskCreate` and `TaskUpdate`:

```typescript
if (toolName === 'TaskCreate') {
  const subject = (block.input?.subject as string) || '';
  broadcast({
    type: 'todoCreated',
    agentId,
    taskId: block.id, // use tool_use_id as temp ID until we get the real one
    subject,
    status: 'pending',
  });
}

if (toolName === 'TaskUpdate') {
  const taskId = block.input?.taskId as string;
  const status = block.input?.status as string;
  const subject = block.input?.subject as string | undefined;
  if (taskId && status) {
    broadcast({
      type: 'todoUpdated',
      agentId,
      taskId,
      status,
      subject,
    });
    if (status === 'completed') {
      broadcast({
        type: 'todoCompleted',
        agentId,
        taskId,
      });
    }
  }
}
```

**Step 3: Build and verify**

```bash
cd standalone && node build.js
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add standalone/src/transcriptParser.ts standalone/src/types.ts
git commit -m "feat: detect TaskCreate/TaskUpdate in transcript parser"
```

---

## Task 2: Server-Side Todo Tracking

**Files:**
- Modify: `standalone/src/server.ts`

**Step 1: Add todo tracking state**

Near the top of server.ts, after the agents Map, add:

```typescript
const agentTodos = new Map<number, Map<string, { subject: string; status: string }>>();
```

**Step 2: Handle todo events in the broadcast pipeline**

Wrap or intercept the broadcast function to track todos. When the transcript parser broadcasts `todoCreated` or `todoUpdated`, update the `agentTodos` map before forwarding to clients:

```typescript
function handleTodoBroadcast(msg: Record<string, unknown>): void {
  if (msg.type === 'todoCreated') {
    const agentId = msg.agentId as number;
    const taskId = msg.taskId as string;
    if (!agentTodos.has(agentId)) agentTodos.set(agentId, new Map());
    agentTodos.get(agentId)!.set(taskId, {
      subject: msg.subject as string,
      status: 'pending',
    });
  } else if (msg.type === 'todoUpdated') {
    const agentId = msg.agentId as number;
    const taskId = msg.taskId as string;
    const todos = agentTodos.get(agentId);
    if (todos?.has(taskId)) {
      const todo = todos.get(taskId)!;
      todo.status = msg.status as string;
      if (msg.subject) todo.subject = msg.subject as string;
    }
  }
}
```

Call `handleTodoBroadcast(msg)` inside the broadcast function.

**Step 3: Send existing todos to new WebSocket clients**

In `sendInitialState()`, after sending existing agents, send a `todosLoaded` message:

```typescript
const allTodos: Record<number, Array<{ taskId: string; subject: string; status: string }>> = {};
for (const [agentId, todos] of agentTodos) {
  allTodos[agentId] = Array.from(todos.entries()).map(([taskId, t]) => ({
    taskId,
    subject: t.subject,
    status: t.status,
  }));
}
broadcast({ type: 'todosLoaded', todos: allTodos });
```

**Step 4: Build and verify**

```bash
cd standalone && node build.js
```

**Step 5: Commit**

```bash
git add standalone/src/server.ts
git commit -m "feat: server-side todo tracking with WebSocket broadcast"
```

---

## Task 3: Desk Labels on Canvas

**Files:**
- Modify: `webview-ui/src/office/engine/renderer.ts`
- Modify: `webview-ui/src/office/engine/officeState.ts`

**Step 1: Track which desk an agent's project occupies**

In `officeState.ts`, add a method to get desk tile positions for seated agents:

```typescript
getDeskLabels(): Array<{ col: number; row: number; label: string }> {
  const labels: Array<{ col: number; row: number; label: string }> = [];
  for (const [, ch] of this.characters) {
    if (ch.isSubagent || !ch.seatId) continue;
    const seat = this.seats.get(ch.seatId);
    if (!seat || !seat.facesDesk) continue;
    const label = ch.projectPath
      ? ch.projectPath.split('/').pop() || ''
      : ch.folderName || '';
    if (!label) continue;
    // Place label on the desk tile (one tile in facing direction from seat)
    const dirs: Record<number, { dc: number; dr: number }> = {
      0: { dc: 0, dr: -1 }, // UP
      1: { dc: 0, dr: 1 },  // DOWN
      2: { dc: -1, dr: 0 }, // LEFT
      3: { dc: 1, dr: 0 },  // RIGHT
    };
    const d = dirs[seat.facingDir] || { dc: 0, dr: -1 };
    labels.push({
      col: seat.seatCol + d.dc,
      row: seat.seatRow + d.dr,
      label,
    });
  }
  return labels;
}
```

**Step 2: Render desk labels in renderer.ts**

Add a new function `renderDeskLabels()` and call it in `renderFrame()` after furniture but before characters:

```typescript
function renderDeskLabels(
  ctx: CanvasRenderingContext2D,
  deskLabels: Array<{ col: number; row: number; label: string }>,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const fontSize = Math.max(4, Math.round(5 * zoom));
  ctx.save();
  ctx.font = `${fontSize}px "Courier New", Courier, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.6;

  for (const { col, row, label } of deskLabels) {
    const x = Math.round(offsetX + (col * TILE_SIZE + TILE_SIZE / 2) * zoom);
    const y = Math.round(offsetY + (row * TILE_SIZE + TILE_SIZE / 2) * zoom);

    // Dark background pill
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x - textWidth / 2 - 2, y - fontSize / 2 - 1, textWidth + 4, fontSize + 2);

    // Text
    ctx.fillStyle = '#cdd6f4';
    ctx.fillText(label, x, y);
  }

  ctx.restore();
}
```

**Step 3: Build and verify**

```bash
cd /Users/kquillen/Code/games/more-pixel-agents && npm run build
```

**Step 4: Commit**

```bash
git add webview-ui/src/office/engine/renderer.ts webview-ui/src/office/engine/officeState.ts
git commit -m "feat: render project name labels on desk surfaces"
```

---

## Task 4: Webview Todo State Management

**Files:**
- Modify: `webview-ui/src/hooks/useExtensionMessages.ts`
- Modify: `webview-ui/src/office/types.ts`

**Step 1: Add TodoItem type to webview types**

In `webview-ui/src/office/types.ts`:

```typescript
export interface TodoItem {
  taskId: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed';
  agentId: number;
}
```

**Step 2: Handle todo messages in useExtensionMessages**

Add state for todos and handle the WebSocket messages:

```typescript
const [todos, setTodos] = useState<TodoItem[]>([]);
```

Handle messages:
- `todosLoaded` — set initial todos from server
- `todoCreated` — add new todo
- `todoUpdated` — update status of existing todo
- `todoCompleted` — trigger agent walk-to-whiteboard animation

For `todoCompleted`, call a new method on `officeState` to trigger the whiteboard visit animation.

**Step 3: Build and verify**

```bash
cd /Users/kquillen/Code/games/more-pixel-agents && npm run build
```

**Step 4: Commit**

```bash
git add webview-ui/src/hooks/useExtensionMessages.ts webview-ui/src/office/types.ts
git commit -m "feat: handle todo WebSocket messages in webview"
```

---

## Task 5: Whiteboard Canvas Rendering (Colored Blocks)

**Files:**
- Modify: `webview-ui/src/office/engine/renderer.ts`
- Modify: `webview-ui/src/office/engine/officeState.ts`

**Step 1: Find whiteboard furniture positions**

In `officeState.ts`, add a method to find whiteboard positions:

```typescript
getWhiteboardPositions(): Array<{ col: number; row: number; width: number; height: number }> {
  const whiteboards: Array<{ col: number; row: number; width: number; height: number }> = [];
  for (const item of this.layout.furniture) {
    if (item.type.startsWith('WHITEBOARD')) {
      const entry = getCatalogEntry(item.type);
      if (entry) {
        whiteboards.push({
          col: item.col,
          row: item.row,
          width: entry.footprintW,
          height: entry.footprintH,
        });
      }
    }
  }
  return whiteboards;
}
```

**Step 2: Render todo blocks on the whiteboard**

Add `renderWhiteboardTodos()` in renderer.ts. For each whiteboard, draw small colored blocks representing todos:

```typescript
function renderWhiteboardTodos(
  ctx: CanvasRenderingContext2D,
  whiteboards: Array<{ col: number; row: number; width: number; height: number }>,
  todos: TodoItem[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  if (todos.length === 0 || whiteboards.length === 0) return;

  const wb = whiteboards[0]; // Use first whiteboard
  const blockSize = Math.max(2, Math.round(3 * zoom));
  const padding = Math.round(2 * zoom);
  const startX = Math.round(offsetX + wb.col * TILE_SIZE * zoom) + padding;
  const startY = Math.round(offsetY + wb.row * TILE_SIZE * zoom) + padding;
  const maxCols = Math.floor((wb.width * TILE_SIZE * zoom - padding * 2) / (blockSize + 1));

  ctx.save();
  let col = 0;
  let row = 0;
  for (const todo of todos) {
    const color = todo.status === 'completed' ? '#a6e3a1'
      : todo.status === 'in_progress' ? '#f9e2af'
      : '#585b70';
    ctx.fillStyle = color;
    ctx.fillRect(startX + col * (blockSize + 1), startY + row * (blockSize + 1), blockSize, blockSize);
    col++;
    if (col >= maxCols) { col = 0; row++; }
  }
  ctx.restore();
}
```

Call this in `renderFrame()` after furniture rendering.

**Step 3: Build and verify**

```bash
cd /Users/kquillen/Code/games/more-pixel-agents && npm run build
```

**Step 4: Commit**

```bash
git add webview-ui/src/
git commit -m "feat: render todo blocks on whiteboard canvas"
```

---

## Task 6: Agent Walk-to-Whiteboard Animation

**Files:**
- Modify: `webview-ui/src/office/engine/officeState.ts`
- Modify: `webview-ui/src/office/engine/characters.ts`
- Modify: `webview-ui/src/office/types.ts`

**Step 1: Add whiteboard visit state to Character**

In `types.ts`, add to the Character interface:

```typescript
whiteboardVisit?: {
  targetCol: number;
  targetRow: number;
  returnSeatId: string;
  phase: 'walking_to' | 'writing' | 'walking_back';
  timer: number;
};
```

**Step 2: Add triggerWhiteboardVisit method to officeState**

When a `todoCompleted` event arrives, find the nearest whiteboard, set the character's `whiteboardVisit` state, and temporarily reassign them to walk to the whiteboard:

```typescript
triggerWhiteboardVisit(agentId: number): void {
  const ch = this.characters.get(agentId);
  if (!ch || !ch.seatId) return;
  const whiteboards = this.getWhiteboardPositions();
  if (whiteboards.length === 0) return;
  const wb = whiteboards[0];
  // Target tile is one row below the whiteboard (standing in front of it)
  ch.whiteboardVisit = {
    targetCol: wb.col,
    targetRow: wb.row + wb.height,
    returnSeatId: ch.seatId,
    phase: 'walking_to',
    timer: 0,
  };
}
```

**Step 3: Handle whiteboard visit in character update loop**

In `characters.ts`, in the `updateCharacter()` function, check for `whiteboardVisit` state:

- `walking_to`: Pathfind to whiteboard target tile. When arrived, switch to `writing` phase.
- `writing`: Face UP (toward whiteboard). Play typing animation frames for ~1.5 seconds. Then switch to `walking_back`.
- `walking_back`: Pathfind back to original seat. When arrived, clear `whiteboardVisit` and resume normal behavior.

**Step 4: Build and verify**

```bash
cd /Users/kquillen/Code/games/more-pixel-agents && npm run build
```

**Step 5: Commit**

```bash
git add webview-ui/src/
git commit -m "feat: agent walks to whiteboard on todo completion"
```

---

## Task 7: Click-to-Zoom Kanban Overlay

**Files:**
- Create: `webview-ui/src/components/KanbanOverlay.tsx`
- Modify: `webview-ui/src/office/components/OfficeCanvas.tsx`
- Modify: `webview-ui/src/App.tsx`

**Step 1: Create KanbanOverlay component**

A React component that renders as a semi-transparent overlay with three columns:

```typescript
interface KanbanOverlayProps {
  todos: TodoItem[];
  agents: Map<number, { folderName?: string; palette: number }>;
  onClose: () => void;
}
```

Renders:
- Dark semi-transparent backdrop (click to close)
- 3 columns: Pending | In Progress | Done
- Cards grouped by project name (derived from agent folderName)
- Each card shows subject text
- Project headers colored to match agent character palette
- Styled with inline CSS (no external stylesheets needed)

**Step 2: Add whiteboard click detection**

In `OfficeCanvas.tsx`, in the `handleClick` handler, after checking for character hits, check if the click landed on a whiteboard tile. If so, trigger the kanban overlay.

In `officeState.ts`, add `getWhiteboardAt(worldX, worldY)` that returns true if the tile contains a whiteboard.

**Step 3: Wire overlay into App.tsx**

Add `showKanban` state. Pass the toggle to OfficeCanvas. When whiteboard is clicked, set `showKanban = true`. Render `<KanbanOverlay>` when true.

**Step 4: Build and verify**

```bash
cd /Users/kquillen/Code/games/more-pixel-agents && npm run build
```

**Step 5: Commit**

```bash
git add webview-ui/src/
git commit -m "feat: click whiteboard to open kanban overlay"
```

---

## Task 8: Polish and Push

**Step 1: Build everything**

```bash
cd /Users/kquillen/Code/games/more-pixel-agents
npm run build
cd standalone && node build.js
```

**Step 2: Test end-to-end**

Start the server, open the browser, verify:
- Desk labels appear on desk surfaces
- Colored blocks appear on whiteboard when todos exist
- Clicking whiteboard opens kanban overlay
- Agent walks to whiteboard when a todo is completed

**Step 3: Push**

```bash
git push origin main
```
