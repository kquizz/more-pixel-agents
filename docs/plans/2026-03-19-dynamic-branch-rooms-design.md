# Dynamic Branch Rooms with PR Status

## Problem
No way to visually see which branch/PR agents are working on, or the CI/review status of PRs. The office is static while real work happens across multiple branches.

## Solution
The office dynamically generates rooms for each active git branch. Each room has its own whiteboard (scoped to that branch's tasks), server rack (PR/CI status), and workstations. Agents physically move between rooms as they switch branches.

## Architecture

### Layout Structure
- **Main room** (left) = user-designed layout from editor. Agents on `main`/`master` or not in git work here.
- **Branch rooms** = auto-generated grid cells expanding to the right. Each is a small room (~5x5 tiles) with:
  - Branch name sign/label at the top
  - Whiteboard showing that branch's beads/tasks
  - Server rack with PR status LEDs
  - Desk + chair for agents
  - Floor/wall auto-themed

### GitHub PR Polling
New `githubPoller.ts` in standalone server:
- Runs `gh pr list --json number,state,title,headRefName,statusCheckRollup,reviewDecision,mergeable` every 30s
- Tracks state changes per PR
- Broadcasts `prEvent` messages to webview: `ci_fail`, `ci_pass`, `ci_pending`, `merged`, `closed`, `changes_requested`, `approved`, `conflict`
- Maps PRs to branch rooms via `headRefName`

### Branch Detection
- Parse agent tool output for `git checkout`, `git switch`, `git branch` commands
- Parse Bash commands for branch context
- The `projectHint` system already detects project directories — extend to detect branch from git context
- Standalone server can run `git branch --show-current` in each agent's project directory

### Dynamic Room Generation
When a new branch is detected:
1. Calculate grid position (main room = col 0, branches fill cols 1, 2, 3... in rows)
2. Expand the layout grid to accommodate
3. Generate room tiles (floor, walls) matching main room style
4. Place furniture: whiteboard, server rack, desk, chair, branch sign
5. Broadcast updated layout to webview

When a branch is merged/deleted:
1. Play celebration effect (confetti on the server rack, heart bubbles)
2. After 10s, despawn the room (matrix rain effect on furniture?)
3. Collapse grid if possible, or leave empty for reuse

### PR Status Visual Effects (persistent states)
| PR State | Server Rack Visual | Room Effect |
|----------|-------------------|-------------|
| CI running | Yellow blinking LEDs | Subtle pulse |
| CI passed | Green LEDs | Normal |
| CI failed | Red LEDs + fire sprite | Monitors red glow, agents sweat |
| Approved | Green LEDs + sparkle | Brief celebration |
| Changes requested | Yellow LEDs | Agent sweat bubble |
| Merge conflict | Red LEDs + red flash | Monitor crash effect |
| Merged | Celebration → despawn | Confetti, then room fades |

### Agent Movement
- When `setAgentActive` detects a branch change, agent walks to that branch's room
- Sub-agents spawned on the same branch appear in the same room
- Idle agents return to main room
- Seat assignment scoped to rooms: `findProjectSeat` extended to check branch rooms

### Whiteboard Scoping
- Each room's whiteboard shows beads/tasks filtered by that branch's epic
- Main room whiteboard shows all tasks or unassigned tasks
- The beads poller already groups by project — extend to group by branch

## Data Flow
```
gh pr list (every 30s) → githubPoller.ts
  → prStatusUpdate { branch, prNumber, state, ciStatus, reviewStatus }
  → broadcast to webview

git branch detection (from tool output) → server
  → agentBranchChange { agentId, branch }
  → broadcast to webview

webview receives events:
  → OfficeState creates/updates branch rooms
  → Agents reassigned to branch room seats
  → Server rack visuals updated
  → Persistent effects applied (fire, glow, etc.)
```

## New Assets Needed
- Branch sign furniture (shows branch name text)
- Fire sprite (2-frame animated, placed on desk/rack during CI fail)
- Server rack LED variants (green/yellow/red states)
- Confetti particle system for merge celebrations

## Implementation Phases
1. GitHub poller + PR status tracking
2. Branch detection from agent tool output
3. Dynamic room generation engine
4. PR status visual effects on server racks
5. Agent movement between rooms
6. Whiteboard scoping per branch
7. Room despawn on merge/delete
