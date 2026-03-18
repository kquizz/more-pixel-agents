# Desk Labels & Kanban Whiteboard — Design

## Overview

Two features that bring the pixel office closer to a real project management view:
1. Desk surfaces show the project folder name of the seated agent
2. The whiteboard furniture becomes a live kanban board showing todo progress across all agents

## Feature 1: Desk Labels

Each desk shows the project name of the agent sitting at it.

- Server sends project name with seat assignment
- Renderer draws small pixel text (~5px monospace) on the desk surface tile
- Semi-transparent, same z-order as desk furniture
- Label follows the agent if they move desks
- Empty desks show no label

## Feature 2: Kanban Whiteboard

### Data Flow

- Transcript parser detects `TaskCreate` and `TaskUpdate` tool uses from JSONL
- `TaskCreate` → new pending todo
- `TaskUpdate` with `status: "in_progress"` → todo started
- `TaskUpdate` with `status: "completed"` → todo done
- Server maintains `Map<number, TodoItem[]>` per agent
- Broadcasts `todosUpdated` to webview on changes
- Broadcasts `todoCompleted` with agent ID to trigger walk animation
- Todos cleared when agent session ends (stale timeout)

### Canvas Rendering (At-a-Glance)

- WHITEBOARD furniture gets small colored blocks rendered on its surface
- Each block = one todo: green (done), yellow (in progress), grey (pending)
- Blocks grouped in columns by agent/project, colored to match agent character
- Tiny pixel squares (~2-3px each)

### Click-to-Zoom Overlay (Readable Detail)

- Clicking the whiteboard opens an HTML overlay panel
- 3-column kanban: Pending | In Progress | Done
- Cards show todo subject text, colored by project/agent
- Grouped under project headers
- Click outside to dismiss
- Semi-transparent dark background

### Agent Animation on Todo Completion

1. Agent stands up from desk
2. Pathfinds to nearest whiteboard
3. Plays "writing" animation (reuse typing frames, facing whiteboard direction)
4. Brief pause (~1 second)
5. Walks back to desk, sits down
6. Corresponding block changes from yellow to green during animation

## Approach

Hybrid rendering: desk labels and whiteboard preview blocks render on the canvas (pixel art). Kanban detail view is an HTML overlay for readability.

## Implementation Order

1. Desk labels on canvas
2. Todo detection in transcript parser
3. Server-side todo tracking + WebSocket messages
4. Whiteboard canvas rendering (colored blocks)
5. Agent walk-to-whiteboard animation
6. Click-to-zoom HTML kanban overlay
