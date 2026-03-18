# More Pixel Agents — Design

## Overview

A standalone browser-based pixel art office that visualizes all active Claude Code agents across your machine. Fork of [pixel-agents](https://github.com/pablodelucca/pixel-agents) with three core features and one stretch goal.

## Goals

1. **Browser-based standalone app** — Run outside VS Code as a local web server (`localhost:3100`)
2. **Auto-discover all active sessions** — Scan `~/.claude/projects/` for any session active in the last 30 minutes
3. **Click-to-focus terminal** — Click an agent to switch to its Ghostty/iTerm/VS Code/Terminal.app tab
4. **Character-to-folder config** — Assign specific character sprites to project folders
5. **Mini sub-agents (stretch)** — Show smaller pixel characters when agents spawn sub-agents

## Approach

Cherry-pick/merge existing PRs into the fork, then build new features on top:

- **PR #156** — Standalone Node.js HTTP + WebSocket server serving the webview
- **PR #157** — `scanAllProjectDirs()` to watch all `~/.claude/projects/` directories
- **PR #141** — External terminal detection (adapt for Ghostty focus logic)
- **PR #143** — Already merged in main; browser preview foundation with `shared/` modules

## Architecture

### Standalone Server (from PR #156)

- Node.js HTTP server serves the built webview at `localhost:3100`
- WebSocket bridge replaces VS Code's `postMessage` API
- `vscodeApi.ts` auto-detects environment (VS Code vs browser) and switches transport

### Multi-Folder File Watcher (from PR #157)

- `scanAllProjectDirs()` scans all directories under `~/.claude/projects/`
- Creates virtual agents for each active session (transcript modified < 30 min ago)
- Watches for new JSONL transcript entries to update agent state (typing, reading, idle, etc.)

### Terminal Focus (new)

Detection flow:
1. Parse session's working directory from `~/.claude/projects/` path
2. Use `pgrep`/`ps` to find Claude Code processes and their parent PIDs
3. Cache the session → terminal mapping

Focus logic (macOS, via `osascript`):
- **Ghostty:** Activate app, match tab by PID or window title
- **iTerm2:** Rich AppleScript support, focus tab by PID
- **Terminal.app:** AppleScript to focus window
- **VS Code:** `code` CLI or AppleScript
- **Fallback:** Tooltip with working directory

### Character Config (new)

Config file at `~/.config/more-pixel-agents/config.json` mapping folder paths to character IDs.

### Mini Sub-Agents (stretch goal)

Detect `Agent` tool invocations, render at ~60% scale, cap at 4 per parent.

## Implementation Order

1. Fork repo, integrate PRs #156 + #157
2. Add character-to-folder config system
3. Build terminal detection + focus-switching
4. (Stretch) Mini sub-agent rendering
