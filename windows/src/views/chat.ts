// Chat view — DOM port of PromptView / ChatBubble / TypingDotsView from
// IslandViewContent.swift with dynamic model switcher and window/file context chips.

import { h, svg, clear } from "./dom";
import { ICONS } from "./icons";
import { Bridge, type ChatContext } from "../core/bridge";
import { Sound } from "../core/sound";
import { State, type ChatMessage } from "../core/state";
import type { ViewHost } from "./views";

let nextId = 1;

function bubble(message: ChatMessage): HTMLElement {
  if (message.role === "user") {
    return h(
      "div",
      { class: "chat-row user" },
      h("div", { class: "bubble", text: message.content }),
    );
  }
  return h("div", { class: "chat-row" }, h("div", { class: "reply", text: message.content }));
}

function typingDots(): HTMLElement {
  return h(
    "div",
    { class: "chat-row" },
    h("div", { class: "typing" }, h("i"), h("i"), h("i")),
  );
}

const MODEL_OPTIONS: Array<{
  provider: string;
  providerLabel: string;
  models: Array<{ id: string; label: string }>;
}> = [
  {
    provider: "anthropic",
    providerLabel: "Anthropic",
    models: [
      { id: "claude-3-7-sonnet", label: "Claude 3.7 Sonnet" },
      { id: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet" },
      { id: "claude-3-5-haiku", label: "Claude 3.5 Haiku" },
      { id: "claude-opus-5", label: "Claude Opus" },
    ],
  },
  {
    provider: "openai",
    providerLabel: "OpenAI",
    models: [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini" },
      { id: "o1", label: "o1 Reasoning" },
      { id: "o3-mini", label: "o3-mini" },
    ],
  },
  {
    provider: "google",
    providerLabel: "Google AI",
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    ],
  },
  {
    provider: "ollama",
    providerLabel: "Ollama (Local)",
    models: [
      { id: "llama3", label: "Llama 3" },
      { id: "deepseek-r1", label: "DeepSeek R1" },
      { id: "qwen2.5-coder", label: "Qwen 2.5 Coder" },
    ],
  },
  {
    provider: "lmstudio",
    providerLabel: "LM Studio (Local)",
    models: [{ id: "local-model", label: "Local Model" }],
  },
];

function getModelLabel(provider: string, model: string): string {
  for (const group of MODEL_OPTIONS) {
    if (group.provider === provider) {
      const found = group.models.find((m) => m.id === model);
      if (found) return found.label;
    }
  }
  return model || "AI Model";
}

/** Context chip showing attached file or target window. */
function contextChip(label: string, onRemove: () => void): HTMLElement {
  const closeBtn = h("button", {
    class: "chip-close",
    onclick: (e: Event) => {
      e.stopPropagation();
      onRemove();
    },
  }, "✕");

  const chip = h(
    "div",
    { class: "chip" },
    h("i", { class: "chip-dot" }),
    h("span", { text: label }),
    closeBtn,
  );
  requestAnimationFrame(() => chip.classList.add("settled"));
  return chip;
}

