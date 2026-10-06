// App state — mirror of AppState.swift (the parts the island needs).

import type { BotEmoteName, BotStateName, IslandMode, IslandViewName } from "./layout";
import type { EyeShape } from "../mochi/engine";

export type AgentSource = "claudeCode" | "n8n" | "agent";
export type PillBadge = "approval" | "finished" | "error";

export interface AgentTask {
  id: string;
  name: string;
  color: string;
  state: BotStateName;
  stepIndex: number;
  steps: string[];
  source: AgentSource;
  isIntegration: boolean;
  emote?: BotEmoteName | null;
  miniEye?: EyeShape | null;
  pillBadge?: PillBadge | null;
  sessionCwd?: string | null;
}

export interface ApprovalInfo {
  requestId: string;
  sessionId: string;
  tool: string;
  command: string;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
}

export interface LiveCodeDiff {
  fileName: string;
  filePath: string;
  fileExt?: string;
  startLine: number;
  deleted: string[];
  added: string[];
  contextBefore?: string[];
  contextAfter?: string[];
  timestamp: number;
}

export type PromptContext =
  | { kind: "window"; appName: string; title: string; url?: string }
  | { kind: "file"; name: string; path?: string };

export interface ResultItem {
  label: string;
  detail: string;
  url?: string;
}

export interface SearchResult {
  title: string;
  items: ResultItem[];
  note?: string;
}

export type PillCategory = "workspace" | "agent" | "ai" | "service";

export interface PillDefinition {
  id: string;
  name: string;
  color: string;
  category: PillCategory;
  subtitle: string;
  source: AgentSource;
}

export const PILL_CATALOG: PillDefinition[] = [
  // ── Where you code ────────────────────────────────────────────────────────
  { id: "integration_claude", name: "VS Code", color: "#F5F6F8", category: "workspace", subtitle: "Integration", source: "claudeCode" },
  { id: "agent_cursor", name: "Cursor", color: "#C0C4CC", category: "workspace", subtitle: "Integration", source: "agent" },
  { id: "agent_antigravity", name: "Antigravity", color: "#E879F9", category: "workspace", subtitle: "Integration", source: "agent" },
  { id: "agent_codex", name: "Codex", color: "#2DD4BF", category: "workspace", subtitle: "Integration", source: "agent" },
  // ── Agents ────────────────────────────────────────────────────────────────
  { id: "agent_gemini", name: "Gemini CLI", color: "#8AB4F8", category: "agent", subtitle: "Agent", source: "agent" },
  { id: "agent_copilot", name: "Copilot CLI", color: "#818CF8", category: "agent", subtitle: "Agent", source: "agent" },
  { id: "agent_muse", name: "Muse Code", color: "#38BDF8", category: "agent", subtitle: "Agent", source: "agent" },
  { id: "agent_opencode", name: "OpenCode", color: "#4ADE80", category: "agent", subtitle: "Agent", source: "agent" },
  { id: "agent_amp", name: "Amp", color: "#F59E0B", category: "agent", subtitle: "Agent", source: "agent" },
  // ── AI for the chat ───────────────────────────────────────────────────────
  { id: "ai_anthropic", name: "Anthropic", color: "#E07950", category: "ai", subtitle: "Chat", source: "n8n" },
  { id: "ai_google", name: "Google AI", color: "#4285F4", category: "ai", subtitle: "Chat", source: "n8n" },
  { id: "ai_openai", name: "OpenAI", color: "#10A37F", category: "ai", subtitle: "Chat", source: "n8n" },
  { id: "ai_ollama", name: "Ollama", color: "#FACC15", category: "ai", subtitle: "Chat", source: "n8n" },
  { id: "ai_lmstudio", name: "LM Studio", color: "#A3E635", category: "ai", subtitle: "Chat", source: "n8n" },
  // ── Services ──────────────────────────────────────────────────────────────
  { id: "integration_resend", name: "Resend", color: "#22C55E", category: "service", subtitle: "Integration", source: "n8n" },
  { id: "integration_n8n", name: "n8n", color: "#F29B38", category: "service", subtitle: "Integration", source: "n8n" },
  { id: "integration_vercel", name: "Vercel", color: "#7C5CFF", category: "service", subtitle: "Integration", source: "n8n" },
  { id: "integration_github", name: "GitHub", color: "#F4505E", category: "service", subtitle: "Integration", source: "n8n" },
  { id: "integration_notion", name: "Notion", color: "#8C8C8C", category: "service", subtitle: "Integration", source: "n8n" },
  { id: "integration_calcom", name: "Cal.com", color: "#C9956A", category: "service", subtitle: "Integration", source: "n8n" },
  { id: "integration_stripe", name: "Stripe", color: "#0570DE", category: "service", subtitle: "Integration", source: "n8n" },
  { id: "integration_spotify", name: "Spotify", color: "#1DB954", category: "service", subtitle: "Music", source: "n8n" },
  { id: "integration_kicad", name: "KiCad", color: "#2F65B8", category: "service", subtitle: "EDA", source: "n8n" },
];

