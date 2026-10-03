// Hook events → island state.
// Supports Antigravity, Claude Code, Gemini CLI, Codex, and custom agents.

import { Bridge, onEvent } from "../core/bridge";
import { Sound } from "../core/sound";
import { State, WORKSPACE_PILL_IDS } from "../core/state";
import type { Island } from "./island";

/** Clears the approval card if no decision was made before the hook gave up. */
let pendingTimeout: number | null = null;
let stopResetTimeout: number | null = null;

interface HookPayload {
  hook_event_name?: string;
  request_id?: string;
  session_id?: string;
  cwd?: string;
  message?: string;
  /** UserPromptSubmit carries `prompt`; `message` belongs to Notification/Stop. */
  prompt?: string;
  last_assistant_message?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_result?: unknown;
  /** Optional agent tag: lowercase, digits and hyphens, ≤ 24 chars. */
  coucou_agent?: string;
}

/** Same rule as HookServer.validateAgent on macOS. */
function validateAgent(raw: string | undefined): string | null {
  if (!raw || raw.length > 24) return null;
  if (!/^[a-z0-9-]+$/.test(raw)) return null;
  return raw;
}

const FALLBACK_COLORS = ["#22C55E", "#EAB308", "#60A5FA", "#E879F9"];

function agentColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
  }
  return FALLBACK_COLORS[Math.abs(h) % FALLBACK_COLORS.length];
}

const PROJECT_ALIASES: Record<string, string> = {
  "notch-buddy": "Notch Buddy",
  notchbuddy: "Notch Buddy",
  notch_buddy: "Notch Buddy",
};

function aliasProjectName(name: string): string {
  return PROJECT_ALIASES[name.toLowerCase()] ?? name;
}

function lastPathComponent(p: string): string {
  const cleaned = p.replace(/[\\/]+$/, "");
  const idx = Math.max(cleaned.lastIndexOf("\\"), cleaned.lastIndexOf("/"));
  return idx >= 0 ? cleaned.slice(idx + 1) : cleaned;
}

/** frenchStep() — same labels as the macOS app. */
const TOOL_LABELS: Record<string, string> = {
  Bash: "Exécute",
  Read: "Lit",
  Write: "Écrit",
  Edit: "Modifie",
  Glob: "Cherche",
  Grep: "Recherche",
  WebSearch: "Recherche web",
  WebFetch: "Récupère",
  TodoWrite: "Tâches",
  Task: "Agent",
  LS: "Liste",
  MultiEdit: "Modifie",
  NotebookEdit: "Notebook",
  PowerShell: "Exécute",
  run_command: "Exécute",
  view_file: "Lit",
  write_to_file: "Écrit",
  replace_file_content: "Modifie",
  multi_replace_file_content: "Modifie",
  grep_search: "Recherche",
  search_web: "Recherche web",
  browser_subagent: "Navigateur",
};

function stepLabel(tool: string, input: Record<string, unknown>): string {
  const label = TOOL_LABELS[tool] ?? tool;
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : null);
  const cmd = str("command") || str("CommandLine");
  if (cmd) return `${label} · ${cmd.slice(0, 40)}`;
  const path = str("path");
  if (path) return `${label} · ${lastPathComponent(path)}`;
  const file = str("file_path") || str("TargetFile") || str("AbsolutePath");
  if (file) return `${label} · ${lastPathComponent(file)}`;
  const query = str("query") || str("Query");
  if (query) return `${label} · ${query.slice(0, 40)}`;
  return label;
}

const APPROVAL_FIELDS = [
  "command",
  "CommandLine",
  "file_path",
  "TargetFile",
  "AbsolutePath",
  "path",
  "url",
  "Url",
  "query",
  "Query",
  "pattern",
  "prompt",
  "Prompt",
] as const;

function approvalTarget(tool: string, input: Record<string, unknown>): string {
  for (const field of APPROVAL_FIELDS) {
    const value = input[field];
    if (typeof value === "string" && value.trim()) {
      return `${tool} · ${value.trim()}`;
    }
  }
  return tool;
}

function upsert(projectName: string, cwd: string, targetId: string) {
  const t = State.tasks.find((x) => x.id === targetId);
  if (!t) return;
  if (projectName && projectName !== "Session") t.name = projectName;
  if (cwd) t.sessionCwd = cwd;
}

function clearSession(targetId: string) {
  const t = State.tasks.find((x) => x.id === targetId);
  if (!t) return;
  t.pillBadge = null;
}

export function registerHookHandlers(island: Island) {
  void onEvent<HookPayload>("hook", (payload) => handleHook(island, payload));
}

