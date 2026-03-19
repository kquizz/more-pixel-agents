export interface AgentState {
  id: number;
  projectDir: string;
  projectName: string;
  jsonlFile: string;
  fileOffset: number;
  lineBuffer: string;
  activeToolIds: Set<string>;
  activeToolStatuses: Map<string, string>;
  activeToolNames: Map<string, string>;
  activeSubagentToolIds: Map<string, Set<string>>;
  activeSubagentToolNames: Map<string, Map<string, string>>;
  isWaiting: boolean;
  permissionSent: boolean;
  hadToolsInTurn: boolean;
  folderName?: string;
  terminalApp?: string;
  claudePid?: number;
  shellPid?: number | null;
  projectPath?: string;
  tty?: string | null;
  characterId?: number; // 0-5 from config, or undefined for auto-assigned
  hasBeads?: boolean;
  beadsRoots?: string[]; // directories containing .beads/ (closest first, walking up from projectPath)
}

export interface TodoItem {
  taskId: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed';
  agentId: number;
  projectName: string;
  updatedAt: number;
}

export interface PersistedAgent {
  id: number;
  jsonlFile: string;
  projectDir: string;
  projectName: string;
  folderName?: string;
}