export const WORKSPACE_PILL_IDS = [
  "integration_claude", "agent_cursor", "agent_antigravity", "agent_codex",
];

export const INTEGRATION_AGENTS: AgentTask[] = PILL_CATALOG.map((p) => ({
  id: p.id,
  name: p.name,
  color: p.color,
  state: "idle",
  stepIndex: 0,
  steps: [],
  source: p.source,
  isIntegration: p.category === "service" || p.category === "ai",
}));

export const TOGGLEABLE_INTEGRATION_IDS = PILL_CATALOG
  .filter((p) => !WORKSPACE_PILL_IDS.includes(p.id))
  .map((p) => p.id);

/** What an integration poller last reported. */
export interface IntegrationInfo {
  data: Record<string, unknown>;
  error: string | null;
  loaded: boolean;
  configured: boolean;
}

export interface Settings {
  soundEnabled: boolean;
  soundVolume: number;
  autoCloseInterval: number;
  absenceInterval: number;
  activeIntegrations: string[];
  screen: "primary" | "cursor";
  autostart: boolean;
  hooksInstalled: boolean;
  mainPillId: string;
  chatProvider: string;
  model: string;
  googleModel: string;
  openaiModel: string;
  ollamaUrl: string;
  lmstudioUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  soundEnabled: true,
  soundVolume: 0.12,
  autoCloseInterval: 15,
  absenceInterval: 180,
  activeIntegrations: [
    "integration_resend", "integration_n8n", "integration_vercel", "integration_github",
  ],
  screen: "primary",
  autostart: false,
  hooksInstalled: false,
  mainPillId: "integration_claude",
  chatProvider: "anthropic",
  model: "claude-opus-5",
  googleModel: "gemini-2.0-flash",
  openaiModel: "gpt-4o",
  ollamaUrl: "http://localhost:11434",
  lmstudioUrl: "http://localhost:1234",
};

type Listener = () => void;

class AppState {
  mode: IslandMode = "hidden";
  view: IslandViewName = "overview";

  tasks: AgentTask[] = [];
  focusId: string | null = null;

  stateOverride: BotStateName | null = null;

  /** Cursor in logical screen pixels, origin top-left (like AppState.mousePosition). */
  mouse = { x: 0, y: 0 };
  /** Cursor relative to the island's top-left corner. */
  mouseInIsland = { x: 0, y: 0 };

  isPinned = false;
  paused = false;

  uploadProgress = 0;
  uploadDuration = 2.4;
  fileDragOver = false;

  promptContext: PromptContext | null = null;
  droppedFile: { name: string; path: string } | null = null;
  noteMessage: string | null = null;
  searchResult: SearchResult | null = null;
  chatHistory: ChatMessage[] = [];
  pendingApproval: ApprovalInfo | null = null;
  activeDiff: LiveCodeDiff | null = null;

  integrations: Record<string, IntegrationInfo> = {};

  lastActivity = performance.now();