function handleHook(island: Island, payload: HookPayload) {
  if (State.paused) {
    if (payload.request_id) void Bridge.approvalDecline(payload.request_id);
    return;
  }

  const name = payload.hook_event_name ?? "";
  const cwd = payload.cwd ?? "";
  const raw = lastPathComponent(cwd);
  const projectName = aliasProjectName(raw || "Session");

  const validAgent = validateAgent(payload.coucou_agent);
  const mainId = State.settings.mainPillId || "agent_antigravity";
  let agentId = mainId;
  if (validAgent) {
    if (validAgent === "antigravity") {
      agentId = "agent_antigravity";
    } else if (validAgent === "claude") {
      agentId = "integration_claude";
    } else if (validAgent === "codex") {
      agentId = "agent_codex";
    } else if (validAgent === "cursor") {
      agentId = "agent_cursor";
    } else if (validAgent === "gemini") {
      agentId = "agent_gemini";
    } else {
      agentId = `agent_${validAgent}`;
    }
  }

  const isDynamicPill = agentId.startsWith("agent_") && !WORKSPACE_PILL_IDS.includes(agentId);

  /** Alerts force the island open; work events only reveal the compact island. */
  const surface = (view: Parameters<Island["alert"]>[0], isAlert: boolean) => {
    if (State.mode === "expanded") {
      if (isAlert) island.setView(view);
    } else if (isAlert) {
      island.alert(view);
    } else if (State.mode === "hidden") {
      island.reveal();
    }
  };

  /** Ensure the agent pill exists. */
  const ensurePill = () => {
    if (isDynamicPill && validAgent) {
      State.upsertExternalAgent(agentId, validAgent, agentColor(validAgent));
    } else {
      upsert(projectName, cwd, agentId);
    }
  };

  switch (name) {
    case "SessionStart":
      ensurePill();
      State.setFocus(agentId);
      surface("overview", false);
      Sound.play("work");
      break;

    case "UserPromptSubmit": {
      ensurePill();
      State.setFocus(agentId);
      State.updateTask(agentId, "thinking");
      const asked = payload.prompt ?? payload.message;
      if (asked) State.appendStep(agentId, asked.slice(0, 60));
      surface("overview", false);
      Sound.play("think");
      break;
    }

    case "PreToolUse": {
      ensurePill();
      State.setFocus(agentId);
      State.updateTask(agentId, "working");
      const tool = payload.tool_name ?? "Tool";
      State.appendStep(agentId, stepLabel(tool, payload.tool_input ?? {}));
      surface("overview", false);
      Sound.play("work");
      break;
    }

    case "PostToolUse":
      ensurePill();
      State.updateTask(agentId, "working");
      break;

    case "PostToolUseFailure":
      ensurePill();
      State.updateTask(agentId, "error");
      State.appendStep(agentId, "⚠ failed");
      Sound.play("error");
      break;

    case "Notification": {
      const msg = payload.message ?? "";
      if (msg.trim()) {
        ensurePill();
        State.noteMessage = msg;
        island.alert("note");
      }
      break;
    }

    case "Stop": {
      ensurePill();
      State.updateTask(agentId, "finished");
      const finalMsg = payload.last_assistant_message ?? payload.message;
      if (finalMsg) State.appendStep(agentId, finalMsg.slice(0, 60));
      island.dropPin();
      Sound.play("finish");

      if (stopResetTimeout != null) window.clearTimeout(stopResetTimeout);
      stopResetTimeout = window.setTimeout(() => {
        stopResetTimeout = null;
        State.updateTask(agentId, "idle");
        clearSession(agentId);
        State.notify();
      }, 5200);
      break;
    }

    case "SubagentStart":
      ensurePill();
      State.updateTask(agentId, "working");
      State.appendStep(agentId, `• subagent: ${(payload.message ?? "").slice(0, 40)}`);
      Sound.play("work");
      break;

    case "SubagentStop":
      ensurePill();
      State.updateTask(agentId, "working");
      State.appendStep(agentId, "• subagent done");
      break;

    case "PermissionRequest": {
      const requestId = payload.request_id ?? "";
      if (State.pendingApproval && State.pendingApproval.requestId !== requestId) {
        if (requestId) void Bridge.approvalDecline(requestId);
        break;
      }
      ensurePill();
      if (pendingTimeout != null) window.clearTimeout(pendingTimeout);
      const tool = payload.tool_name ?? "Tool";
      const input = payload.tool_input ?? {};
      State.pendingApproval = {
        requestId,
        sessionId: payload.session_id ?? "",
        tool,
        command: approvalTarget(tool, input),
      };
      if (requestId) void Bridge.approvalAck(requestId);
      State.setFocus(agentId);
      State.updateTask(agentId, "approval");
      State.isPinned = true;
      Sound.play("approval");
      island.alert("approval");

      pendingTimeout = window.setTimeout(() => {
        pendingTimeout = null;
        if (!State.pendingApproval) return;
        State.pendingApproval = null;
        State.isPinned = false;
        island.dropPin();
        State.updateTask(agentId, "working");
        State.setPillBadge(agentId, null);
        if (State.view === "approval") island.setView(State.defaultView());
        State.notify();
      }, 110_000);
      break;
    }

    default:
      break;
  }
  State.notify();
}
