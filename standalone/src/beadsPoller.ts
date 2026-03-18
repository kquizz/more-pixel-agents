import { execSync } from 'child_process';

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

export function pollBeads(
  projectPath: string,
): Array<{ taskId: string; subject: string; status: string }> {
  try {
    const output = execSync('bd list --json', {
      cwd: projectPath,
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
