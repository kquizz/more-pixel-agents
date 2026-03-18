import { execSync } from 'child_process';

export interface TerminalInfo {
  terminalApp: string;
  claudePid: number;
  shellPid: number | null;
  cwd: string;
  tty: string | null;
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

function getTty(pid: number): string | null {
  try {
    const tty = execSync(`ps -p ${pid} -o tty=`, {
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();
    return tty && tty !== '??' ? tty : null;
  } catch {
    return null;
  }
}

function identifyTerminal(args: string): string | null {
  const lower = args.toLowerCase();

  for (const pattern of VSCODE_PATTERNS) {
    if (lower.includes(pattern)) {
      return 'VS Code';
    }
  }

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
 * Returns a Map keyed by Claude PID (not CWD) to support multiple
 * sessions in the same folder.
 */
export function detectTerminals(): Map<number, TerminalInfo> {
  const result = new Map<number, TerminalInfo>();

  try {
    const psOutput = execSync('ps auxww', {
      encoding: 'utf-8',
      timeout: 5000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const lines = psOutput.split('\n');
    for (const line of lines) {
      if (!line.includes('claude') || line.includes('grep')) continue;

      const lowerLine = line.toLowerCase();
      if (
        !lowerLine.includes('/claude') &&
        !lowerLine.includes('claude-cli') &&
        !lowerLine.includes(' claude ') &&
        !lowerLine.endsWith(' claude') &&
        !/ claude$/.test(lowerLine)
      ) {
        continue;
      }

      const fields = line.trim().split(/\s+/);
      if (fields.length < 2) continue;
      const pid = parseInt(fields[1], 10);
      if (isNaN(pid)) continue;

      try {
        const cwd = getCwd(pid);
        if (!cwd) continue;

        const treeResult = walkProcessTree(pid);
        if (!treeResult) continue;

        const tty = getTty(pid);

        result.set(pid, {
          terminalApp: treeResult.terminalApp,
          claudePid: pid,
          shellPid: treeResult.shellPid,
          cwd,
          tty,
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
