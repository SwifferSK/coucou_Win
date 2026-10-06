// Weekly Recap view — port of WeeklyRecapView.swift.
// Displays the weekly summary in the notch island and offers a full Wrapped-style share poster.

import { h } from "./dom";
import { washRGBA, type IslandViewName } from "../core/layout";
import { RecapStore, type WeeklySummary } from "../core/recap";
import { Sound } from "../core/sound";
import type { ViewHost } from "./views";

export function buildWeeklyRecap(setView: (v: IslandViewName) => void): ViewHost {
  const root = h("div", { class: "card wash", style: `--wash:${washRGBA("indigo")};display:flex;flex-direction:column;justify-content:space-between;padding:12px 16px 12px 116px;box-sizing:border-box;width:100%;height:100%` });

  let summary: WeeklySummary | null = null;

  function formatDuration(mins: number): string {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }

  function statChip(val: string, label: string): HTMLElement {
    return h("div", { style: "display:flex;flex-direction:column;gap:1px" },
      h("span", { style: "font-size:16px;font-weight:700;color:#f1f2f4;line-height:1.1", text: val }),
      h("span", { style: "font-size:9px;color:#8e939c;text-transform:uppercase;letter-spacing:0.5px", text: label }),
    );
  }

  function openShareModal(s: WeeklySummary) {
    const modal = h("div", {
      style: "position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px",
      onclick: (e) => {
        if (e.target === modal) modal.remove();
      },
    });

    const card = h("div", {
      style: "background:radial-gradient(circle at 50% 80%, rgba(99,102,241,0.25), transparent 70%), #0b0c0e;border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:24px 32px;display:flex;flex-direction:column;align-items:center;width:340px;max-width:90vw;box-shadow:0 20px 40px rgba(0,0,0,0.6)",
    });

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const range = `${monthNames[s.weekStart.getMonth()]} ${s.weekStart.getDate()} – ${monthNames[s.weekEnd.getMonth()]} ${s.weekEnd.getDate()}`;

    card.append(
      h("div", { style: "font-size:22px;font-weight:900;color:#f1f2f4;letter-spacing:-0.5px", text: "Coucou" }),
      h("div", { style: "font-size:13px;color:#8e939c;margin-top:2px", text: "Weekly recap" }),
      h("div", { style: "font-size:11px;color:#818cf8;margin-top:4px;margin-bottom:18px", text: range }),
      h("div", { style: "font-size:42px;font-weight:900;color:#f1f2f4;line-height:1", text: formatDuration(s.totalMinutes) }),
      h("div", { style: "font-size:10px;font-weight:700;color:#8e939c;letter-spacing:2px;margin-top:4px;margin-bottom:18px", text: "TIME CODING" }),
      h("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;margin-bottom:16px" },
        h("div", { style: "background:rgba(255,255,255,0.04);border-radius:12px;padding:8px;text-align:center" },
          h("div", { style: "font-size:18px;font-weight:800;color:#f1f2f4", text: `${s.sessionCount}` }),
          h("div", { style: "font-size:9px;color:#8e939c", text: "SESSIONS" }),
        ),
        h("div", { style: "background:rgba(255,255,255,0.04);border-radius:12px;padding:8px;text-align:center" },
          h("div", { style: "font-size:18px;font-weight:800;color:#f1f2f4", text: `${s.filesChanged}` }),
          h("div", { style: "font-size:9px;color:#8e939c", text: "FILES" }),
        ),
      ),
      h("div", { style: "display:flex;gap:12px;font-family:monospace;font-size:13px;font-weight:600;margin-bottom:16px" },
        h("span", { style: "color:#4ade80", text: `+${s.linesAdded}` }),
        h("span", { style: "color:#f87171", text: `−${s.linesRemoved}` }),
      ),
      h("button", {
        class: "btn primary",
        style: "width:100%;padding:8px;border-radius:12px;margin-top:8px",
        text: "Close",
        onclick: () => modal.remove(),
      }),
    );

    modal.append(card);
    document.body.append(modal);
  }

  function render() {
    summary = RecapStore.weeklySummary();
    root.innerHTML = "";

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const range = `${monthNames[summary.weekStart.getMonth()]} ${summary.weekStart.getDate()} – ${monthNames[summary.weekEnd.getMonth()]} ${summary.weekEnd.getDate()}`;

    const head = h("div", { style: "display:flex;justify-content:space-between;align-items:center;width:100%" },
      h("span", { style: "font-size:11px;font-weight:600;color:#818cf8", text: "Weekly recap" }),
      h("span", { style: "font-size:10px;color:#8e939c", text: range }),
    );

    const statsRow = h("div", { style: "display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap" },
      statChip(formatDuration(summary.totalMinutes), "coding"),
      statChip(`${summary.sessionCount}`, summary.sessionCount === 1 ? "session" : "sessions"),
      statChip(`${summary.filesChanged}`, summary.filesChanged === 1 ? "file" : "files"),
    );

    if (summary.linesAdded + summary.linesRemoved > 0) {
      statsRow.append(statChip(`+${summary.linesAdded} / −${summary.linesRemoved}`, "lines"));
    }
    if (summary.commandsRun > 0) {
      statsRow.append(statChip(`${summary.commandsRun}`, "commands"));
    }

    const actions = h("div", { style: "display:flex;gap:8px" },
      h("button", {
        class: "btn primary",
        style: "padding:4px 10px;font-size:11px;border-radius:8px",
        text: "Share recap",
        onclick: () => {
          if (summary) openShareModal(summary);
          Sound.play("pop");
        },
      }),
      h("button", {
        class: "btn secondary",
        style: "padding:4px 10px;font-size:11px;border-radius:8px",
        text: "OK",
        onclick: () => {
          setView("overview");
          Sound.play("pop");
        },
      }),
    );

    root.append(head, statsRow, actions);
  }

  render();

  return {
    el: root,
    sync: render,
  };
}
