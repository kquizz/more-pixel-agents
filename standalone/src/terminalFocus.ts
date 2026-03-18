import { execSync } from 'child_process';
import * as path from 'path';

/**
 * Focus the terminal window/tab hosting a Claude Code session.
 * Returns true on success, false on failure.
 */
export function focusTerminal(
  terminalApp: string,
  claudePid: number,
  projectPath: string,
): boolean {
  try {
    const folderName = path.basename(projectPath);

    switch (terminalApp) {
      case 'Ghostty':
        return focusGhostty(folderName);
      case 'iTerm2':
        return focusITerm2(folderName);
      case 'Terminal':
        return focusTerminalApp(folderName);
      case 'VS Code':
      case 'Cursor':
        return focusVSCode(projectPath, terminalApp);
      default:
        // For unknown terminals, just try to activate by name
        return activateApp(terminalApp);
    }
  } catch {
    return false;
  }
}

function runOsascript(script: string): boolean {
  try {
    execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

function runOsascriptMultiline(script: string): boolean {
  try {
    execSync('osascript -', {
      input: script,
      encoding: 'utf-8',
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

function activateApp(appName: string): boolean {
  return runOsascript(`tell application "${appName}" to activate`);
}

function focusGhostty(folderName: string): boolean {
  const script = `
tell application "Ghostty" to activate
tell application "System Events"
  tell process "Ghostty"
    set allWindows to every window
    repeat with w in allWindows
      if name of w contains "${folderName}" then
        perform action "AXRaise" of w
        return
      end if
    end repeat
  end tell
end tell
`;
  return runOsascriptMultiline(script);
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
          return
        end if
      end repeat
    end repeat
  end repeat
end tell
`;
  return runOsascriptMultiline(script);
}

function focusTerminalApp(folderName: string): boolean {
  const script = `
tell application "Terminal"
  activate
  repeat with w in windows
    if name of w contains "${folderName}" then
      set index of w to 1
      return
    end if
  end repeat
end tell
`;
  return runOsascriptMultiline(script);
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
