/**
 * Shared TypeScript Types
 *
 * These types are used across the server for:
 * - Activity events from hooks (file read/write)
 * - Thinking events from hooks (agent state)
 * - Graph data for visualization (file tree)
 *
 * The client has its own copy of these types.
 */

/** Agent source - which tool the agent is from */
export type AgentSource = 'claude' | 'cursor' | 'unknown';

/**
 * File activity event from file-activity-hook.sh
 * Tracks when an agent reads or writes a file
 */
export interface FileActivityEvent {
  type: 'read-start' | 'read-end' | 'write-start' | 'write-end' | 'search-start' | 'search-end';
  filePath: string;  // For search: this is the search pattern (glob or regex)
  agentId?: string;  // Which agent triggered this activity
  source?: AgentSource;  // Which tool (claude/cursor)
  projectId?: string;     // Building identity (git root or cwd)
  projectRoot?: string;   // Absolute root path for relativization
  projectName?: string;   // basename of projectRoot, shown as building sign
  timestamp: number;
}

/** Agent status from stop events */
export type AgentStatus = 'completed' | 'aborted' | 'error';

/**
 * A question an agent is asking the user (from the AskUserQuestion tool).
 * Captured by the hook from tool_input.questions[0] so the hotel can show the
 * real question instead of a generic "stuck" bubble.
 */
export interface AgentQuestion {
  question: string;     // The question text
  options?: string[];   // Option labels the user can choose from
}

export interface ThinkingEvent {
  type: 'thinking-start' | 'thinking-end' | 'agent-stop';
  agentId: string;
  source?: AgentSource;  // Which tool (claude/cursor)
  projectId?: string;     // Building identity (git root or cwd)
  projectRoot?: string;   // Absolute root path for relativization
  projectName?: string;   // basename of projectRoot, shown as building sign
  timestamp: number;
  toolName?: string;  // Current tool being used (e.g., "Read", "Edit", "Bash")
  toolInput?: string;  // Abbreviated tool input (file path, command, pattern)
  question?: AgentQuestion;  // Full question text + options (from AskUserQuestion tool_input)
  agentType?: string;  // Agent type from SessionStart (e.g., "Plan", "Explore", "Bash")
  model?: string;  // Model name (e.g., "claude-3.5-sonnet") - Cursor provides this
  duration?: number;  // Operation duration in ms - from afterShellExecution/afterMCPExecution
  status?: AgentStatus;  // Agent completion status - from stop hook
  loopCount?: number;  // Number of agent loops - from stop hook
}

export interface AgentThinkingState {
  agentId: string;
  source: AgentSource;  // Which tool this agent is from
  projectId?: string;  // Which building/project this agent belongs to
  isThinking: boolean;
  lastActivity: number;
  displayName: string;
  currentCommand?: string;  // Current tool/command being executed
  toolInput?: string;  // Abbreviated tool input (file path, command, pattern)
  currentFile?: string;  // Project-relative path of the agent's current file (read/write).
                         // Single source of truth for the agent's location: the client
                         // derives its floor, movement target, and bubble file line from it.
                         // Sticky across non-file commands (e.g. Bash) so the agent stays put.
  waitingForInput?: boolean;  // True when agent is waiting for user input
  question?: AgentQuestion;  // Real question the agent is asking (from AskUserQuestion)
  pendingToolStart?: number;  // Timestamp when tool started (for detecting stuck permission prompts)
  agentType?: string;  // Agent type (e.g., "Plan", "Explore", "Bash") - shown in display name
  model?: string;  // Model name (e.g., "claude-3.5-sonnet") - shown below agent name
  lastDuration?: number;  // Last operation duration in ms
  status?: AgentStatus;  // Completion status (completed/aborted/error)
  statusTimestamp?: number;  // When status was set (for auto-clearing)
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
  activeOperation?: 'read' | 'write' | 'search';  // Currently active operation
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

/** Layout update data - sent when git commit triggers a layout refresh */
export interface LayoutUpdateData {
  hotFolders: Array<{
    folder: string;
    score: number;
    recentFiles: string[];
  }>;
  timestamp: number;
}
