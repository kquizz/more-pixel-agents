import { execSync } from 'child_process';

export interface TerminalInfo {
  terminalApp: string;
  claudePid: number;
  shellPid: number | null;
}

const KNOWN_TERMINALS: Array<{ pattern: string; name: string }> = [
  { pattern: 'ghostty', name: 'Ghostty' },
  { pattern: 'iterm2', name: 'iTerm2' },
  { pattern: 'hyper', name: 'Hyper' },
  { pattern: 'wezterm', name: 'WezTerm' },
  { pattern: 'alacritty', name: 'Alacritty' },
  { pattern: 'kitty', name: 'kitty' },
  { pattern: 'tmux', name: 'tmux' },
  { pattern: 'cursor', name: 'Cursor' },
  { pattern: 'terminal.app', name: 'Terminal' },
  { pattern: 'apple_terminal', name: 'Terminal' },
];

const VSCODE_PATTERNS = ['code', 'code-insiders', 'electron'];

function getParentPid(pid: number): number | null {
  try {
    const result = execSync(`ps -p ${pid} -o ppid=`, {
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();
    const ppid = parseInt(result, 10);
    return isNaN(ppid) || ppid <= 1 ? null : ppid;
  } catch {
    return null;
  }
}

function getProcessArgs(pid: number): string | null {
  try {
    return execSync(`ps -p ${pid} -o args=`, {
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();
  } catch {
    return null;
  }
}

function getCwd(pid: number): string | null {
  try {
    const output = execSync(`lsof -a -p ${pid} -d cwd -Fn`, {
      encoding: 'utf-8',
      timeout: 3000,
    });
    // lsof output has lines like "p<pid>" and "n<path>"
    for (const line of output.split('\n')) {
      if (line.startsWith('n') && line.length > 1) {
        return line.slice(1);
      }
    }
    return null;
  } catch {
    return null;
  }
}

function identifyTerminal(args: string): string | null {
  const lower = args.toLowerCase();

  // Check VS Code patterns first
  for (const pattern of VSCODE_PATTERNS) {
    if (lower.includes(pattern)) {
      return 'VS Code';
    }
  }

  // Check known terminals
  for (const { pattern, name } of KNOWN_TERMINALS) {
    if (lower.includes(pattern)) {
      return name;
    }
  }

  return null;
}

function walkProcessTree(pid: number): { terminalApp: string; shellPid: number | null } | null {
  let currentPid: number | null = pid;
  let shellPid: number | null = null;
  const maxLevels = 8;

  for (let i = 0; i < maxLevels && currentPid !== null; i++) {
    const parentPid = getParentPid(currentPid);
    if (parentPid === null) break;

    const args = getProcessArgs(parentPid);
    if (!args) {
      currentPid = parentPid;
      continue;
    }

    // Check if this is a shell (track the first shell we find)
    const lowerArgs = args.toLowerCase();
    if (
      shellPid === null &&
      (lowerArgs.includes('/bash') ||
        lowerArgs.includes('/zsh') ||
        lowerArgs.includes('/fish') ||
        lowerArgs.includes('/sh'))
    ) {
      shellPid = parentPid;
    }

    const terminal = identifyTerminal(args);
    if (terminal) {
      return { terminalApp: terminal, shellPid };
    }

    currentPid = parentPid;
  }

  return null;
}

/**
 * Detect which terminal app hosts each active Claude Code session.
 * Returns a Map of project path -> TerminalInfo.
 */
export function detectTerminals(): Map<string, TerminalInfo> {
  const result = new Map<string, TerminalInfo>();

  try {
    const psOutput = execSync('ps auxww', {
      encoding: 'utf-8',
      timeout: 5000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const lines = psOutput.split('\n');
    for (const line of lines) {
      // Look for claude processes (the actual CLI, not grep itself)
      if (!line.includes('claude') || line.includes('grep')) continue;

      // Match lines that look like a Claude Code CLI process
      const lowerLine = line.toLowerCase();
      if (
        !lowerLine.includes('/claude') &&
        !lowerLine.includes('claude-cli') &&
        !lowerLine.includes(' claude ')
      ) {
        continue;
      }

      // Extract PID (second field in ps aux output)
      const fields = line.trim().split(/\s+/);
      if (fields.length < 2) continue;
      const pid = parseInt(fields[1], 10);
      if (isNaN(pid)) continue;

      try {
        // Get the working directory of this Claude process
        const cwd = getCwd(pid);
        if (!cwd) continue;

        const treeResult = walkProcessTree(pid);
        if (!treeResult) continue;

        result.set(cwd, {
          terminalApp: treeResult.terminalApp,
          claudePid: pid,
          shellPid: treeResult.shellPid,
        });
      } catch {
        // Skip this process on any error
      }
    }
  } catch {
    // If ps fails entirely, return empty map
  }

  return result;
}
