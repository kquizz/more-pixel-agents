# Lively Office — Feature Design

**Date:** 2026-03-18
**Status:** Approved

## Overview

A collection of features to make Pixel Agents feel more alive, useful, and charming. Organized into three phases by complexity and dependency.

---

## Phase 1: Quick Wins

### 1.1 — Notification Sounds for Completions

**Goal:** Distinct audio cues so you know what happened without looking.

- **Task completion sound** — plays when a bead is closed (softer, satisfying "ding" — different pitch/timbre from the existing waiting chime)
- **Idle sound** — plays when an agent's turn ends and they go idle (subtle, low tone — optional, controlled by existing Sound Notifications setting)
- Both sounds share the existing enable/disable toggle in Settings

**Implementation:** Add new oscillator patterns in `notificationSound.ts`. Hook task-completion sound to `todoCompleted` message. Hook idle sound to `agentStatus: 'waiting'` (already triggers the existing chime — add the idle variant when the agent transitions from active to waiting).

### 1.2 — Kanban "Clear Done" Button

**Goal:** Completed items persist on the board until manually cleared, giving "what happened while I was away" history.

- Add a "Clear" button in the Done column header of `KanbanOverlay.tsx`
- Clicking it removes all completed items from the displayed list (client-side only — beads still tracks them)
- Cleared state resets on page reload (completed items reappear from beads poll)
- The 6-item cap on Done still applies to the *visible* items

**Implementation:** Local React state `clearedTaskIds: Set<string>` in KanbanOverlay. Filter completed items against this set. Clear button adds all current completed IDs to the set.

### 1.3 — Sub-Agent Mini Laptops

**Goal:** When a sub-agent spawns, a small laptop sprite appears at their seat, visually distinguishing them from full agents.

- New `LAPTOP` furniture asset (small, ~8x8 or 1-tile, surface-placeable)
- When a sub-agent is created and assigned a seat, temporarily place a laptop sprite at their position
- Laptop is purely visual (not saved to layout) — removed when sub-agent despawns
- Laptop rendered as part of the sub-agent's character state, not as real furniture

**Implementation:** Add laptop sprite to `spriteData.ts`. In `officeState.ts`, sub-agent characters get a `hasLaptop: boolean` flag. Renderer draws the laptop sprite on the ground at the sub-agent's seat position before drawing the character.

---

## Phase 2: Smart Desk Assignment

### 2.1 — Project-Labeled Desks

**Goal:** Desks can be assigned to a project. Agents working on that project automatically sit at the right desk.

**Editor UI:**
- In layout edit mode, selecting a desk shows a text input field in the editor toolbar for "Project Label"
- Type a project name (e.g. "tesla-site", "core-ui") and it's stored on the `PlacedFurniture` entry
- The label renders on the canvas above the desk (small text, similar style to existing desk labels)
- Desks without a label remain "free" — any agent can sit there

**Data model:**
- Add `projectLabel?: string` to `PlacedFurniture` in the layout
- Persisted in `~/.pixel-agents/layout.json` like other furniture properties
- No migration needed — missing field means unlabeled

**Seat assignment logic:**
- On agent creation/update, check `agent.projectPath` against desk `projectLabel`
- Match by folder name substring (e.g. projectPath `/Users/foo/Code/tesla-site` matches label `tesla-site`)
- Priority: labeled desk match > current seat > nearest free desk
- If no matching labeled desk exists, fall back to nearest free desk (current behavior)

### 2.2 — Dynamic Project Detection

**Goal:** When an agent switches projects mid-session (e.g. `cd ../tesla-site && npm test`), it walks to the correct desk.

- The standalone server already strips `cd` prefixes from Bash commands — extend this to also detect project switches
- When `formatToolStatus` sees a `cd` to a different project directory, broadcast a `projectSwitch` message
- Webview receives `projectSwitch`, checks if the new project has a labeled desk, and triggers the agent to walk there
- Agent releases old seat, walks to new desk, claims new seat

**Detection heuristic:**
- Parse Bash `command` input for `cd <path>` patterns
- Resolve relative paths against the agent's known `projectPath`
- Only trigger if the resolved path is a *different* project root (has its own `.git` or is a known workspace folder)

### 2.3 — Desk Labels on Canvas

Desks with a `projectLabel` show the label text rendered on the canvas above the desk furniture, using the existing `deskLabels` rendering infrastructure. Labels are always visible (not just in edit mode).

### 2.4 — Decouple Agent Sprites from Projects

**Goal:** Agents are no longer tied to a specific character sprite by project folder. The *computer/desk* represents the project; the *agent sprite* is purely cosmetic.

**Current behavior:** `characterId` is deterministically hashed from the project folder name (or set in config), so the same project always gets the same sprite. This means if you have 3 agents all working in `tesla`, they all look the same.

