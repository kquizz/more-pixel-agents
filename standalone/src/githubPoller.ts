import { execSync } from 'child_process';

export interface PrStatus {
  number: number;
  title: string;
  branch: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  ciStatus: 'pending' | 'pass' | 'fail' | 'none';
  reviewStatus: 'pending' | 'approved' | 'changes_requested' | 'none';
  mergeable: boolean;
}

export function pollGitHubPRs(cwd: string): PrStatus[] {
  try {
    const output = execSync(
      'gh pr list --state open --limit 20 --json number,title,headRefName,state,statusCheckRollup,reviewDecision,mergeable',
      { cwd, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'ignore'] },
    );
    const prs = JSON.parse(output) as Array<Record<string, unknown>>;
    const result = prs.map((pr) => ({
      number: pr.number as number,
      title: pr.title as string,
      branch: pr.headRefName as string,
      state: pr.state as 'OPEN' | 'CLOSED' | 'MERGED',
      ciStatus: mapCiStatus(pr.statusCheckRollup),
      reviewStatus: mapReviewStatus(pr.reviewDecision as string | null),
      mergeable: pr.mergeable !== 'CONFLICTING',
    }));
    console.log(
      `[GitHub] Polled ${cwd}: ${result.length} PRs (${result.filter((p) => p.state === 'OPEN').length} open)`,
    );
    return result;
  } catch (err) {
    console.log(
      `[GitHub] Poll failed for ${cwd}: ${err instanceof Error ? err.message : 'unknown'}`,
    );
    return [];
  }
}

function mapCiStatus(rollup: unknown): PrStatus['ciStatus'] {
  if (!Array.isArray(rollup) || rollup.length === 0) return 'none';
  const hasFailure = rollup.some(
    (c: Record<string, unknown>) => c.conclusion === 'FAILURE' || c.conclusion === 'ERROR',
  );
  if (hasFailure) return 'fail';
  const hasPending = rollup.some(
    (c: Record<string, unknown>) =>
      c.status === 'IN_PROGRESS' || c.status === 'QUEUED' || c.status === 'PENDING',
  );
  if (hasPending) return 'pending';
  return 'pass';
}

function mapReviewStatus(decision: string | null): PrStatus['reviewStatus'] {
  if (!decision) return 'none';
  if (decision === 'APPROVED') return 'approved';
  if (decision === 'CHANGES_REQUESTED') return 'changes_requested';
  return 'pending';
}

export function getCurrentBranch(cwd: string): string | null {
  try {
    return execSync('git branch --show-current', {
      cwd,
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
