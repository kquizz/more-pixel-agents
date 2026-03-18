# More Pixel Agents

A fork of [Pixel Agents](https://github.com/pablodelucca/pixel-agents) by [@pablodelucca](https://github.com/pablodelucca) — a brilliant project that turns your AI coding agents into pixel art characters in a virtual office.

I loved the original but I'm too impatient to wait for features to land upstream, so I forked it and built the stuff I wanted.

## What's Different

This fork runs as a **standalone browser app** — no VS Code required. Just `npm run standalone` and open `localhost:3100`. It auto-discovers all your active Claude Code sessions across your machine.

### Features Added

**Standalone Browser Mode**
- Runs at `localhost:3100` as a regular web app
- Auto-discovers all Claude Code sessions from `~/.claude/projects/`
- No VS Code extension needed

**Click-to-Focus Terminal**
- Click any agent to switch to its Ghostty/iTerm2/Terminal.app/VS Code tab
- Uses process tree detection + AppleScript to find and focus the right terminal
- Ghostty tab switching uses a TTY marker approach for reliable tab identification

**Deterministic Character Assignment**
- Same project folder always gets the same character sprite (hashed from path)
- Override via config at `~/.config/more-pixel-agents/config.json`

**Smart Seat Assignment**
- Active agents sit at computer desks (seats closest to PCs)
- Sub-agents (mini characters) sit on couches
- Stale sessions show idle behavior (wandering, not typing)

**Mini Sub-Agent Characters**
- When Claude spawns sub-agents (Agent tool), mini 60% scale characters appear
- They sit on couches near the parent agent
- Disappear when the sub-agent task completes

**Hover Tooltips**
- Mouse over any agent to see project path, terminal app, and status
- Sub-agents show parent project info + "sub-agent" label

**Desk Labels**
- Project names rendered on desk surfaces so you can see which project each workstation is running

**Kanban Whiteboard** (not fully tested yet)
- Detects TaskCreate/TaskUpdate tool uses from JSONL transcripts
- Colored blocks on the whiteboard: green (done), yellow (in progress), grey (pending)
- Click the whiteboard to open a full kanban overlay
- Agents walk to the whiteboard when they complete a todo

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
- `folderCharacters` — map project paths to character IDs (0-5) for specific assignments
- `staleTimeout` — minutes before inactive sessions are removed (default 30)

## Credits

All the pixel art, the canvas rendering engine, the character state machine, pathfinding, sprite system, and the core architecture are from the original [Pixel Agents](https://github.com/pablodelucca/pixel-agents) by [@pablodelucca](https://github.com/pablodelucca). This fork builds the standalone server, terminal integration, and additional features on top of that foundation.

The standalone server code is based on [PR #156](https://github.com/pablodelucca/pixel-agents/pull/156) by [@ronilaukkarinen](https://github.com/ronilaukkarinen).

## License

MIT — same as the original.
