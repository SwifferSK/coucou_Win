// Live Code Diff Viewer — pixel-perfect match with NotchBuddy / Coucou Dynamic Island live diff.
// Displays file modifications (replace_file_content, Edit, Write) with syntax highlighting,
// line numbers, live status pipeline, and formatted +/- diffs across the full notch width.

import { h, svg } from "./dom";
import { ICONS } from "./icons";
import type { AgentTask, LiveCodeDiff } from "../core/state";

const EXT_COLORS: Record<string, { bg: string; text: string }> = {
  ts: { bg: "#3178c6", text: "#fff" },
  tsx: { bg: "#3178c6", text: "#fff" },
  js: { bg: "#f7df1e", text: "#000" },
  jsx: { bg: "#f7df1e", text: "#000" },
  rs: { bg: "#dea584", text: "#000" },
  py: { bg: "#3572A5", text: "#fff" },
  json: { bg: "#cbcb41", text: "#000" },
  html: { bg: "#e34c26", text: "#fff" },
  css: { bg: "#563d7c", text: "#fff" },
  md: { bg: "#083fa1", text: "#fff" },
  bat: { bg: "#c1f12e", text: "#000" },
  sh: { bg: "#89e051", text: "#000" },
};

function getExtBadge(ext: string): HTMLElement {
  const clean = ext.toLowerCase().replace(/^\./, "");
  const style = EXT_COLORS[clean] || { bg: "#4f5666", text: "#fff" };
  return h("span", {
    class: "diff-ext-badge",
    style: `background:${style.bg};color:${style.text};`,
    text: clean.slice(0, 4).toUpperCase() || "FILE",
  });
}

/** Basic syntax tokenization for keywords, strings, types, and numbers. */
function highlightCode(code: string): HTMLElement {
  const span = h("span", { class: "code-tokens" });
  
  const parts = code.split(
    /(\b(?:const|let|var|function|export|import|from|return|type|interface|class|pub|fn|mut|struct|def|async|await|if|else|switch|case|true|false|null|undefined)\b|"[^"]*"|'[^']*'|`[^`]*`|\b\d+(?:\.\d+)?\b)/g,
  );

  for (const part of parts) {
    if (!part) continue;
    if (/^(?:const|let|var|function|export|import|from|return|type|interface|class|pub|fn|mut|struct|def|async|await|if|else|switch|case)$/.test(part)) {
      span.append(h("span", { style: "color:#c678dd;font-weight:600;", text: part }));
    } else if (/^(?:true|false|null|undefined)$/.test(part)) {
      span.append(h("span", { style: "color:#e5c07b;", text: part }));
    } else if (/^["'`]/.test(part)) {
      span.append(h("span", { style: "color:#98c379;", text: part }));
    } else if (/^\d+(?:\.\d+)?$/.test(part)) {
      span.append(h("span", { style: "color:#d19a66;", text: part }));
    } else {
      span.append(document.createTextNode(part));
    }
  }

  return span;
}

function makeLine(num: number, kind: "ctx" | "add" | "del", content: string): HTMLElement {
  const lineEl = h("div", { class: `diff-line ${kind}` });
  const numEl = h("span", { class: "diff-num", text: String(num) });
  const signEl = h("span", {
    class: "diff-sign",
    text: kind === "add" ? "+" : kind === "del" ? "-" : " ",
  });

  const contentEl = h("span", { class: "diff-content" });
  contentEl.append(highlightCode(content));

  if (kind === "add") {
    contentEl.append(h("span", { class: "diff-cursor" }));
  }

  lineEl.append(numEl, signEl, contentEl);
  return lineEl;
}

export function buildLiveDiffWorkspace(task: AgentTask, diff: LiveCodeDiff): HTMLElement {
  // ── 1. Left Sidebar ────────────────────────────────────────────────────────
  // Thought bubble badge (blue circle with 3 white dots) placed over top-left of Mochi
  const thoughtBadge = h(
    "div",
    { class: "diff-thought-badge" },
    h("span", { class: "diff-thought-dot" }),
    h("span", { class: "diff-thought-dot" }),
    h("span", { class: "diff-thought-dot" }),
  );

  // Mochi placeholder slot (no duplicate canvas; main #bot-canvas floats here)
  const mochiBox = h("div", { class: "diff-mochi-box" }, thoughtBadge);

  let toolLabel = "Claude Code";
  if (task.id === "agent_antigravity") toolLabel = "Antigravity";
  else if (task.id === "agent_cursor") toolLabel = "Cursor";
  else if (task.id === "agent_codex") toolLabel = "Codex";
  else if (task.id === "agent_gemini") toolLabel = "Gemini CLI";

  const infoBox = h(
    "div",
    { class: "diff-info-box" },
    h("span", { class: "diff-project-title", text: task.name || "Workspace" }),
    h("span", { class: "diff-agent-subtitle", text: toolLabel }),
  );

  // Status steps pipeline (Read -> Edit -> Bash -> Done)
  const stepRead = h("div", { class: "diff-step-item done" },
    svg(ICONS.checkCircle, 13),
    h("span", { text: "Read" }),
  );

  const spinnerIcon = h("span", { class: "diff-step-spinner" });
  const stepEdit = h("div", { class: "diff-step-item active" },
    spinnerIcon,
    h("span", { text: "Edit" }),
  );

  const stepBash = h("div", { class: "diff-step-item idle" },
    svg(ICONS.terminal, 12),
    h("span", { text: "Bash" }),
  );

  const stepDone = h("div", { class: "diff-step-item idle" },
    svg(ICONS.checkCircle, 13),
    h("span", { text: "Done" }),
  );

  const pipeline = h("div", { class: "diff-pipeline" }, stepRead, stepEdit, stepBash, stepDone);

  const sidebar = h("div", { class: "diff-workspace-sidebar" }, mochiBox, infoBox, pipeline);

  // ── 2. Right Code Editor Window ────────────────────────────────────────────
  const ext = diff.fileExt || diff.fileName.split(".").pop() || "txt";
  const badge = getExtBadge(ext);

  const head = h(
    "div",
    { class: "diff-card-head" },
    h("div", { class: "diff-head-left" },
      badge,
      h("span", { class: "diff-filename", text: diff.fileName }),
      h("span", { class: "diff-dot-indicator" }),
    ),
    h("span", { class: "diff-filepath", text: diff.filePath }),
  );

  const body = h("div", { class: "diff-card-body" });
  let lineNum = Math.max(1, diff.startLine - 2);

  // Context Before lines (if any)
  for (const line of diff.contextBefore || []) {
    body.append(makeLine(lineNum++, "ctx", line));
  }

  // Deleted lines (red)
  for (const line of diff.deleted || []) {
    body.append(makeLine(lineNum, "del", line));
  }

  // Added lines (green)
  for (const line of diff.added || []) {
    body.append(makeLine(lineNum++, "add", line));
  }

  // Context After lines (if any)
  for (const line of diff.contextAfter || []) {
    body.append(makeLine(lineNum++, "ctx", line));
  }

  const editorWindow = h("div", { class: "diff-editor-window" }, head, body);

  // ── 3. Full Workspace Container ────────────────────────────────────────────
  return h("div", { class: "diff-workspace-container" }, sidebar, editorWindow);
}
