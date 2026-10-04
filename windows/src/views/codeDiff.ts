// Live Code Diff Viewer — inspired by Coucou/NotchBuddy live diff viewer.
// Displays file modifications (replace_file_content, Edit, Write) with syntax highlighting,
// line numbers, and formatted +/- diffs.

import { h } from "./dom";
import type { LiveCodeDiff } from "../core/state";

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
  const badge = h("span", {
    class: "diff-ext-badge",
    style: `background:${style.bg};color:${style.text};font-weight:700;font-size:9.5px;padding:2px 4px;border-radius:3px;letter-spacing:0.5px;text-transform:uppercase;`,
    text: clean.slice(0, 4) || "FILE",
  });
  return badge;
}

/** Basic syntax tokenization for keywords, strings, types, and numbers. */
function highlightCode(code: string): HTMLElement {
  const span = h("span", { class: "code-tokens" });
  
  // Quick regex tokenizer
  const parts = code.split(/(\b(?:const|let|var|function|export|import|from|return|type|interface|class|pub|fn|mut|struct|def|async|await|if|else|switch|case|true|false|null|undefined)\b|"[^"]*"|'[^']*'|`[^`]*`|\b\d+(?:\.\d+)?\b)/g);

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

export function buildCodeDiffCard(diff: LiveCodeDiff): HTMLElement {
  const ext = diff.fileExt || diff.fileName.split(".").pop() || "txt";
  const badge = getExtBadge(ext);

  // Header: Badge + Filename + Yellow indicator + Right path
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

  // Code Body with line numbers
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

  return h("div", { class: "diff-viewer-card" }, head, body);
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
    contentEl.append(h("span", { class: "diff-cursor", text: " " }));
  }

  lineEl.append(numEl, signEl, contentEl);
  return lineEl;
}
