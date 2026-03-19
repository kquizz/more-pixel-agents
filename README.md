# More Pixel Agents

A fork of [Pixel Agents](https://github.com/pablodelucca/pixel-agents) by [@pablodelucca](https://github.com/pablodelucca) — a brilliant project that turns your AI coding agents into pixel art characters in a virtual office.

I loved the original but I'm too impatient to wait for features to land upstream, so I forked it and built the stuff I wanted.

## What's Different

This fork runs as a **standalone browser app** — no VS Code required. Just `npm run standalone` and open `localhost:3100`. It auto-discovers all your active Claude Code sessions across your machine.

### Core Features

**Standalone Browser Mode**
- Runs at `localhost:3100` as a regular web app
- Auto-discovers all Claude Code sessions from `~/.claude/projects/`
- No VS Code extension needed

**Click-to-Focus Terminal**
- Click any agent to switch to its Ghostty/iTerm2/Terminal.app/VS Code tab
- Uses process tree detection + AppleScript to find and focus the right terminal

**Smart Desk Assignment**
- Desks can be labeled with a project name (e.g. "tesla-site") in the layout editor
- Agents automatically sit at desks matching their project
- When an agent switches projects via `cd`, they walk to the correct desk
- Active agents prefer desks near PCs; sub-agents prefer couches

**Diverse Character Sprites**
- Each agent gets a randomly assigned diverse appearance
- Two agents on the same project look different — the desk carries the project identity, not the sprite
- Override via config at `~/.config/more-pixel-agents/config.json` if you want specific assignments

### Agent Interactions

**Sub-Agent Characters**
- When Claude spawns sub-agents (Agent tool), mini 60% scale characters appear
- Sub-agents sit on couches with laptops on their laps
- Parent and sub-agent face each other briefly on spawn (greeting animation)
- Disappear when the sub-agent task completes

**Speech Bubbles**
- 8 expressive bubble types beyond the standard permission/waiting indicators
- Hand-raise for permission requests, zzZ sleep for long idle, ! alert, ? confused, sweat drop, lightbulb idea, heart, and sleep bubbles
- Bubbles trigger contextually based on agent state and interactions

**Movie-Inspired Easter Eggs**
- **Office Space**: Idle agents near a printer occasionally gang up for a beatdown — complete with screen shake
- **IT Crowd**: Agents show confused "?" reactions when encountering unfamiliar tools
- **Hackers**: Alert "!" cascades ripple through nearby agents
- **War Games**: Idle agents gather around the arcade cabinet

**Ambient Life**
- Idle agents occasionally visit the water cooler or coffee machine
- Idle agents on the same project visit each other's desks for a chat
- When an agent completes a bead, they walk to the nearest colleague's desk (handoff animation)
- Agents walk to the whiteboard when completing todos
- **Paper airplane toss** — idle agents throw paper airplanes to each other across the office
- **Time-based desk drinks** — coffee mugs in the morning, soda cans in the afternoon, beer bottles in the evening

**Project-Based Desk Routing**
- Agents analyze file paths from tool activity to determine which project area they belong in
- Automatically walk to the correct desk cluster when switching contexts

**Notification Sounds**
- Task completion ding (descending C6-G5)
- Idle tone when agent's turn ends (low C4)
- Waiting chime when agent needs attention (ascending E5-E6)
- Ambient typing clicks and footstep sounds (very subtle)
- All sounds respect the enable/disable toggle in Settings

**Day/Night Cycle**
- Subtle dark blue overlay tied to the system clock
- Sunrise (6-8 AM), full daylight, sunset (6-9 PM), night
- **Monitor glow effect** — screens cast a subtle glow that scales brighter at night
- **Real-time clock** — wall clock with animated hour and minute hands

### Canvas Overlays

**Hover Tooltips**
- Mouse over any agent to see terminal app, current tool, and project folder

**Tool Thought Bubbles**
- Active agents show their current tool name (Read, Edit, Bash, etc.) in a small bubble above their head
- Automatically hidden when permission or waiting bubbles are showing

**Desk Labels**
- Project names rendered on desk surfaces from the layout editor's project label
- Agents without a labeled desk show their project folder name

### Kanban Board (Redesigned)

**BEADS Integration**
- Detects [BEADS](https://github.com/beads-project/beads) distributed issue tracker from `.beads/` directories
- Discovers all `.beads` instances — walks up the directory tree AND scans 2 levels of child directories
- Late discovery: if terminal info arrives after session adoption, re-scans for beads

**Kanban Overlay**
- Click the whiteboard to open the full kanban board
- Three columns: Pending, In Progress, Done
- Click any card to expand full bead details: ID, description, priority (color-coded P0-P4), assignee, dependency/blocker counts, dates, and close reason
- Priority and type tags shown inline on collapsed cards
- "Clear" button in the Done column to dismiss completed items
- Cleared state resets on page reload

### Layout Editor

**Furniture Catalog**
- Water cooler, coffee machine (functional — agents visit them)
- Fish tank (animated 2-frame swimming fish, fixed animation timing)
- **Big fish tank** — 3-tile aquarium with 3 independently swimming fish
- Rug (fully walkable/placeable floor overlay)
- Coat rack, printer, plants, bookshelves, paintings, and more
- **New monitors**: widescreen, dual, and triple monitor setups — all with ON animation sprites
- **Standing desk** for the health-conscious coder
- **Server rack** for that data center aesthetic
- **Desk lamp**, **rubber duck** (essential debugging tool), **coffee mug**, **soda can**, **beer bottle**
- **Arcade cabinet** (agents gather around it War Games style)
- **Snack machine** for late-night fuel
- **Window** furniture piece with day/night awareness
- **Ping pong table** for break time
- **Wide whiteboard** — 3-tile collaborative surface
- Project label text input when selecting a desk
- Chair sitting positions refined for pixel-perfect alignment

**Office Templates**
- 4 pre-built layouts selectable from Settings: Gaming Studio, Startup, Enterprise, Coworking
- Each template includes desks, seating, amenities, and decorations themed to the vibe

## Quick Start

```bash
# Clone
git clone https://github.com/kquizz/more-pixel-agents.git
cd more-pixel-agents

# Install dependencies
npm install
cd webview-ui && npm install && cd ..
cd standalone && npm install && cd ..

# Build and run
npm run standalone
```

Open `http://localhost:3100` in your browser. Any running Claude Code sessions will appear automatically.

## Configuration

Optional config file at `~/.config/more-pixel-agents/config.json`:

```json
{
  "port": 3100,
  "folderCharacters": {
    "/Users/you/Code/project-a": 1,
    "/Users/you/Code/project-b": 3
  },
  "staleTimeout": 30
}
```

- `port` — server port (default 3100)
- `folderCharacters` — map project paths to character IDs (0-5) for specific sprite assignments
- `staleTimeout` — minutes before inactive sessions are removed (default 30)

## Credits

All the pixel art, the canvas rendering engine, the character state machine, pathfinding, sprite system, and the core architecture are from the original [Pixel Agents](https://github.com/pablodelucca/pixel-agents) by [@pablodelucca](https://github.com/pablodelucca). This fork builds the standalone server, terminal integration, and additional features on top of that foundation.

The standalone server code is based on [PR #156](https://github.com/pablodelucca/pixel-agents/pull/156) by [@ronilaukkarinen](https://github.com/ronilaukkarinen).

## License

MIT — same as the original.
