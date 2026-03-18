import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Focus the terminal window/tab hosting a Claude Code session.
 * Returns true on success, false on failure.
 */
export function focusTerminal(
  terminalApp: string,
  claudePid: number,
  projectPath: string,
  tty: string | null,
): boolean {
  try {
    const folderName = path.basename(projectPath);

    switch (terminalApp) {
      case 'Ghostty':
        return focusGhostty(folderName, tty);
      case 'iTerm2':
        return focusITerm2(folderName);
      case 'Terminal':
        return focusTerminalApp(folderName);
      case 'VS Code':
      case 'Cursor':
        return focusVSCode(projectPath, terminalApp);
      default:
        return activateApp(terminalApp);
    }
  } catch {
    return false;
  }
}

function runOsascriptMultiline(script: string): string {
  try {
    return execSync('osascript -', {
      input: script,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
  } catch {
    return '';
  }
}

function activateApp(appName: string): boolean {
  try {
    execSync(`osascript -e 'tell application "${appName}" to activate'`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Focus a Ghostty tab by writing a unique marker to its TTY, then finding
 * and clicking the tab with that marker title via System Events.
 *
 * Ghostty tabs don't expose their TTY/PID to AppleScript, but they do
 * reflect the terminal title set via escape sequences. We temporarily set
 * the title to a unique marker, find the matching tab, click it, then
 * clear the marker.
 */
function focusGhostty(folderName: string, tty: string | null): boolean {
  if (!tty) {
    // Fallback: just activate Ghostty without switching tabs
    return activateApp('Ghostty');
  }

  const ttyDevice = `/dev/${tty}`;
  if (!fs.existsSync(ttyDevice)) {
    return activateApp('Ghostty');
  }

  // Generate a unique marker that won't collide with real tab titles
  const marker = `__PIXEL_AGENT_FOCUS_${Date.now()}__`;

  try {
    // Set the terminal title to our marker via escape sequence
    const fd = fs.openSync(ttyDevice, 'w');
    fs.writeSync(fd, `\x1b]0;${marker}\x07`);
    fs.closeSync(fd);

    // Give Ghostty a moment to update the tab title
    execSync('sleep 0.15');

    // Find and click the tab with our marker title
    const script = `
tell application "Ghostty" to activate
tell application "System Events"
  tell process "Ghostty"
    set frontWin to first window
    set tabGroup to first UI element of frontWin whose role is "AXTabGroup"
    set tabButtons to radio buttons of tabGroup
    repeat with i from 1 to count of tabButtons
      if title of item i of tabButtons contains "${marker}" then
        click item i of tabButtons
        return "found"
      end if
    end repeat
    return "not_found"
  end tell
end tell
`;

    const result = runOsascriptMultiline(script);

    // Clear the marker — let the shell/process reset the title naturally
    // Write an empty title to reset
    try {
      const fd2 = fs.openSync(ttyDevice, 'w');
      fs.writeSync(fd2, `\x1b]0;${folderName}\x07`);
      fs.closeSync(fd2);
    } catch {
      // Best effort — title will reset on next shell prompt anyway
    }

    return result === 'found';
  } catch {
    return activateApp('Ghostty');
  }
}

function focusITerm2(folderName: string): boolean {
  const script = `
tell application "iTerm2"
  activate
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if name of s contains "${folderName}" then
          select t
          return "found"
        end if
      end repeat
    end repeat
  end repeat
end tell
`;
  return runOsascriptMultiline(script) === 'found';
}

function focusTerminalApp(folderName: string): boolean {
  const script = `
tell application "Terminal"
  activate
  repeat with w in windows
    if name of w contains "${folderName}" then
      set index of w to 1
      return "found"
    end if
  end repeat
end tell
`;
  return runOsascriptMultiline(script) === 'found';
}

function focusVSCode(projectPath: string, appName: string): boolean {
  try {
    const cli = appName === 'Cursor' ? 'cursor' : 'code';
    execSync(`${cli} --goto "${projectPath}"`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}
