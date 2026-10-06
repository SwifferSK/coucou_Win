// Weekly Recap Store — port of RecapStore.swift (Coucou 0.1.7 / Weekly Recap).
// Tracks agent turns, line diffs, decisions, and produces Spotify Wrapped-style stats.

export interface RecapTurn {
  pillId: string;
  project: string;
  start: number; // epoch ms
  end: number;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  commandsRun: number;
  questions: number;
}

export interface RecapDecision {
  pillId: string;
  date: number;
  decision: string;
}

export interface WeeklySummary {
  weekStart: Date;
  weekEnd: Date;
  totalMinutes: number;
  sessionCount: number;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  commandsRun: number;
  questionsAnswered: number;
  permissionsAllowed: number;
  permissionsDenied: number;
  topAgent?: string;
  topProject?: string;
  busiestDay?: string;
  longestSessionMinutes: number;
}

interface DraftTurn {
  pillId: string;
  project: string;
  start: number;
  lastEvent: number;
  changedPaths: Set<string>;
  linesAdded: number;
  linesRemoved: number;
  commandsRun: number;
  questions: number;
}

class RecapStoreEngine {
  private turns: RecapTurn[] = [];
  private decisions: RecapDecision[] = [];
  private drafts: Map<string, DraftTurn> = new Map();
  private isLoaded = false;

  constructor() {
    this.load();
  }

  private load() {
    if (this.isLoaded) return;
    this.isLoaded = true;
    try {
      const raw = localStorage.getItem("coucou_recap_data");
      if (raw) {
        const parsed = JSON.parse(raw);
        this.turns = parsed.turns || [];
        this.decisions = parsed.decisions || [];
        this.prune();
      }
    } catch {
      /* ignore */
    }
  }

  private save() {
    try {
      this.pruneStale();
      localStorage.setItem(
        "coucou_recap_data",
        JSON.stringify({
          turns: this.turns,
          decisions: this.decisions,
        }),
      );
    } catch {
      /* ignore */
    }
  }

  private prune() {
    const cutoff = Date.now() - 12 * 7 * 24 * 3600 * 1000;
    this.turns = this.turns.filter((t) => t.start >= cutoff);
    this.decisions = this.decisions.filter((d) => d.date >= cutoff);
  }

  private pruneStale() {
    const cutoff = Date.now() - 2 * 3600 * 1000;
    for (const [key, draft] of this.drafts.entries()) {
      if (draft.lastEvent < cutoff) {
        this.turns.push({
          pillId: draft.pillId,
          project: draft.project,
          start: draft.start,
          end: draft.lastEvent,
          filesChanged: draft.changedPaths.size,
          linesAdded: draft.linesAdded,
          linesRemoved: draft.linesRemoved,
          commandsRun: draft.commandsRun,
          questions: draft.questions,
        });
        this.drafts.delete(key);
      }
    }
  }

  startTurn(sessionId: string, pillId: string, project = "") {
    this.drafts.set(sessionId, {
      pillId,
      project,
      start: Date.now(),
      lastEvent: Date.now(),
      changedPaths: new Set(),
      linesAdded: 0,
      linesRemoved: 0,
      commandsRun: 0,
      questions: 0,
    });
  }

  recordCommand(sessionId: string) {
    const draft = this.drafts.get(sessionId);
    if (!draft) return;
    draft.lastEvent = Date.now();
    draft.commandsRun += 1;
  }

  recordDiff(sessionId: string, filePath: string, added: number, removed: number) {
    const draft = this.drafts.get(sessionId);
    if (!draft) return;
    draft.lastEvent = Date.now();
    draft.changedPaths.add(filePath);
    draft.linesAdded += added;
    draft.linesRemoved += removed;
  }

  recordQuestion(sessionId: string) {
    const draft = this.drafts.get(sessionId);
    if (!draft) return;
    draft.lastEvent = Date.now();
    draft.questions += 1;
  }

  stopTurn(sessionId: string) {
    const draft = this.drafts.get(sessionId);
    if (!draft) return;
    this.drafts.delete(sessionId);
    this.turns.push({
      pillId: draft.pillId,
      project: draft.project,
      start: draft.start,
      end: Date.now(),
      filesChanged: draft.changedPaths.size,
      linesAdded: draft.linesAdded,
      linesRemoved: draft.linesRemoved,
      commandsRun: draft.commandsRun,
      questions: draft.questions,
    });
    this.save();
  }

  recordDecision(pillId: string, decision: string) {
    this.decisions.push({
      pillId,
      date: Date.now(),
      decision,
    });
    this.save();
  }

  weeklySummary(targetDate = new Date()): WeeklySummary {
    const d = new Date(targetDate);
    const day = d.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const startMs = monday.getTime();
    const endMs = sunday.getTime();

    const turns = this.turns.filter((t) => t.start >= startMs && t.start <= endMs);
    const decisions = this.decisions.filter((dc) => dc.date >= startMs && dc.date <= endMs);

    let totalDurationMs = 0;
    let filesChanged = 0;
    let linesAdded = 0;
    let linesRemoved = 0;
    let commandsRun = 0;
    let questions = 0;
    let longestMs = 0;

    const agentCounts: Record<string, number> = {};
    const projectCounts: Record<string, number> = {};
    const dayCounts: Record<number, number> = {};

    for (const t of turns) {
      const dur = Math.max(0, t.end - t.start);
      totalDurationMs += dur;
      if (dur > longestMs) longestMs = dur;
      filesChanged += t.filesChanged;
      linesAdded += t.linesAdded;
      linesRemoved += t.linesRemoved;
      commandsRun += t.commandsRun;
      questions += t.questions;

      agentCounts[t.pillId] = (agentCounts[t.pillId] || 0) + 1;
      if (t.project) projectCounts[t.project] = (projectCounts[t.project] || 0) + 1;
      const wDay = new Date(t.start).getDay();
      dayCounts[wDay] = (dayCounts[wDay] || 0) + 1;
    }

    let topAgent: string | undefined;
    let maxA = 0;
    for (const [k, v] of Object.entries(agentCounts)) {
      if (v > maxA) {
        maxA = v;
        topAgent = k.replace("agent_", "").replace("integration_", "");
      }
    }

    let topProject: string | undefined;
    let maxP = 0;
    for (const [k, v] of Object.entries(projectCounts)) {
      if (v > maxP) {
        maxP = v;
        topProject = k;
      }
    }

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let busiestDay: string | undefined;
    let maxD = 0;
    for (const [k, v] of Object.entries(dayCounts)) {
      if (v > maxD) {
        maxD = v;
        busiestDay = dayNames[Number(k)];
      }
    }

    const allowed = decisions.filter((dc) => dc.decision === "allow" || dc.decision === "always").length;
    const denied = decisions.filter((dc) => dc.decision === "deny").length;

    return {
      weekStart: monday,
      weekEnd: sunday,
      totalMinutes: Math.round(totalDurationMs / 60000),
      sessionCount: turns.length,
      filesChanged,
      linesAdded,
      linesRemoved,
      commandsRun,
      questionsAnswered: questions,
      permissionsAllowed: allowed,
      permissionsDenied: denied,
      topAgent,
      topProject,
      busiestDay,
      longestSessionMinutes: Math.round(longestMs / 60000),
    };
  }
}

export const RecapStore = new RecapStoreEngine();
