// File activity event from Claude Code hooks
export interface FileActivityEvent {
  type: 'read-start' | 'read-end' | 'write-start' | 'write-end' | 'search-start' | 'search-end';
  filePath: string;  // For search: this is the search pattern (glob or regex)
  agentId?: string;  // Which agent triggered this activity
  projectId?: string;     // Building identity (git root or cwd)
  projectRoot?: string;   // Absolute root path for relativization
  projectName?: string;   // basename of projectRoot, shown as building sign
  timestamp: number;
}

export interface ThinkingEvent {
  type: 'thinking-start' | 'thinking-end';
  agentId: string;
  projectId?: string;     // Building identity (git root or cwd)
  projectRoot?: string;   // Absolute root path for relativization
  projectName?: string;   // basename of projectRoot, shown as building sign
  timestamp: number;
}

/** Agent status from stop events */
export type AgentStatus = 'completed' | 'aborted' | 'error';

/** One selectable option of an AskUserQuestion question. */
export interface AgentQuestionOption {
  label: string;
  description?: string;
}

/** One question within an AskUserQuestion call. */
export interface AgentQuestionItem {
  question: string;       // The question text
  header?: string;        // Short category label
  multiSelect?: boolean;  // Whether several options may be chosen
  options: AgentQuestionOption[];
}

/** The full set of questions an agent is asking the user (from AskUserQuestion). */
export interface AgentQuestion {
  questions: AgentQuestionItem[];
}

/** A pending interaction a blocking hook is waiting on, tracked per agent. */
export interface PendingRequest {
  requestId: string;
  kind: 'question' | 'permission';
  toolName?: string;   // permission only
  toolInput?: string;  // permission only
}

/** A chat line for a hotel-spawned agent (user turn or assistant/system reply). */
export interface ChatMessage {
  agentId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface AgentThinkingState {
  agentId: string;
  projectId?: string;  // Which building/project this agent belongs to
  isThinking: boolean;
  lastActivity: number;
  displayName: string;
  currentCommand?: string;  // Current tool/command being executed
  toolInput?: string;  // Abbreviated tool input (file path, command, pattern)
  currentFile?: string;  // Project-relative path of the agent's current file (read/write).
                         // Authoritative source for the agent's floor, movement target,
                         // and bubble file line. Sticky across non-file commands.
  waitingForInput?: boolean;  // True when agent is waiting for user input
  question?: AgentQuestion;  // Real question the agent is asking (from AskUserQuestion)
  spawned?: boolean;  // Launched from the hotel (chattable via the panel)
  agentType?: string;  // Agent type (Plan, Explore, Bash, etc.)
  model?: string;  // Model name (e.g., "claude-3.5-sonnet")
  lastDuration?: number;  // Last operation duration in ms
  status?: AgentStatus;  // Completion status (completed/aborted/error)
  statusTimestamp?: number;  // When status was set
}

/** A project the server is currently tracking (one building in the town) */
export interface ProjectInfo {
  projectId: string;
  projectName: string;
  projectRoot: string;
  lastActivity: number;
  agentCount: number;
}

export interface GraphNode {
  id: string;
  name: string;
  isFolder: boolean;
  depth: number;
  lastActivity?: {
    type: 'read' | 'write' | 'search';
    timestamp: number;
  };
  activeOperation?: 'read' | 'write' | 'search';
  activityCount: {
    reads: number;
    writes: number;
    searches: number;
  };
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface ForceGraphNode extends GraphNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface ForceGraphLink {
  source: string | ForceGraphNode;
  target: string | ForceGraphNode;
}

// Hot folders from git activity API
export interface FolderScore {
  folder: string;
  score: number;
  recentFiles: string[];
}
