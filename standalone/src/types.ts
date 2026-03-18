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
  characterId?: number; // 0-5 from config, or undefined for auto-assigned
}

export interface PersistedAgent {
  id: number;
  jsonlFile: string;
  projectDir: string;
  projectName: string;
  folderName?: string;
}
