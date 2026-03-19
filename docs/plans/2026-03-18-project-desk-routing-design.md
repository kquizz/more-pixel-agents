# Project-Based Desk Routing

## Problem
When agents work on different projects (tesla-site, core-ui, etc.), there's no visual way to tell which project they're working on. Agents sit at random desks.

## Solution
Detect the active project from tool file paths and route agents to project-labeled desks.

## Design

### 1. Project Detection (Extension Side)
In `transcriptParser.ts`, when processing Read/Edit/Write tool_use blocks:
- Extract the project directory from `input.file_path` (absolute path)
- Use the directory name 2 levels up from the workspace root, or the first segment after common code directories (`/Code/`, `/Projects/`, home dir)
- Send `projectHint` field alongside `status` in `agentToolStart` messages

### 2. Webview Message Handling
In `useExtensionMessages.ts`, when `agentToolStart` arrives with `projectHint`:
- Call `officeState.updateAgentProject(id, projectHint)`
- This updates `ch.projectPath` and triggers seat reassignment if the project changed

### 3. Seat Reassignment (OfficeState)
New method `updateAgentProject(id, project)`:
- If project matches current projectPath, no-op
- Update `ch.projectPath`
- Call `findProjectSeat(project)` to find a matching labeled desk
- If found and different from current seat, reassign (release old seat, claim new, pathfind)
- If no labeled desk found, auto-label the agent's current desk with the project name

### 4. Auto-Labeling Desks
When an agent with a `projectHint` sits at an unlabeled desk:
- Set `PlacedFurniture.projectLabel` on the adjacent desk
- Rebuild seats so future agents with the same project get routed there
- Persist to layout file

### 5. Data Flow
```
JSONL: tool_use { name: "Edit", input: { file_path: "/Users/k/Code/tesla-site/src/foo.ts" } }
  → transcriptParser extracts projectHint: "tesla-site"
  → postMessage({ type: 'agentToolStart', ..., projectHint: "tesla-site" })
  → useExtensionMessages calls officeState.updateAgentProject(id, "tesla-site")
  → officeState finds seat with projectLabel "tesla-site"
  → character pathfinds to that desk
```

### 6. Edge Cases
- Agent works on a new project with no labeled desk → auto-label current desk
- Agent switches projects mid-session → walk to different desk
- Multiple agents on same project → both sit at desks labeled for that project
- Sub-agents inherit parent's project (already the case via parent palette)