  settings: Settings = { ...DEFAULT_SETTINGS };

  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Marks the UI dirty; the island re-renders on the next frame. */
  notify() {
    for (const fn of this.listeners) fn();
  }

  get focusTask(): AgentTask | null {
    return this.tasks.find((t) => t.id === this.focusId) ?? this.tasks[0] ?? null;
  }

  get effectiveState(): BotStateName {
    return this.stateOverride ?? this.focusTask?.state ?? "idle";
  }

  get otherTasks(): AgentTask[] {
    return this.tasks.filter((t) => t.id !== this.focusId);
  }

  setFocus(id: string) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    this.focusId = id;
    t.pillBadge = null;
    this.notify();
  }

  updateTask(id: string, state: BotStateName) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    t.state = state;
    this.notify();
  }

  appendStep(id: string, step: string) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    t.steps.push(step);
    if (t.steps.length > 20) t.steps.shift();
    t.stepIndex = t.steps.length - 1;
    this.notify();
  }

  setPillBadge(id: string, badge: PillBadge | null) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    t.pillBadge = badge;
    this.notify();
  }

  /** loadIntegrationTasks() — Main workspace pill always on, plus active pills (max 4). */
  loadIntegrationTasks() {
    const mainId = this.settings.mainPillId || "integration_claude";
    for (const proto of INTEGRATION_AGENTS) {
      const shouldLoad =
        proto.id === mainId || this.settings.activeIntegrations.includes(proto.id);
      const idx = this.tasks.findIndex((t) => t.id === proto.id);
      if (shouldLoad && idx < 0) this.tasks.push({ ...proto, steps: [] });
      if (!shouldLoad && idx >= 0) this.tasks.splice(idx, 1);
    }
    // Order: main pill first, then agent_* pills (visible in slice(0,4)),
    // then other integrations in declaration order.
    const order = INTEGRATION_AGENTS.map((t) => t.id);
    this.tasks.sort((a, b) => {
      if (a.id === mainId) return -1;
      if (b.id === mainId) return 1;
      const isAgentA = a.id.startsWith("agent_");
      const isAgentB = b.id.startsWith("agent_");
      if (isAgentA && !isAgentB) return -1;
      if (isAgentB && !isAgentA) return 1;
      if (isAgentA && isAgentB) return 0;
      return order.indexOf(a.id) - order.indexOf(b.id);
    });
    if (!this.focusId || !this.tasks.some((t) => t.id === this.focusId)) {
      this.focusId = mainId;
    }
    this.notify();
  }

  removeTask(id: string) {
    const mainId = this.settings.mainPillId || "integration_claude";
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return;
    this.tasks.splice(idx, 1);
    if (this.focusId === id) this.focusId = this.tasks[0]?.id ?? mainId;
    this.notify();
  }

  /** Creates a dynamic agent_ pill on first event; no-ops if it already exists.
   *  Inserted right after the main pill so it appears in the visible slice(0,4). */
  upsertExternalAgent(id: string, name: string, color: string) {
    if (this.tasks.some((t) => t.id === id)) return;
    const mainId = this.settings.mainPillId || "integration_claude";
    const at = Math.max(0, this.tasks.findIndex((t) => t.id === mainId) + 1);
    this.tasks.splice(at, 0, {
      id, name, color,
      state: "idle", stepIndex: 0, steps: [],
      source: "agent", isIntegration: false,
    });
    if (!this.focusId) this.focusId = id;
    this.notify();
  }

  toggleIntegration(id: string) {
    const mainId = this.settings.mainPillId || "integration_claude";
    if (id === mainId || WORKSPACE_PILL_IDS.includes(id)) return;
    const active = this.settings.activeIntegrations;
    if (active.includes(id)) {
      this.settings.activeIntegrations = active.filter((x) => x !== id);
      if (this.focusId === id) this.focusId = mainId;
    } else {
      if (active.length >= 4) return;
      this.settings.activeIntegrations = [...active, id];
    }
    this.loadIntegrationTasks();
  }

  defaultView(): IslandViewName {
    return this.tasks.length === 0 ? "empty" : "overview";
  }
}

export const State = new AppState();
