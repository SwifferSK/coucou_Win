// Settings window — complete configuration for Coucou on Windows.
// Parity with macOS: General, Active pills, Agents, Chat providers, and Services.

import "./settings.css";
import { Bridge, onEvent, type HookStatus } from "../core/bridge";
import { DEFAULT_SETTINGS, PILL_CATALOG, WORKSPACE_PILL_IDS, type Settings } from "../core/state";
import { h, clear } from "../views/dom";

let settings: Settings = { ...DEFAULT_SETTINGS };
let version = "";
let currentTab: "general" | "shortcuts" | "pills" | "agents" | "chat" | "services" = "general";

const root = document.getElementById("settings-root")!;

async function save() {
  await Bridge.saveSettings(settings);
}

// ── Reusable UI bits ─────────────────────────────────────────────────────────

function toggle(on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const el = h("button", { class: on ? "switch on" : "switch", "aria-pressed": on });
  el.addEventListener("click", () => {
    const next = !el.classList.contains("on");
    el.classList.toggle("on", next);
    onChange(next);
  });
  return el;
}

function statusDot(ok: boolean): HTMLElement {
  return h("i", { class: "dot", style: `background:${ok ? "#22c55e" : "#f4505e"}` });
}

function renderDiff(text: string): HTMLElement {
  const box = h("div", { class: "diff" });
  for (const line of text.split("\n")) {
    const cls = line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : "ctx";
    box.append(h("div", { class: cls, text: line }));
  }
  return box;
}

// ── Generic Agent Hook Box Component ────────────────────────────────────────

interface HookController {
  title: string;
  description: string;
  getStatus: () => Promise<HookStatus | null>;
  getPreview: (install: boolean) => Promise<{ diff: string; backup: string; fingerprint: string } | null>;
  apply: (install: boolean, fingerprint: string) => Promise<string>;
}

function createHookSection(ctrl: HookController, initialStatus: HookStatus): HTMLElement {
  const status = { ...initialStatus };
  const body = h("div", { style: "display:flex;flex-direction:column;gap:12px" });
  const head = h("h2", {}, statusDot(status.installed), h("span", { text: ctrl.title }));
  const section = h("section", {}, head, body);

  const rebuild = async () => {
    const fresh = await ctrl.getStatus();
    if (fresh) Object.assign(status, fresh);
    clear(body);
    draw();
    clear(head);
    head.append(statusDot(status.installed), h("span", { text: ctrl.title }));
  };

  function draw() {
    body.append(
      h("div", { class: "hint", text: ctrl.description }),
      h("div", { class: "row" },
        h("label", { text: "File" }),
        h("span", { class: "path", text: status.settingsPath }),
      ),
      h("div", { class: "row" },
        h("label", { text: "Relay" }),
        h("span", { class: "path", text: status.hookPath }),
        statusDot(status.hookReady),
      ),
    );

    if (!status.hookReady) {
      body.append(h("div", {
        class: "notice warn",
        text: "coucou-hook.exe is not ready. Build or launch Coucou to place the relay.",
      }));
    }

    const actions = h("div", { class: "row" });
    const install = h("button", {
      class: "primary",
      text: status.installed ? "Reinstall hooks…" : "Install hooks…",
      onclick: () => showPreview(true),
    });
    if (!status.hookReady) {
      install.disabled = true;
      install.title = "The relay isn't installed yet.";
    }
    actions.append(install);
    if (status.installed) {
      actions.append(h("button", {
        class: "danger",
        text: "Uninstall hooks…",
        onclick: () => showPreview(false),
      }));
    }
    body.append(actions);
  }

  async function showPreview(install: boolean) {
    let preview;
    try {
      preview = await ctrl.getPreview(install);
    } catch (err) {
      clear(body);
      body.append(
        h("div", { class: "notice err", text: String(err).replace(/^Error:\s*/, "") }),
        h("div", { class: "row" }, h("button", {
          text: "Back",
          onclick: () => { clear(body); draw(); },
        })),
      );
      return;
    }
    if (!preview) return;
    clear(body);
    body.append(
      h("div", {
        class: "hint",
        text: install
          ? "Preview of changes. A dated backup will be created before writing."
          : "Removes Coucou's entries only. Other configurations remain untouched.",
      }),
      renderDiff(preview.diff),
      h("div", { class: "row" },
        h("span", { class: "path", text: `Backup → ${preview.backup}` }),
      ),
    );
    const confirm = h("button", {
      class: install ? "primary" : "danger",
      text: install ? "Back up and write" : "Back up and remove",
    });
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      try {
        const backup = await ctrl.apply(install, preview.fingerprint);
        clear(body);
        body.append(h("div", {
          class: "notice ok",
          text: `Done. Backup saved to ${backup}.`,
        }));
        window.setTimeout(() => void rebuild(), 2400);
      } catch (err) {
        confirm.disabled = false;
        body.append(h("div", { class: "notice err", text: `Could not write: ${String(err)}` }));
      }
    });
    body.append(h("div", { class: "row" }, confirm, h("button", {
      text: "Cancel",
      onclick: () => { clear(body); draw(); },
    })));
  }

  draw();
  return section;
}