**New behavior:**
- Remove the deterministic folder-name hash for `characterId`
- Replace with `pickDiversePalette()` — already exists in the webview for ensuring visual diversity. Port this logic to the server so each new agent gets the least-used sprite among current agents.
- Remove `folderCharacters` config support (no longer needed — desks carry the project identity)
- Agents get a *random diverse* appearance on spawn. Two agents on the same project will look different.
- The `agentCharacterUpdate` message and config watcher for character reassignment can be removed.

**Identity model after Phase 2:**
- **Desk** = project (has `projectLabel`, renders label on canvas)
- **Agent** = worker (cosmetic sprite, sits at whatever desk matches their current work)
- An agent switching projects walks to a different desk — same sprite, different seat

---

## Phase 3: Ambient Life & Interactions

### 3.1 — Water Cooler Visits

**Goal:** Idle agents occasionally walk to a water cooler for a "break."

- New `WATER_COOLER` furniture piece (add to asset pipeline, ~1x1 tile)
- When an agent is idle and has been at their desk for a configurable duration (e.g. 30-60s of idle), there's a random chance they walk to the nearest water cooler
- Agent stands at the cooler for 3-5 seconds, then walks back to their seat
- Similar to existing `whiteboardVisit` pattern — new `waterCoolerVisit` phase on Character

**Interaction variant:** If two idle agents are near the water cooler at the same time, they face each other briefly (a "chat") before returning.

### 3.2 — Coffee Machine Runs

**Goal:** Similar to water cooler but with a coffee machine.

- New `COFFEE_MACHINE` furniture piece
- Idle agents occasionally walk to it, pause with a brief "using" animation (typing frames reused), walk back
- Can share the same visit infrastructure as water cooler — generalize into an `amenityVisit` system with configurable furniture types

### 3.3 — Agent-to-Agent Interactions

**Goal:** Agents acknowledge each other, especially parent/child relationships.

- **Sub-agent greeting:** When a sub-agent spawns near its parent, both face each other for 1 second before the sub-agent walks to its seat
- **Bead handoff:** When an agent closes a bead that unblocks another agent's bead, the closer walks to the unblocked agent's desk, pauses briefly (handing off), then walks back. Reuses `whiteboardVisit` infrastructure.
- **Idle desk visits:** Idle agents occasionally walk to another idle agent's desk, stand for 2-3 seconds facing them, then return. Lower priority than water cooler visits. Only between agents on the same project (matching `projectLabel`).

### 3.4 — New Decorative Furniture

Expand the asset catalog with ambient items that make offices feel real:

- **Water cooler** (functional — agents visit it)
- **Coffee machine** (functional — agents visit it)
- **Plants** (potted plant, tall plant — decorative only)
- **Fish tank** (decorative, could have animated sprite frames later)
- **Rug** (floor overlay — decorative)
- **Coat rack** (decorative)
- **Printer** (decorative, could become functional later)

These go through the existing asset pipeline (`scripts/`) and get added to `furniture-catalog.json`.

---

## Beads Task Breakdown

Before executing, create the following beads issues. Dependencies ensure correct build order.

```
# Phase 1
bd create "Add task-completion and idle notification sounds" --priority P1
bd create "Add Clear Done button to Kanban overlay" --priority P1
bd create "Add sub-agent mini laptop sprite" --priority P2

# Phase 2
bd create "Add projectLabel field to PlacedFurniture and editor UI" --priority P0
bd create "Render project labels on desks in canvas" --priority P1
bd create "Project-aware seat assignment logic" --priority P0
bd create "Dynamic project detection from cd commands" --priority P1
bd create "Decouple agent sprites from projects — use diverse palette assignment" --priority P1

# Phase 3
bd create "Create water cooler and coffee machine furniture assets" --priority P1
bd create "Implement amenity visit system (water cooler/coffee runs)" --priority P1
bd create "Add sub-agent greeting animation" --priority P2
bd create "Add bead handoff walk animation" --priority P2
bd create "Add idle agent desk visit interactions" --priority P2
bd create "Create decorative furniture assets (plants, fish tank, etc)" --priority P2
```

**Dependencies:**
- "Render project labels" blocked by "Add projectLabel field"
- "Project-aware seat assignment" blocked by "Add projectLabel field"
- "Dynamic project detection" blocked by "Project-aware seat assignment"
- "Decouple agent sprites" blocked by "Project-aware seat assignment" (identity shifts to desks first)
- "Amenity visit system" blocked by "Create water cooler/coffee machine assets"
- "Bead handoff animation" blocked by "Amenity visit system" (reuses infrastructure)
- "Idle desk visits" blocked by "Amenity visit system"

---

## Non-Goals

- No persistent desk assignment config file (editor UI is the source of truth)
- No multi-monitor setups per agent
- No animated decorative items in Phase 3 (fish tank animation is a future nice-to-have)
- No automatic project label inference from git remotes
- No per-project sprite assignment after Phase 2 (sprites are cosmetic, desks carry project identity)
