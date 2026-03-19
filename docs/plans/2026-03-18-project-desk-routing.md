# Project-Based Desk Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Agents automatically move to project-labeled desks based on the files they're editing.

**Architecture:** Extract project directory from tool file paths in the transcript parser, send as `projectHint` with tool events, webview updates agent's project and reassigns their seat to a matching labeled desk. Desks auto-label when an agent with a detected project sits at an unlabeled desk.

**Tech Stack:** TypeScript, both extension and standalone transcript parsers, webview React + canvas engine.

---

### Task 1: Extract projectHint from tool file paths

**Files:**
- Modify: `src/transcriptParser.ts:21-55` (formatToolStatus + new helper)
- Modify: `standalone/src/transcriptParser.ts` (same changes)

**Step 1: Add extractProjectFromPath helper**

Add above `formatToolStatus` in both files:

```typescript
/** Extract project directory name from an absolute file path.
 *  e.g., "/Users/kquillen/Code/tesla-site/src/foo.ts" → "tesla-site"
 *  Returns null if path doesn't look like a project file. */
function extractProjectFromPath(filePath: unknown): string | null {
  if (typeof filePath !== 'string' || !filePath.startsWith('/')) return null;
  const segments = filePath.split('/');
  // Look for a segment after common code root dirs
  const codeRoots = ['Code', 'Projects', 'repos', 'src', 'work', 'dev', 'games'];
  for (let i = 0; i < segments.length - 1; i++) {
    if (codeRoots.includes(segments[i]) && segments[i + 1]) {
      return segments[i + 1];
    }
  }
  // Fallback: use segment at index 4 (typically /Users/<name>/<dir>/<project>)
  if (segments.length > 4 && segments[4]) {
    return segments[4];
  }
  return null;
}
```

**Step 2: Extract projectHint in tool_use processing**

In the `for (const block of blocks)` loop where `agentToolStart` is sent, add project extraction:

```typescript
// After: const status = formatToolStatus(toolName, block.input || {});
const input = block.input || {};
const projectHint = extractProjectFromPath(
  input.file_path || input.path
) || null;
```

**Step 3: Include projectHint in the agentToolStart message**

```typescript
webview?.postMessage({
  type: 'agentToolStart',
  id: agentId,
  toolId: block.id,
  status,
  ...(projectHint ? { projectHint } : {}),
});
```

**Step 4: Do the same for subagent tool starts**

Same extraction in the subagent tool processing block, add `projectHint` to `subagentToolStart` message.

**Step 5: Commit**

```
feat: extract projectHint from tool file paths in transcript parser
```

---

### Task 2: Handle projectHint in webview message handler

**Files:**
- Modify: `webview-ui/src/hooks/useExtensionMessages.ts:224-248`

**Step 1: Read projectHint from agentToolStart message**

In the `agentToolStart` handler, after `os.setAgentActive(id, true)`:

```typescript
// Update agent project if tool provides a project hint
const projectHint = msg.projectHint as string | undefined;
if (projectHint) {
  os.updateAgentProject(id, projectHint);
}
```

**Step 2: Commit**

```
feat: pass projectHint from tool events to officeState
```

---

### Task 3: Add updateAgentProject method to OfficeState

**Files:**
- Modify: `webview-ui/src/office/engine/officeState.ts`

**Step 1: Add the updateAgentProject method**

After `setAgentActive`:

```typescript
/** Update agent's project and reassign to a project-labeled desk if available */
updateAgentProject(id: number, project: string): void {
  const ch = this.characters.get(id);
  if (!ch || ch.isSubagent) return;

  // Normalize: just the folder name, lowercase for matching
  const projectName = project.toLowerCase();
  const currentProject = ch.projectPath?.split('/').pop()?.toLowerCase();
  if (currentProject === projectName) return; // no change

  // Update the character's project
  ch.projectPath = project;

  // Try to find a desk labeled for this project
  const newSeatId = this.findProjectSeat(project);
  if (newSeatId && newSeatId !== ch.seatId) {
    // Release current seat
    if (ch.seatId) {
      const oldSeat = this.seats.get(ch.seatId);
      if (oldSeat) oldSeat.assigned = false;
    }
    // Claim new seat
    const newSeat = this.seats.get(newSeatId)!;
    newSeat.assigned = true;
    ch.seatId = newSeatId;
    // Pathfind to new seat
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, newSeat.seatCol, newSeat.seatRow, this.tileMap, this.blockedTiles)
    );
    if (path.length > 0) {
      ch.path = path;
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
    } else {
      // Can't pathfind — snap to seat
      ch.tileCol = newSeat.seatCol;
      ch.tileRow = newSeat.seatRow;
      ch.x = newSeat.seatCol * TILE_SIZE + TILE_SIZE / 2;
      ch.y = newSeat.seatRow * TILE_SIZE + TILE_SIZE / 2;
    }
    ch.dir = newSeat.facingDir;
    this.rebuildFurnitureInstances();
  } else if (!newSeatId && ch.seatId) {
    // No labeled desk for this project — auto-label the current desk
    this.autoLabelDesk(ch.seatId, project);
  }
}
```

**Step 2: Add autoLabelDesk helper**

```typescript
/** Auto-label the desk adjacent to a seat with a project name */
private autoLabelDesk(seatId: string, project: string): void {
  const seat = this.seats.get(seatId);
  if (!seat || seat.projectLabel) return; // already labeled

  // Find the desk furniture adjacent to this seat
  for (const item of this.layout.furniture) {
    const entry = getCatalogEntry(item.type);
    if (!entry || !entry.isDesk) continue;
    // Check if this seat is adjacent to any tile of this desk
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const deskCol = item.col + dc;
        const deskRow = item.row + dr;
        const dist = Math.abs(seat.seatCol - deskCol) + Math.abs(seat.seatRow - deskRow);
        if (dist <= 1) {
          // Found adjacent desk — label it
          item.projectLabel = project;
          // Rebuild seats to propagate the label
          this.seats = layoutToSeats(this.layout.furniture);
          // Re-mark assigned seats
          for (const ch of this.characters.values()) {
            if (ch.seatId) {
              const s = this.seats.get(ch.seatId);
              if (s) s.assigned = true;
            }
          }
          return;
        }
      }
    }
  }
}
```

**Step 3: Commit**

```
feat: add updateAgentProject with seat reassignment and auto-labeling
```

---

### Task 4: Apply same changes to standalone transcript parser

**Files:**
- Modify: `standalone/src/transcriptParser.ts`

**Step 1: Copy extractProjectFromPath and projectHint changes**

Mirror all changes from Task 1 into the standalone version. The functions are identical.

**Step 2: Commit**

```
feat: add projectHint extraction to standalone transcript parser
```

---

### Task 5: Build and verify

**Step 1: Build both extension and standalone**

```bash
npm run build && npm run standalone:build
```

**Step 2: Test manually**

- Start standalone server, open in browser
- Add an agent that edits files in a known project
- Verify console shows `projectHint` in agentToolStart messages
- Verify agent walks to the correct desk (if labeled) or desk gets auto-labeled

**Step 3: Remove debug logging from layoutSerializer.ts (if still present)**

**Step 4: Final commit**

```
chore: clean up debug logging, verify project desk routing
```