// ── Tab 1: General ───────────────────────────────────────────────────────────

function renderGeneralTab(): HTMLElement {
  const volume = h("input", {
    type: "range", min: "0", max: "0.2", step: "0.005",
    value: String(settings.soundVolume),
  }) as HTMLInputElement;
  volume.addEventListener("input", () => {
    settings.soundVolume = Number(volume.value);
    void save();
  });

  const autoClose = h("input", {
    type: "number", min: "5", max: "120", step: "1",
    value: String(Math.round(settings.autoCloseInterval)),
    style: "width:72px",
  }) as HTMLInputElement;
  autoClose.addEventListener("change", () => {
    settings.autoCloseInterval = Math.max(5, Math.min(120, Number(autoClose.value) || 15));
    autoClose.value = String(settings.autoCloseInterval);
    void save();
  });

  const absence = h("input", {
    type: "number", min: "1", max: "60", step: "1",
    value: String(Math.round(settings.absenceInterval / 60)),
    style: "width:72px",
  }) as HTMLInputElement;
  absence.addEventListener("change", () => {
    settings.absenceInterval = Math.max(60, (Number(absence.value) || 3) * 60);
    absence.value = String(Math.round(settings.absenceInterval / 60));
    void save();
  });

  const screen = h("select", {}) as HTMLSelectElement;
  screen.append(
    h("option", { value: "primary", text: "Main display" }),
    h("option", { value: "cursor", text: "Display under cursor" }),
  );
  screen.value = settings.screen;
  screen.addEventListener("change", () => {
    settings.screen = screen.value as Settings["screen"];
    void save();
  });

  return h(
    "div",
    { class: "tab-content" },
    h("section", {},
      h("h2", {}, h("span", { text: "Preferences" })),
      h("div", { class: "row" },
        h("label", { text: "Sound effects" }),
        toggle(settings.soundEnabled, (v) => { settings.soundEnabled = v; void save(); }),
        volume,
      ),
      h("div", { class: "row" },
        h("label", { text: "Auto-close" }),
        autoClose,
        h("span", { class: "hint", text: "seconds after pointer leaves the island" }),
      ),
      h("div", { class: "row" },
        h("label", { text: "Mochi sleeping after" }),
        absence,
        h("span", { class: "hint", text: "minutes without activity" }),
      ),
      h("div", { class: "row" },
        h("label", { text: "Display" }),
        screen,
      ),
      h("div", { class: "row" },
        h("label", { text: "Weekly recap" }),
        h("span", { class: "hint", text: "Automatic summary of coding time, diffs & tools every week" }),
      ),
      h("div", { class: "row" },
        h("label", { text: "Launch on startup" }),
        toggle(settings.autostart, (v) => { settings.autostart = v; void save(); }),
      ),
    ),
  );
}

// ── Tab 2: Active Pills ──────────────────────────────────────────────────────

