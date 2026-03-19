import { execSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import * as path from 'path';

interface BeadsIssue {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority?: number;
  issue_type?: string;
  assignee?: string;
  close_reason?: string;
  created_at?: string;
  closed_at?: string;
  dependency_count?: number;
  dependent_count?: number;
}

export interface BeadsPollResult {
  taskId: string;
  subject: string;
  status: string;
  description?: string;
  priority?: number;
  issueType?: string;
  assignee?: string;
  closeReason?: string;
  createdAt?: string;
  closedAt?: string;
  dependencyCount?: number;
  dependentCount?: number;
}

function mapBeadsStatus(status: string): string {
  switch (status) {
    case 'closed':
      return 'completed';
    case 'in_progress':
      return 'in_progress';
    case 'open':
    case 'blocked':
    case 'deferred':
    default:
      return 'pending';
  }
}

/**
 * Scan child directories (up to 2 levels deep) for .beads/ directories.
 */
function findChildBeadsRoots(startPath: string, maxDepth: number): string[] {
  const results: string[] = [];
  if (maxDepth <= 0) return results;
  try {
    const entries = readdirSync(startPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      const childPath = path.join(startPath, entry.name);
      if (existsSync(path.join(childPath, '.beads'))) {
        results.push(childPath);
      }
      // Recurse one more level
      if (maxDepth > 1) {
        results.push(...findChildBeadsRoots(childPath, maxDepth - 1));
      }
    }
  } catch {
    // Permission denied or other fs error — skip
  }
  return results;
}

/**
 * Find ALL .beads/ directories: walk up the tree AND scan children (2 levels deep).
 * Returns directories containing .beads/ (startPath first, then children, then parents).
 */
export function findAllBeadsRoots(startPath: string): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();

  // Check startPath itself
  if (existsSync(path.join(startPath, '.beads'))) {
    roots.push(startPath);
    seen.add(startPath);
  }

  // Scan children (2 levels deep) for additional .beads instances
  for (const childRoot of findChildBeadsRoots(startPath, 2)) {
    if (!seen.has(childRoot)) {
      roots.push(childRoot);
      seen.add(childRoot);
    }
  }

  // Walk up at most 5 levels for parent .beads instances
  let current = path.dirname(startPath);
  for (let i = 0; i < 5; i++) {
    if (current === startPath) break; // already checked
    if (existsSync(path.join(current, '.beads'))) {
      if (!seen.has(current)) {
        roots.push(current);
        seen.add(current);
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break; // hit filesystem root
    current = parent;
  }

  return roots;
}

/** @deprecated Use findAllBeadsRoots instead */
export function findBeadsRoot(startPath: string): string | null {
  const roots = findAllBeadsRoots(startPath);
  return roots.length > 0 ? roots[0] : null;
}

/**
 * Poll all beads roots and merge results. Closer (more specific) roots win on dedup.
 */
export function pollAllBeads(beadsRoots: string[]): BeadsPollResult[] {
  const seen = new Set<string>();
  const results: BeadsPollResult[] = [];
  for (const root of beadsRoots) {
    const issues = pollBeads(root);
    for (const issue of issues) {
      if (!seen.has(issue.taskId)) {
        seen.add(issue.taskId);
        results.push(issue);
      }
    }
  }
  return results;
}

export function pollBeads(beadsRoot: string): BeadsPollResult[] {
  try {
    const output = execSync('bd list --json --all 2>/dev/null', {
      cwd: beadsRoot,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'ignore'], // suppress stderr
    });
    const issues: BeadsIssue[] = JSON.parse(output);
    return issues.map((issue) => ({
      taskId: issue.id,
      subject: issue.title,
      status: mapBeadsStatus(issue.status),
      description: issue.description || undefined,
      priority: issue.priority,
      issueType: issue.issue_type || undefined,
      assignee: issue.assignee || undefined,
      closeReason: issue.close_reason || undefined,
      createdAt: issue.created_at || undefined,
      closedAt: issue.closed_at || undefined,
      dependencyCount: issue.dependency_count,
      dependentCount: issue.dependent_count,
    }));
  } catch {
    return [];
  }
}