export function buildPrompt(onHeightChange: () => void): ViewHost {
  const chipRow = h("div", { class: "chip-row" });
  const modelBtn = h("button", { class: "model-selector-btn" });
  const modelPopover = h("div", { class: "model-popover" });
  let popoverOpen = false;

  const log = h("div", { class: "chat-log" });
  const input = h("input", {
    type: "text",
    class: "chat-input",
    placeholder: "Ask me anything…",
    spellcheck: "false",
  }) as HTMLInputElement;
  const send = h("button", { class: "send-btn", title: "Send" }, svg(ICONS.arrowUp, 11));
  const bar = h("div", { class: "chat-bar" }, input, send);

  const topHeader = h("div", { class: "chat-top-header" }, chipRow, modelBtn);

  const el = h(
    "div",
    { class: "view" },
    h("div", { class: "card wash chat-card" },
      h("div", { class: "chat-body" }, topHeader, modelPopover, log, bar),
    ),
  );
  (el.querySelector(".card") as HTMLElement).style.setProperty("--wash", "rgba(99,102,241,0.5)");

  let sending = false;
  let renderedCount = -1;

  function renderModelPopover() {
    clear(modelPopover);
    const currentProvider = State.settings.chatProvider || "anthropic";
    const currentModel = State.settings.model || "claude-3-5-sonnet";

    for (const group of MODEL_OPTIONS) {
      const header = h("div", { class: "popover-group-title", text: group.providerLabel });
      modelPopover.append(header);

      for (const m of group.models) {
        const isSelected = group.provider === currentProvider && m.id === currentModel;
        const item = h(
          "button",
          {
            class: `popover-item ${isSelected ? "selected" : ""}`,
            onclick: () => {
              State.settings.chatProvider = group.provider;
              State.settings.model = m.id;
              void Bridge.saveSettings(State.settings);
              Sound.play("blip");
              popoverOpen = false;
              modelPopover.classList.remove("open");
              State.notify();
            },
          },
          h("span", { text: m.label }),
          isSelected ? svg(ICONS.check, 10) : null,
        );
        modelPopover.append(item);
      }
    }
  }

  modelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    popoverOpen = !popoverOpen;
    if (popoverOpen) {
      renderModelPopover();
      modelPopover.classList.add("open");
      Sound.play("blip");
    } else {
      modelPopover.classList.remove("open");
    }
  });

  document.addEventListener("click", (e) => {
    if (popoverOpen && !modelPopover.contains(e.target as Node) && !modelBtn.contains(e.target as Node)) {
      popoverOpen = false;
      modelPopover.classList.remove("open");
    }
  });

  async function submit() {
    const query = input.value.trim();
    if (!query || sending) return;
    input.value = "";
    sending = true;
    Sound.play("send");

    State.chatHistory.push({ id: nextId++, role: "user", content: query });
    State.stateOverride = "thinking";
    State.notify();
    onHeightChange();

    const file = State.droppedFile;
    const win = State.promptContext?.kind === "window" ? State.promptContext : null;
    let context: ChatContext | null = null;

    if (State.chatHistory.length === 1) {
      if (file) context = { kind: "file", name: file.name, path: file.path };
      else if (win) context = { kind: "window", appName: win.appName, title: win.title, url: win.url };
    }

    try {
      const reply = await Bridge.chatSend(query, context);
      State.chatHistory.push({ id: nextId++, role: "assistant", content: reply.text });
      State.stateOverride = null;
      Sound.play("finish");
    } catch (err) {
      State.stateOverride = null;
      const msg = String(err).replace(/^Error:\s*/, "");
      State.noteMessage = msg;
      State.view = "note";
      Sound.play("error");
      window.setTimeout(() => {
        if (State.view === "note") {
          State.view = "prompt";
          State.notify();
          onHeightChange();
        }
      }, 3500);
    } finally {
      sending = false;
      State.notify();
      onHeightChange();
      input.focus();
    }
  }

  send.addEventListener("click", () => void submit());
  input.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") {
      e.preventDefault();
      void submit();
    }
    e.stopPropagation();
  });

  return {
    el,
    sync() {
      // Model button display
      const provider = State.settings.chatProvider || "anthropic";
      const model = State.settings.model || "claude-3-5-sonnet";
      const modelLabel = getModelLabel(provider, model);
      clear(modelBtn);
      modelBtn.append(
        h("span", { class: "model-btn-text", text: modelLabel }),
        h("span", { class: "model-btn-arrow", text: "▾" }),
      );

      // Attached Context Chip
      const file = State.droppedFile;
      const win = State.promptContext?.kind === "window" ? State.promptContext : null;
      const wantChip = file ? file.name : win ? `${win.appName || "Window"} · ${win.title.slice(0, 24)}` : "";

      if (chipRow.dataset.label !== wantChip) {
        chipRow.dataset.label = wantChip;
        clear(chipRow);
        if (wantChip) {
          chipRow.append(contextChip(wantChip, () => {
            State.droppedFile = null;
            State.promptContext = null;
            State.notify();
          }));
        }
      }

      const thinking = State.stateOverride === "thinking";
      const count = State.chatHistory.length + (thinking ? 0.5 : 0);
      if (count !== renderedCount) {
        renderedCount = count;
        clear(log);
        for (const m of State.chatHistory) log.append(bubble(m));
        if (thinking) log.append(typingDots());
        log.scrollTop = log.scrollHeight;
      }

      input.placeholder = State.chatHistory.length === 0 ? "Ask me anything…" : "Continue…";
      input.disabled = sending;
    },
    focus() {
      input.focus();
      input.select();
    },
  };
}