function renderPillsTab(): HTMLElement {
  const mainPills = PILL_CATALOG.filter((p) => WORKSPACE_PILL_IDS.includes(p.id));
  const mainSelect = h("select", {}) as HTMLSelectElement;
  for (const p of mainPills) {
    mainSelect.append(h("option", { value: p.id, text: p.name }));
  }
  mainSelect.value = settings.mainPillId || "integration_claude";
  mainSelect.addEventListener("change", () => {
    settings.mainPillId = mainSelect.value;
    void save();
  });

  const otherPills = PILL_CATALOG.filter((p) => !WORKSPACE_PILL_IDS.includes(p.id));
  const note = h("div", { class: "hint" });

  const updateCount = () => {
    const count = settings.activeIntegrations.length;
    note.textContent = `${count} of 4 slots selected. The main tool stays always on.`;
  };

  const list = h("div", { style: "display:flex;flex-direction:column;gap:10px" });

  for (const p of otherPills) {
    const active = settings.activeIntegrations.includes(p.id);
    const sw = h("button", { class: active ? "switch on" : "switch" });
    sw.addEventListener("click", () => {
      const on = settings.activeIntegrations.includes(p.id);
      if (on) {
        settings.activeIntegrations = settings.activeIntegrations.filter((x) => x !== p.id);
      } else {
        if (settings.activeIntegrations.length >= 4) return;
        settings.activeIntegrations = [...settings.activeIntegrations, p.id];
      }
      sw.classList.toggle("on", !on);
      updateCount();
      void save();
    });

    list.append(
      h("div", { class: "row", style: "justify-content:space-between;padding:4px 0" },
        h("div", { style: "display:flex;align-items:center;gap:10px" },
          sw,
          h("i", { class: "dot", style: `background:${p.color}` }),
          h("b", { style: "font-size:13px", text: p.name }),
          h("span", { class: "hint", text: p.subtitle }),
        ),
      ),
    );
  }

  updateCount();

  return h(
    "div",
    { class: "tab-content" },
    h("section", {},
      h("h2", {}, h("span", { text: "Main Workspace Tool" })),
      h("div", { class: "hint", text: "The primary tool you use for coding sessions. It is always active in the island." }),
      h("div", { class: "row" },
        h("label", { text: "Primary tool" }),
        mainSelect,
      ),
    ),
    h("section", {},
      h("h2", {}, h("span", { text: "Active Pills (Max 4)" })),
      note,
      list,
    ),
  );
}

// ── Tab 3: Agents & Hooks ────────────────────────────────────────────────────

function renderAgentsTab(
  claudeStatus: HookStatus,
  agyStatus: HookStatus,
  geminiStatus: HookStatus,
  codexStatus: HookStatus,
  statuslineStatus: HookStatus,
): HTMLElement {
  const agySection = createHookSection(
    {
      title: "Antigravity (agy)",
      description: "Receive Antigravity tool calls, prompt executions, and session updates live in the island.",
      getStatus: () => Bridge.agyHooksStatus(),
      getPreview: (i) => Bridge.agyHooksPreview(i),
      apply: (i, fp) => Bridge.agyHooksApply(i, fp),
    },
    agyStatus,
  );

  const claudeSection = createHookSection(
    {
      title: "Claude Code",
      description: "Approve permissions, respond to questions, and follow tool calls from your Claude Code sessions.",
      getStatus: () => Bridge.hooksStatus(),
      getPreview: (i) => Bridge.hooksPreview(i),
      apply: (i, fp) => Bridge.hooksApply(i, fp),
    },
    claudeStatus,
  );

  const statuslineSection = createHookSection(
    {
      title: "Claude Plan Usage (statusLine)",
      description: "Show real-time rate limit gauges and session usage in the island header for Pro and Max plans.",
      getStatus: () => Bridge.statuslineStatus(),
      getPreview: (i) => Bridge.statuslinePreview(i),
      apply: (i, fp) => Bridge.statuslineApply(i, fp),
    },
    statuslineStatus,
  );

  const geminiSection = createHookSection(
    {
      title: "Gemini CLI",
      description: "Track Gemini CLI commands and coding agent turns.",
      getStatus: () => Bridge.geminiHooksStatus(),
      getPreview: (i) => Bridge.geminiHooksPreview(i),
      apply: (i, fp) => Bridge.geminiHooksApply(i, fp),
    },
    geminiStatus,
  );

  const codexSection = createHookSection(
    {
      title: "Codex",
      description: "Follow Codex session turns and approvals from the island.",
      getStatus: () => Bridge.codexHooksStatus(),
      getPreview: (i) => Bridge.codexHooksPreview(i),
      apply: (i, fp) => Bridge.codexHooksApply(i, fp),
    },
    codexStatus,
  );

  return h(
    "div",
    { class: "tab-content" },
    agySection,
    claudeSection,
    statuslineSection,
    geminiSection,
    codexSection,
  );
}

