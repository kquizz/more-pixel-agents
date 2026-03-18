import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Config {
  port: number;
  folderCharacters: Record<string, number>; // folder path or glob -> character ID (0-5)
  staleTimeout: number; // minutes
}

const CONFIG_DIR = path.join(os.homedir(), '.config', 'more-pixel-agents');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: Config = {
  port: 3100,
  folderCharacters: {},
  staleTimeout: 30,
};

let cachedConfig: Config = { ...DEFAULT_CONFIG };

export function loadConfig(): Config {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      // Create default config file
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
      cachedConfig = { ...DEFAULT_CONFIG };
      return cachedConfig;
    }
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    cachedConfig = {
      port: typeof parsed.port === 'number' ? parsed.port : DEFAULT_CONFIG.port,
      folderCharacters:
        parsed.folderCharacters && typeof parsed.folderCharacters === 'object'
          ? parsed.folderCharacters
          : DEFAULT_CONFIG.folderCharacters,
      staleTimeout:
        typeof parsed.staleTimeout === 'number' ? parsed.staleTimeout : DEFAULT_CONFIG.staleTimeout,
    };
    return cachedConfig;
  } catch {
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }
}

export function getConfig(): Config {
  return cachedConfig;
}

export function watchConfig(onChange: (config: Config) => void): void {
  try {
    fs.watch(CONFIG_FILE, () => {
      try {
        const newConfig = loadConfig();
        onChange(newConfig);
      } catch {
        // Ignore read errors during watch
      }
    });
  } catch {
    // fs.watch can fail on some systems
  }
}

/**
 * Look up project path in folderCharacters config.
 * Exact match first, then glob matching (trailing /* means prefix match).
 * Returns character ID (0-5) or -1 for auto-assign.
 */
export function resolveCharacterId(projectPath: string): number {
  const folderChars = cachedConfig.folderCharacters;

  // Exact match first
  if (projectPath in folderChars) {
    const id = folderChars[projectPath];
    if (typeof id === 'number' && id >= 0 && id <= 5) return id;
  }

  // Glob matching: trailing /* means prefix match
  for (const [pattern, id] of Object.entries(folderChars)) {
    if (typeof id !== 'number' || id < 0 || id > 5) continue;
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      if (projectPath.startsWith(prefix + '/') || projectPath === prefix) {
        return id;
      }
    }
  }

  return -1;
}
