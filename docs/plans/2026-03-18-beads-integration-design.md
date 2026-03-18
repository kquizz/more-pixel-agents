# BEADS Integration Design

## Overview

Integrate BEADS (distributed graph issue tracker for AI agents) as a data source for the kanban whiteboard. When a project folder has a `.beads/` directory, use `bd list --json` to populate the whiteboard instead of the TodoCreate/TaskUpdate transcript detection.

## How It Works

### Detection
- When an agent is adopted, check if its decoded project path contains a `.beads/` directory
- Store `hasBeads: true` on the AgentState if detected
- Falls back to existing todo transcript detection when no `.beads/` exists

### Polling
- Run `bd list --json` in the agent's project directory after each `tool_result` event in the transcript
- Parse the JSON output into the same TodoItem format used by the existing system
- Map BEADS statuses: `open`/`in_progress`/`blocked` → in_progress, `closed` → completed, everything else → pending
- Broadcast `todosUpdated` with the full list (replaces, not appends)

### Data Flow
1. Transcript parser sees a `tool_result` → triggers BEADS poll for that agent
2. Server runs `bd list --json --dir <projectPath>` (or `cd <projectPath> && bd list --json`)
3. Parse JSON output into TodoItem array
4. Broadcast to webview as `todosLoaded` for that agent
5. Webview renders on whiteboard and kanban overlay (same as existing)

### Whiteboard + Kanban
- No visual changes needed — BEADS issues render as the same colored blocks
- Kanban overlay shows BEADS issue titles, statuses, and priorities
- Agent walk-to-whiteboard animation triggers on BEADS issue close (detected via status change between polls)

## Implementation Order

1. Add `.beads/` detection to agent adoption
2. Add BEADS polling function (runs `bd list --json`)
3. Hook polling into tool_result events in transcript parser
4. Map BEADS data to existing TodoItem format
5. Detect closed issues between polls to trigger whiteboard animation