// ── Tab 4: Chat & AI Providers ───────────────────────────────────────────────

function renderChatTab(presentKeys: Record<string, boolean>): HTMLElement {
  const providerSelect = h("select", {}) as HTMLSelectElement;
  providerSelect.append(
    h("option", { value: "anthropic", text: "Anthropic (Claude)" }),
    h("option", { value: "google", text: "Google AI (Gemini)" }),
    h("option", { value: "openai", text: "OpenAI" }),
    h("option", { value: "ollama", text: "Ollama (Local)" }),
    h("option", { value: "lmstudio", text: "LM Studio (Local)" }),
  );
  providerSelect.value = settings.chatProvider || "anthropic";
  providerSelect.addEventListener("change", () => {
    settings.chatProvider = providerSelect.value;
    void save();
  });

  // Secret fields helper
  function keyRow(label: string, keyName: string, placeholder: string) {
    const isPresent = presentKeys[keyName] ?? false;
    const dot = statusDot(isPresent);
    const input = h("input", {
      type: "password",
      placeholder: isPresent ? "••••••••••••  (stored in Credential Manager)" : placeholder,
      style: "flex:1 1 auto;min-width:0",
      autocomplete: "off",
    }) as HTMLInputElement;

    const saveBtn = h("button", { text: "Save" });
    const clearBtn = h("button", { class: "danger", text: "Clear", style: isPresent ? "" : "display:none" });

    saveBtn.addEventListener("click", async () => {
      const v = input.value.trim();
      if (!v) return;
      try {
        await Bridge.secretSet(keyName, v);
        presentKeys[keyName] = true;
        input.value = "";
        input.placeholder = "••••••••••••  (stored in Credential Manager)";
        dot.style.background = "#22c55e";
        clearBtn.style.display = "";
      } catch (err) {
        console.error(err);
      }
    });

    clearBtn.addEventListener("click", async () => {
      try {
        await Bridge.secretClear(keyName);
        presentKeys[keyName] = false;
        input.placeholder = placeholder;
        dot.style.background = "#f4505e";
        clearBtn.style.display = "none";
      } catch (err) {
        console.error(err);
      }
    });

    return h("div", { class: "row" }, h("label", { text: label }), input, saveBtn, clearBtn, dot);
  }

  // Anthropic Section
  const claudeModels = [
    ["claude-opus-5", "Claude Opus 5"],
    ["claude-sonnet-5", "Claude Sonnet 5"],
    ["claude-haiku-4-5", "Claude Haiku 4.5"],
  ];
  const claudeSelect = h("select", {}) as HTMLSelectElement;
  for (const [id, name] of claudeModels) claudeSelect.append(h("option", { value: id, text: name }));
  claudeSelect.value = settings.model || "claude-opus-5";
  claudeSelect.addEventListener("change", () => {
    settings.model = claudeSelect.value;
    void save();
  });

  // Google Section
  const googleModels = [
    ["gemini-2.0-flash", "Gemini 2.0 Flash"],
    ["gemini-2.5-pro", "Gemini 2.5 Pro"],
    ["gemini-2.5-flash", "Gemini 2.5 Flash"],
  ];
  const googleSelect = h("select", {}) as HTMLSelectElement;
  for (const [id, name] of googleModels) googleSelect.append(h("option", { value: id, text: name }));
  googleSelect.value = settings.googleModel || "gemini-2.0-flash";
  googleSelect.addEventListener("change", () => {
    settings.googleModel = googleSelect.value;
    void save();
  });

  // OpenAI Section
  const openaiModels = [
    ["gpt-4o", "GPT-4o"],
    ["gpt-4o-mini", "GPT-4o Mini"],
    ["o3-mini", "o3 Mini"],
  ];
  const openaiSelect = h("select", {}) as HTMLSelectElement;
  for (const [id, name] of openaiModels) openaiSelect.append(h("option", { value: id, text: name }));
  openaiSelect.value = settings.openaiModel || "gpt-4o";
  openaiSelect.addEventListener("change", () => {
    settings.openaiModel = openaiSelect.value;
    void save();
  });

  // Local models section
  const ollamaInput = h("input", {
    type: "text",
    value: settings.ollamaUrl || "http://localhost:11434",
    style: "flex:1 1 auto",
  }) as HTMLInputElement;
  ollamaInput.addEventListener("change", () => {
    settings.ollamaUrl = ollamaInput.value.trim();
    void save();
  });

  const lmstudioInput = h("input", {
    type: "text",
    value: settings.lmstudioUrl || "http://localhost:1234",
    style: "flex:1 1 auto",
  }) as HTMLInputElement;
  lmstudioInput.addEventListener("change", () => {
    settings.lmstudioUrl = lmstudioInput.value.trim();
    void save();
  });

  return h(
    "div",
    { class: "tab-content" },
    h("section", {},
      h("h2", {}, h("span", { text: "Default Chat Provider" })),
      h("div", { class: "row" }, h("label", { text: "Active AI" }), providerSelect),
    ),
    h("section", {},
      h("h2", {}, h("span", { text: "Anthropic (Claude)" })),
      keyRow("API Key", "anthropic-api-key", "sk-ant-..."),
      h("div", { class: "row" }, h("label", { text: "Model" }), claudeSelect),
    ),
    h("section", {},
      h("h2", {}, h("span", { text: "Google AI (Gemini)" })),
      keyRow("API Key", "google-api-key", "AIzaSy..."),
      h("div", { class: "row" }, h("label", { text: "Model" }), googleSelect),
    ),
    h("section", {},
      h("h2", {}, h("span", { text: "OpenAI" })),
      keyRow("API Key", "openai-api-key", "sk-..."),
      h("div", { class: "row" }, h("label", { text: "Model" }), openaiSelect),
    ),
    h("section", {},
      h("h2", {}, h("span", { text: "Local Models (Ollama & LM Studio)" })),
      h("div", { class: "row" }, h("label", { text: "Ollama URL" }), ollamaInput),
      h("div", { class: "row" }, h("label", { text: "LM Studio URL" }), lmstudioInput),
    ),
  );
}

