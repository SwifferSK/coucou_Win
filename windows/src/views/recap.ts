// Weekly Recap view — port of WeeklyRecapView.swift.
// Displays the weekly summary in the notch island and offers a full Wrapped-style share poster.

import { h } from "./dom";
import { washRGBA } from "../core/layout";
import { RecapStore, type WeeklySummary } from "../core/recap";
import { Sound } from "../core/sound";
import type { ViewActions, ViewHost } from "./views";

export function buildWeeklyRecap(actions: ViewActions): ViewHost {
  const root = h("div", {
    class: "card wash",
    style: `--wash:${washRGBA("indigo")};display:flex;flex-direction:column;justify-content:space-between;padding:10px 14px 10px 116px;box-sizing:border-box;width:100%;height:100%;position:relative`,
  });

  let summary: WeeklySummary | null = null;

  function formatDuration(mins: number): string {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }

  function statChip(val: string, label: string): HTMLElement {
    return h("div", { style: "display:flex;flex-direction:column;gap:1px" },
      h("span", { style: "font-size:15px;font-weight:700;color:#f1f2f4;line-height:1.1", text: val }),
      h("span", { style: "font-size:9px;color:#8e939c;text-transform:uppercase;letter-spacing:0.5px", text: label }),
    );
  }

  function closeRecap() {
    // Remove any share modal if open
    document.querySelectorAll(".recap-share-modal").forEach((el) => el.remove());
    actions.setView("overview");
    actions.collapse();
    Sound.play("pop");
  }

  function openShareModal(s: WeeklySummary) {
    // Remove old modal if any
    document.querySelectorAll(".recap-share-modal").forEach((el) => el.remove());

    const modal = h("div", {
      class: "recap-share-modal",
      style: "position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box",
      onclick: (e) => {
        if (e.target === modal) modal.remove();
      },
    });

    const card = h("div", {
      style: "background:radial-gradient(circle at 50% 80%, rgba(99,102,241,0.25), transparent 70%), #0b0c0e;border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:16px 22px;display:flex;flex-direction:column;align-items:center;width:320px;max-width:92vw;max-height:88vh;overflow-y:auto;box-shadow:0 16px 36px rgba(0,0,0,0.7);position:relative",
    });

    const closeBtn = h("button", {
      style: "position:absolute;top:10px;right:12px;background:rgba(255,255,255,0.08);border:none;color:#f1f2f4;border-radius:50%;width:26px;height:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700",
      text: "✕",
      onclick: () => modal.remove(),
    });

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const range = `${monthNames[s.weekStart.getMonth()]} ${s.weekStart.getDate()} – ${monthNames[s.weekEnd.getMonth()]} ${s.weekEnd.getDate()}`;

    card.append(
      closeBtn,
      h("div", { style: "font-size:18px;font-weight:900;color:#f1f2f4;letter-spacing:-0.5px", text: "Coucou" }),
      h("div", { style: "font-size:12px;color:#8e939c;margin-top:1px", text: "Weekly recap" }),
      h("div", { style: "font-size:11px;color:#818cf8;margin-top:2px;margin-bottom:12px", text: range }),
      h("div", { style: "font-size:36px;font-weight:900;color:#f1f2f4;line-height:1", text: formatDuration(s.totalMinutes) }),
      h("div", { style: "font-size:9px;font-weight:700;color:#8e939c;letter-spacing:2px;margin-top:3px;margin-bottom:12px", text: "TIME CODING" }),
      h("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;margin-bottom:10px" },
        h("div", { style: "background:rgba(255,255,255,0.04);border-radius:10px;padding:6px;text-align:center" },
          h("div", { style: "font-size:16px;font-weight:800;color:#f1f2f4", text: `${s.sessionCount}` }),
          h("div", { style: "font-size:8px;color:#8e939c", text: "SESSIONS" }),
        ),
        h("div", { style: "background:rgba(255,255,255,0.04);border-radius:10px;padding:6px;text-align:center" },
          h("div", { style: "font-size:16px;font-weight:800;color:#f1f2f4", text: `${s.filesChanged}` }),
          h("div", { style: "font-size:8px;color:#8e939c", text: "FILES" }),
        ),
      ),
      h("div", { style: "display:flex;gap:12px;font-family:monospace;font-size:12px;font-weight:600;margin-bottom:12px" },
        h("span", { style: "color:#4ade80", text: `+${s.linesAdded}` }),
        h("span", { style: "color:#f87171", text: `−${s.linesRemoved}` }),
      ),
      h("button", {
        class: "btn primary",
        style: "width:100%;padding:6px;border-radius:10px;cursor:pointer;font-size:12px",
        text: "Close Poster",
        onclick: () => modal.remove(),
      }),
    );

    modal.append(card);
    document.body.append(modal);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        modal.remove();
        window.removeEventListener("keydown", onKey);
      }
    };
    window.addEventListener("keydown", onKey);
  }

  function render() {
    summary = RecapStore.weeklySummary();
    root.innerHTML = "";

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const range = `${monthNames[summary.weekStart.getMonth()]} ${summary.weekStart.getDate()} – ${monthNames[summary.weekEnd.getMonth()]} ${summary.weekEnd.getDate()}`;

    const head = h("div", { style: "display:flex;justify-content:space-between;align-items:center;width:100%" },
      h("div", { style: "display:flex;align-items:center;gap:8px" },
        h("span", { style: "font-size:11px;font-weight:600;color:#818cf8", text: "Weekly recap" }),
        h("span", { style: "font-size:10px;color:#8e939c", text: range }),
      ),
      h("button", {
        style: "background:rgba(255,255,255,0.06);border:none;color:#8e939c;font-size:13px;cursor:pointer;padding:2px 8px;border-radius:6px;line-height:1",
        text: "✕",
        title: "Close recap",
        onclick: closeRecap,
      }),
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

    const actionsRow = h("div", { style: "display:flex;gap:8px;align-items:center" },
      h("button", {
        class: "btn primary",
        style: "padding:4px 10px;font-size:11px;border-radius:8px;cursor:pointer",
        text: "Share recap",
        onclick: () => {
          if (summary) openShareModal(summary);
          Sound.play("pop");
        },
      }),
      h("button", {
        class: "btn secondary",
        style: "padding:4px 12px;font-size:11px;border-radius:8px;cursor:pointer;font-weight:600",
        text: "OK",
        onclick: closeRecap,
      }),
    );

    root.append(head, statsRow, actionsRow);
  }

  render();

  return {
    el: root,
    sync: render,
  };
}
