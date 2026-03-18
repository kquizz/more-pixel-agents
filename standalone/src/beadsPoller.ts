import { execSync } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';

interface BeadsIssue {
  id: string;
  title: string;
  status: string;
  priority?: number;
  issue_type?: string;
}

function mapBeadsStatus(status: string): string {
  switch (status) {
    case 'closed':
      return 'completed';
    case 'open':
    case 'in_progress':
    case 'blocked':
      return 'in_progress';
    case 'deferred':
      return 'pending';
    default:
      return 'pending';
  }
}

/**
 * Walk up the directory tree to find the nearest .beads/ directory.
 * Returns the directory containing .beads/, or null if not found.
 */
export function findBeadsRoot(startPath: string): string | null {
  let current = startPath;
  // Walk up at most 5 levels
  for (let i = 0; i < 5; i++) {
    if (existsSync(path.join(current, '.beads'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break; // hit filesystem root
    current = parent;
  }
  return null;
}

export function pollBeads(
  beadsRoot: string,
): Array<{ taskId: string; subject: string; status: string }> {
  try {
    const output = execSync('bd list --json', {
      cwd: beadsRoot,
      encoding: 'utf-8',
      timeout: 5000,
    });
    const issues: BeadsIssue[] = JSON.parse(output);
    return issues.map((issue) => ({
      taskId: issue.id,
      subject: issue.title,
      status: mapBeadsStatus(issue.status),
    }));
  } catch {
    return []; // bd not installed, no issues, or error
  }
}