// ── Tab 5: Services & Integrations ───────────────────────────────────────────

function renderServicesTab(present: Record<string, boolean>): HTMLElement {
  const list = h("div", { style: "display:flex;flex-direction:column;gap:16px" });

  const serviceDefs = [
    { name: "Stripe", color: "#0570DE", fields: [{ key: "stripe-api-key", label: "Secret key", placeholder: "rk_live_..." }] },
    { name: "GitHub", color: "#F4505E", fields: [{ key: "github-token", label: "Personal token", placeholder: "ghp_..." }] },
    { name: "Vercel", color: "#7C5CFF", fields: [{ key: "vercel-token", label: "Token", placeholder: "..." }] },
    { name: "n8n", color: "#F29B38", fields: [{ key: "n8n-url", label: "URL", placeholder: "https://n8n.example.com", secret: false }, { key: "n8n-api-key", label: "API key", placeholder: "..." }] },
    { name: "Resend", color: "#22C55E", fields: [{ key: "resend-api-key", label: "API key", placeholder: "re_..." }] },
    { name: "Notion", color: "#8C8C8C", fields: [{ key: "notion-api-key", label: "Integration token", placeholder: "ntn_..." }] },
    { name: "Cal.com", color: "#C9956A", fields: [{ key: "calcom-api-key", label: "API key", placeholder: "cal_..." }] },
  ];

  for (const def of serviceDefs) {
    const rows = h("div", { style: "display:flex;flex-direction:column;gap:8px;flex:1 1 auto" });
    for (const field of def.fields) {
      const isPresent = present[field.key] ?? false;
      const input = h("input", {
        type: field.secret !== false ? "password" : "text",
        placeholder: isPresent ? "••••••••  (stored)" : field.placeholder,
        style: "flex:1 1 auto;min-width:0",
      }) as HTMLInputElement;

      const saveBtn = h("button", { text: "Save" });
      const clearBtn = h("button", { class: "danger", text: "Clear", style: isPresent ? "" : "display:none" });
      const dot = statusDot(isPresent);

      saveBtn.addEventListener("click", async () => {
        const v = input.value.trim();
        if (!v) return;
        try {
          await Bridge.secretSet(field.key, v);
          present[field.key] = true;
          input.value = "";
          input.placeholder = "••••••••  (stored)";
          dot.style.background = "#22c55e";
          clearBtn.style.display = "";
        } catch (e) {
          console.error(e);
        }
      });

      clearBtn.addEventListener("click", async () => {
        try {
          await Bridge.secretClear(field.key);
          present[field.key] = false;
          input.placeholder = field.placeholder;
          dot.style.background = "#f4505e";
          clearBtn.style.display = "none";
        } catch (e) {
          console.error(e);
        }
      });

      rows.append(h("div", { class: "row" }, h("label", { text: field.label }), input, saveBtn, clearBtn, dot));
    }

    list.append(
      h("section", {},
        h("h2", {}, h("i", { class: "dot", style: `background:${def.color}` }), h("span", { text: def.name })),
        rows,
      ),
    );
  }

  return h("div", { class: "tab-content" }, list);
}

// ── Tab: Shortcuts (Coucou 0.1.7) ──────────────────────────────────────────

function renderShortcutsTab(): HTMLElement {
  const globalShortcuts = [
    { key: "Ctrl + Alt + Space", label: "Open Chat", desc: "Open the AI chat view in the island" },
    { key: "Ctrl + Alt + A", label: "Jump to Alert", desc: "Jump to a waiting permission approval or question" },
    { key: "Ctrl + Alt + T", label: "Focus Terminal", desc: "Bring your active coding editor / terminal forward" },
    { key: "Ctrl + Alt + ]", label: "Next Pill", desc: "Switch to next active pill" },
    { key: "Ctrl + Alt + [", label: "Previous Pill", desc: "Switch to previous active pill" },
    { key: "Ctrl + Alt + M", label: "Mute / Unmute", desc: "Toggle Mochi sound effects" },
    { key: "Ctrl + Alt + D", label: "Desktop Mochi", desc: "Launch or recall Mochi to desktop companion" },
    { key: "Ctrl + Alt + G", label: "Open Wardrobe", desc: "Open Mochi's wardrobe & outfits selection" },
    { key: "Ctrl + Alt + W", label: "Attach Window", desc: "Attach the active window to the chat context" },
    { key: "Ctrl + Shift + N", label: "Toggle Island", desc: "Expand or collapse the Dynamic Island" },
  ];

  const localShortcuts = [
    { key: "Ctrl + → / Ctrl + ←", label: "Next / previous pill" },
    { key: "Ctrl + 1 – Ctrl + 9", label: "Switch to pill by number (1 to 9)" },
    { key: "Ctrl + E", label: "Open / close live code diff viewer" },
    { key: "Ctrl + K", label: "Start new conversation in chat" },
    { key: "Ctrl + P", label: "Pin / unpin the island (keep open)" },
    { key: "Ctrl + ,", label: "Open Settings window" },
    { key: "Ctrl + Enter", label: "Send chat prompt" },
    { key: "Escape", label: "Close island or return to overview" },
  ];

  const globalRows = h("div", { style: "display:flex;flex-direction:column;gap:8px" });
  for (const item of globalShortcuts) {
    globalRows.append(
      h("div", { class: "row", style: "align-items:center;justify-content:space-between" },
        h("div", { style: "display:flex;flex-direction:column;gap:2px" },
          h("div", { style: "font-weight:600;font-size:13px;color:#f1f2f4", text: item.label }),
          h("div", { class: "hint", text: item.desc }),
        ),
        h("div", { style: "display:flex;align-items:center;gap:8px" },
          h("span", { class: "badge", style: "background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.3);padding:3px 8px;border-radius:6px;font-family:monospace;font-size:12px;font-weight:600", text: item.key }),
          h("span", { style: "font-size:10px;color:#22c55e;font-weight:600;background:rgba(34,197,94,0.15);padding:2px 6px;border-radius:10px", text: "ACTIVE" }),
        ),
      ),
    );
  }

  const localRows = h("div", { style: "display:flex;flex-direction:column;gap:6px" });
  for (const item of localShortcuts) {
    localRows.append(
      h("div", { class: "row", style: "align-items:center;justify-content:space-between" },
        h("span", { style: "font-family:monospace;font-size:12px;color:#f1f2f4;background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px", text: item.key }),
        h("span", { style: "font-size:12px;color:#8e939c", text: item.label }),
      ),
    );
  }

  return h(
    "div",
    { class: "tab-content" },
    h("section", {},
      h("h2", {}, h("span", { text: "Global Shortcuts (Work from any app)" })),
      globalRows,
    ),
    h("section", {},
      h("h2", {}, h("span", { text: "Island Shortcuts (Active when island is focused)" })),
      localRows,
    ),
  );
}

// ── Main Page Render ─────────────────────────────────────────────────────────

async function render() {
  const boot = await Bridge.boot();
  if (boot) {
    settings = { ...settings, ...boot.settings };
    version = boot.version;
  }

  const [claudeStatus, agyStatus, geminiStatus, codexStatus, statuslineStatus] = await Promise.all([
    Bridge.hooksStatus().then((s) => s ?? { installed: false, settingsPath: "", hookPath: "", hookReady: false }),
    Bridge.agyHooksStatus().then((s) => s ?? { installed: false, settingsPath: "", hookPath: "", hookReady: false }),
    Bridge.geminiHooksStatus().then((s) => s ?? { installed: false, settingsPath: "", hookPath: "", hookReady: false }),
    Bridge.codexHooksStatus().then((s) => s ?? { installed: false, settingsPath: "", hookPath: "", hookReady: false }),
    Bridge.statuslineStatus().then((s) => s ?? { installed: false, settingsPath: "", hookPath: "", hookReady: false }),
  ]);

  const keys = [
    "anthropic-api-key", "google-api-key", "openai-api-key",
    "stripe-api-key", "github-token", "vercel-token",
    "n8n-url", "n8n-api-key", "resend-api-key", "notion-api-key", "calcom-api-key",
  ];
  const present: Record<string, boolean> = {};
  for (const k of keys) present[k] = (await Bridge.secretPresent(k)) ?? false;

  clear(root);

  // Tab navigation
  const tabs = [
    { id: "general", label: "General" },
    { id: "shortcuts", label: "Shortcuts" },
    { id: "pills", label: "Active Pills" },
    { id: "agents", label: "Agents & Hooks" },
    { id: "chat", label: "Chat AI" },
    { id: "services", label: "Services" },
  ] as const;

  const nav = h("div", { class: "tabs-nav" });
  for (const tab of tabs) {
    const btn = h("button", {
      class: tab.id === currentTab ? "tab-btn active" : "tab-btn",
      text: tab.label,
      onclick: () => {
        currentTab = tab.id;
        void render();
      },
    });
    nav.append(btn);
  }

  const content = h("div", { style: "display:flex;flex-direction:column;gap:16px" });
  if (currentTab === "general") {
    content.append(renderGeneralTab());
  } else if (currentTab === "shortcuts") {
    content.append(renderShortcutsTab());
  } else if (currentTab === "pills") {
    content.append(renderPillsTab());
  } else if (currentTab === "agents") {
    content.append(renderAgentsTab(claudeStatus, agyStatus, geminiStatus, codexStatus, statuslineStatus));
  } else if (currentTab === "chat") {
    content.append(renderChatTab(present));
  } else if (currentTab === "services") {
    content.append(renderServicesTab(present));
  }

  root.append(
    h("div", { class: "settings-header" },
      h("h1", {}, h("span", { text: "Coucou" }), h("span", { class: "version", text: version })),
      nav,
    ),
    content,
    h("div", {
      class: "hint",
      style: "text-align:center;margin-top:12px",
      text: "No telemetry. Local credentials stay in the Windows Credential Manager.",
    }),
  );
}

async function main() {
  await render();
  void onEvent<Settings>("settings-changed", (s) => {
    settings = { ...settings, ...s };
  });
}

void main();
