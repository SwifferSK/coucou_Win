// The launch "coucou" — direct port of GreetingCanvasView.swift (Greeting v2).
// Everything is laid out in the same 640×150 reference space as on macOS.

import { Sound } from "../core/sound";
import { COMPACT_W, NOTCH_H, NOTCH_W } from "../core/layout";

// ── Timing constants ──────────────────────────────────────────────────────────

const GT = {
  pop0: 1.3,
  pop1: 1.45,
  content0: 2.4,
  tuck0: 2.45,
  tuck1: 2.7,
  badge: 2.72,
  down0: 2.85,
  down1: 3.45,
  blink2: 3.7,
  tint0: 3.85,
  tint1: 4.15,
  end: 4.6,
  autoLeave: 4.9,
  COLLAPSE: 0.34,
};

export const GREETING_END = GT.end;

// ── Geometry (640×150) ────────────────────────────────────────────────────────

const GC0 = { x: 320, y: 88 };
const GHB = 34;
const GASP = 1.34;
const GEAR_X = 40;
const GEAR_HB = 14;
const GCARD = { x: 10, y: 36, w: 620, h: 104 };
const GCARD_R = 20;
const SMALL_W = COMPACT_W;
const SMALL_H = NOTCH_H;

// ── Easing ────────────────────────────────────────────────────────────────────

const GE = {
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  easeIn: (t: number) => t * t * t,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

const gClamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const gLerp = (a: number, b: number, t: number) => a + (b - a) * t;
const gSeg = (t: number, a: number, b: number) => gClamp((t - a) / (b - a), 0, 1);

// ── Pose ──────────────────────────────────────────────────────────────────────

type EyeType = "dot" | "happy" | "content";

interface Pose {
  hb: number; x: number; y: number; sx: number; sy: number; tilt: number;
  eye: EyeType; open: number; eyeRoll: number;
  lookX: number; lookY: number;
  handL: number; handR: number; wave: number;
  badge: number; tint: number; halo: number; haloBlue: number; minis: number; fx: number;
  header: number; card: number;
  iw: number; ih: number;
}

// ── Particle Data (seeded LCG, seed = 7) ─────────────────────────────────────

interface WarpStreak { xNorm: number; speed: number; len: number; thick: number; alpha: number; t0: number }
interface RingDot { a: number; j: number; s: number; al: number }

const GREET_PARTICLES = (() => {
  let seed = 7;
  const rnd = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  // ~70 white warp streaks for the fall-in (0 → 0.55 s)
  const warps: WarpStreak[] = Array.from({ length: 70 }, () => ({
    xNorm: rnd(),
    speed: 400 + rnd() * 300,
    len: 6 + rnd() * 16,
    thick: 1 + rnd() * 0.5,
    alpha: 0.25 + rnd() * 0.55,
    t0: rnd() * 0.35,
  }));

  // Single burst ring at 0.45 s, ~90 dots, white
  const ring: RingDot[] = Array.from({ length: 90 }, () => ({
    a: rnd() * Math.PI * 2,
    j: (rnd() - 0.5) * 0.22,
    s: 0.7 + rnd() * 0.9,
    al: 0.45 + rnd() * 0.55,
  }));

  return { warps, ring };
})();

// ── Pose Computation ─────────────────────────────────────────────────────────

function greetPose(t: number): Pose {
  const gx = gSeg(t, 0, 0.5);
  const g = Math.sin((Math.PI * gx) / 2) + 0.04 * Math.sin(Math.PI * gx) * gx;
  const iw = gLerp(NOTCH_W, 640, g);
  const ih = gLerp(NOTCH_H, 150, g);

  const GH = GHB; // 58
  const cx = GC0.x; // 320
  const cy = GC0.y; // 90

  // Body height: invisible before 0.20, grows 0.15 → 1.0 with back ease
  const hb: number = t < 0.2 ? 0 : gLerp(GH * 0.15, GH, GE.back(gSeg(t, 0.2, 0.6)));

  const restY = cy;
  const landY = cy + 0.12 * GH;
  const peakY = cy - 0.15 * GH;
  const dipY = cy + 0.36 * GH;
  const springY = cy - 0.1 * GH;
  const sinkY = cy + 0.3 * GH;

  const restX = cx;
  const drift1 = cx - 0.16 * GH;
  const drift2 = cx - 0.45 * GH;
  const drift3 = cx - 0.57 * GH;
  const drift4 = cx - 0.85 * GH;

  // Lateral X
  let x: number;
  if (t < 0.85) x = restX;
  else if (t < 1.2) x = gLerp(restX, drift1, GE.inOut(gSeg(t, 0.85, 1.2)));
  else if (t < 1.3) x = gLerp(drift1, drift2, GE.easeIn(gSeg(t, 1.2, 1.3)));
  else if (t < 1.45) x = gLerp(drift2, drift3, GE.inOut(gSeg(t, 1.3, 1.45)));
  else if (t < 2.4) x = gLerp(drift3, drift4, GE.inOut(gSeg(t, 1.45, 2.4)));
  else if (t < 2.85) x = drift4;
  else x = gLerp(drift4, restX, GE.inOut(gSeg(t, 2.85, 3.45)));

  // Vertical Y
  let y: number;
  if (t < 0.2) y = 16;
  else if (t < 0.6) y = gLerp(16, landY, GE.easeIn(gSeg(t, 0.2, 0.6)));
  else if (t < 0.73) y = gLerp(landY, peakY, GE.out(gSeg(t, 0.6, 0.73)));
  else if (t < 0.9) y = gLerp(peakY, restY, GE.inOut(gSeg(t, 0.73, 0.9)));
  else if (t < 1.2) y = restY;
  else if (t < 1.3) y = gLerp(restY, dipY, GE.easeIn(gSeg(t, 1.2, 1.3)));
  else if (t < 1.45) y = gLerp(dipY, springY, GE.out(gSeg(t, 1.3, 1.45)));
  else if (t < 1.6) y = gLerp(springY, restY, GE.inOut(gSeg(t, 1.45, 1.6)));
  else if (t < 2.4) y = restY;
  else if (t < 2.7) y = gLerp(restY, sinkY, GE.inOut(gSeg(t, 2.4, 2.7)));
  else if (t < 2.85) y = sinkY;
  else if (t < 3.45) y = gLerp(sinkY, restY, GE.inOut(gSeg(t, 2.85, 3.45)));
  else y = restY;

  // Scale (squash & stretch)
  let sx = 1;
  let sy = 1;

  if (t >= 0.52 && t < 0.68) {
    const k = Math.sin(Math.PI * gSeg(t, 0.52, 0.68));
    sx += 0.14 * k;
    sy -= 0.14 * k;
  }
  if (t >= 0.62 && t < 0.84) {
    const k = Math.sin(Math.PI * gSeg(t, 0.62, 0.84));
    sx -= 0.1 * k;
    sy += 0.18 * k;
  }
  if (t >= 1.2 && t < 1.3) {
    const k = Math.sin(Math.PI * gSeg(t, 1.2, 1.3));
    sx += 0.12 * k;
    sy -= 0.12 * k;
  }
  if (t >= 1.3 && t < 1.46) {
    const k = Math.sin(Math.PI * gSeg(t, 1.3, 1.46));
    sx -= 0.18 * k;
    sy += 0.25 * k;
  }
  if (t >= 2.4 && t < 2.7) {
    const k = Math.sin(Math.PI * gSeg(t, 2.4, 2.7));
    sx += 0.18 * k;
    sy -= 0.14 * k;
  }
  if (t >= 3.7 && t < 3.82) {
    const k = Math.sin(Math.PI * gSeg(t, 3.7, 3.82));
    sx += 0.04 * k;
    sy -= 0.04 * k;
  }

  // Tilt
  let tilt = 0;
  if (t >= 0.85 && t < 1.2) {
    tilt = -0.06 * Math.sin(Math.PI * gSeg(t, 0.85, 1.2));
  } else if (t >= 1.45 && t < 2.4) {
    const w = t - 1.45;
    tilt = 0.04 * Math.sin(2 * Math.PI * 5 * w);
    y += GH * 0.02 * Math.sin(2 * Math.PI * 5 * w);
  } else if (t >= 2.85 && t < 3.45) {
    tilt = 0.04 * Math.sin(Math.PI * gSeg(t, 2.85, 3.45));
  }

  // Eyes
  let eye: EyeType = "dot";
  if (t >= 1.45 && t < 2.4) {
    const w = gSeg(t, 1.45, 1.7);
    eye = w > 0.5 ? "happy" : "dot";
  } else if (t >= 2.4 && t < 3.45) {
    eye = "content";
  }

  const blink = (tb: number) => {
    const k = gSeg(t, tb, tb + 0.12);
    return k > 0 && k < 1 ? 1 - Math.sin(Math.PI * k) * 0.94 : 1;
  };
  const open = Math.min(blink(3.05), blink(GT.blink2));

  let lookX = 0;
  let lookY = 0;
  if (t >= 1.45 && t < 2.4) {
    lookX = 0.55;
    lookY = -0.45;
  } else if (t >= 2.85 && t < 3.45) {
    lookX = 0.4;
    lookY = 0.5;
  }

  // Hands
  const handL =
    t < GT.tuck0
      ? GE.back(gSeg(t, GT.pop0, GT.pop0 + 0.14))
      : 1 - GE.easeIn(gSeg(t, GT.tuck0, GT.tuck1 - 0.03));
  const handR =
    t < GT.tuck0
      ? GE.back(gSeg(t, GT.pop0 + 0.04, GT.pop0 + 0.18))
      : 1 - GE.easeIn(gSeg(t, GT.tuck0 + 0.03, GT.tuck1));
  const wave = t >= GT.pop1 && t < GT.tuck0 ? t - GT.pop1 : -1;

  return {
    hb, x, y, sx, sy, tilt,
    eye, open, eyeRoll: 0,
    lookX, lookY,
    handL, handR, wave,
    badge: GE.back(gSeg(t, GT.badge, GT.badge + 0.28)),
    tint: 0.6 * GE.inOut(gSeg(t, GT.tint0, GT.tint1)),
    halo: GE.out(gSeg(t, 0.3, 0.7)),
    haloBlue: gSeg(t, GT.tint0, GT.tint1),
    minis: 0,
    fx: 1,
    header: gSeg(t, 0.35, 0.6),
    card: gSeg(t, 0.18, 0.45),
    iw, ih,
  };
}

function smallPose(): Pose {
  return {
    hb: GEAR_HB,
    x: 320 - SMALL_W / 2 + GEAR_X,
    y: 16,
    sx: 1, sy: 1, tilt: 0,
    eye: "dot", open: 1, eyeRoll: 0,
    lookX: 0, lookY: 0,
    handL: 0, handR: 0, wave: -1,
    badge: 1, tint: 0.6, halo: 0.6, haloBlue: 1,
    minis: 1, fx: 1,
    header: 0, card: 0,
    iw: SMALL_W, ih: SMALL_H,
  };
}

function pose(t: number, tc: number): Pose {
  if (t < tc) return greetPose(Math.min(t, GT.end + 10));
  const a = greetPose(tc);
  const b = smallPose();
  const e = GE.inOut(gSeg(t, tc, tc + GT.COLLAPSE));
  const p: Pose = { ...a };
  p.iw = gLerp(a.iw, b.iw, e);
  p.ih = gLerp(a.ih, b.ih, e);
  p.x = gLerp(a.x, b.x, e);
  p.y = gLerp(a.y, b.y, e);
  p.hb = gLerp(a.hb, b.hb, e);
  p.badge = gLerp(a.badge, b.badge, e);
  p.tint = gLerp(a.tint, b.tint, e);
  p.halo = gLerp(a.halo, b.halo, e);
  p.haloBlue = gLerp(a.haloBlue, b.haloBlue, e);
  p.header = a.header * (1 - gSeg(t, tc, tc + 0.1));
  p.card = a.card * (1 - gSeg(t, tc, tc + 0.18));
  p.handL = a.handL * (1 - gSeg(t, tc, tc + 0.15));
  p.handR = a.handR * (1 - gSeg(t, tc, tc + 0.15));
  p.tilt = a.tilt * (1 - e);
  p.sx = gLerp(a.sx, 1, e);
  p.sy = gLerp(a.sy, 1, e);
  p.eyeRoll = 0;
  const bk = gSeg(t, tc + 0.14, tc + 0.26);
  p.eye = "dot";
  p.open = bk > 0 && bk < 1 ? 1 - Math.sin(Math.PI * bk) * 0.94 : 1;
  p.lookX = a.lookX * (1 - e);
  p.lookY = a.lookY * (1 - e);
  p.minis = GE.back(gSeg(t, tc + 0.24, tc + 0.42));
  p.fx = 1 - gSeg(t, tc, tc + 0.2);
  return p;
}

// ── Canvas Drawing Helpers ───────────────────────────────────────────────────

function rr(x: CanvasRenderingContext2D, X: number, Y: number, W: number, H: number, R: number) {
  const r = Math.max(0, Math.min(R, W / 2, H / 2));
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + W, Y, X + W, Y + H, r);
  x.arcTo(X + W, Y + H, X, Y + H, r);
  x.arcTo(X, Y + H, X, Y, r);
  x.arcTo(X, Y, X + W, Y, r);
  x.closePath();
}

function mochiPath(hw: number, hh: number): Path2D {
  const p = new Path2D();
  const n = 64;
  const expN = 2.0 / 2.7;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const px = hw * (ca >= 0 ? Math.pow(ca, expN) : -Math.pow(-ca, expN));
    const py = hh * (sa >= 0 ? Math.pow(sa, expN) : -Math.pow(-sa, expN));
    if (i === 0) p.moveTo(px, py);
    else p.lineTo(px, py);
  }
  p.closePath();
  return p;
}

function drawParticles(x: CanvasRenderingContext2D, t: number, p: Pose) {
  if (p.card <= 0 && p.fx >= 1) return;
  const fx = p.fx;

  // Warp streaks
  if (t < 0.55) {
    for (const s of GREET_PARTICLES.warps) {
      if (t < s.t0) continue;
      const elapsed = t - s.t0;
      const yBot = elapsed * s.speed;
      const yTop = yBot - s.len;
      if (yBot <= 0) continue;
      const streakX = 320 - p.iw / 2 + s.xNorm * p.iw;
      const fadeOut = 1 - gSeg(t, 0.4, 0.55);
      const alpha = s.alpha * fx * fadeOut;
      x.strokeStyle = `rgba(255,255,255,${alpha})`;
      x.lineWidth = s.thick;
      x.beginPath();
      x.moveTo(streakX, Math.max(0, yTop));
      x.lineTo(streakX, Math.min(150, yBot));
      x.stroke();
    }
  }

  // Single burst ring at 0.45 s
  const ringT0 = 0.45;
  const k = gSeg(t, ringT0, ringT0 + 1.35);
  if (k > 0 && k < 1) {
    const rx = gLerp(14, 380, GE.out(k));
    const ry = rx * 0.34;
    const fade = (1 - k) * (k < 0.08 ? k / 0.08 : 1) * fx * p.card;
    for (const dot of GREET_PARTICLES.ring) {
      const r = 1 + dot.j;
      x.fillStyle = `rgba(255,255,255,${dot.al * fade})`;
      const dx = GC0.x + Math.cos(dot.a) * rx * r;
      const dy = GC0.y + Math.sin(dot.a) * ry * r;
      x.fillRect(dx, dy, dot.s, dot.s);
    }
  }
}

function drawHandL(x: CanvasRenderingContext2D, hw: number, hh: number, p: Pose) {
  if (p.handL <= 0.01) return;
  const r = hh * 0.42 * Math.min(1, p.handL * 1.5);
  const ox = -hw * 1.05 - r * 0.3;
  let oy = hh * 0.15;
  if (p.wave >= 0) {
    oy += Math.sin(p.wave * 2 * Math.PI * 5) * hh * 0.28;
  }
  x.save();
  x.translate(ox, oy);
  const g = x.createLinearGradient(r * 0.7, -r * 0.85, -r * 0.8, r * 0.9);
  g.addColorStop(0, "#EDEDEF");
  g.addColorStop(1, "#C4C5CA");
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, 0, r, 0, Math.PI * 2);
  x.fill();
  x.restore();
}

function drawHandR(x: CanvasRenderingContext2D, hw: number, hh: number, p: Pose) {
  if (p.handR <= 0.01) return;
  const r = hh * 0.32 * Math.min(1, p.handR * 1.5);
  const ox = hw * 1.05 + r * 0.3;
  const oy = hh * 0.2;
  x.save();
  x.translate(ox, oy);
  if (p.wave >= 0) {
    x.rotate(Math.sin(p.wave * 2 * Math.PI * 2.5) * 0.08);
  }
  const g = x.createLinearGradient(r * 0.7, -r * 0.85, -r * 0.8, r * 0.9);
  g.addColorStop(0, "#EDEDEF");
  g.addColorStop(1, "#C4C5CA");
  x.fillStyle = g;
  x.beginPath();
  x.ellipse(0, 0, r * 0.85, r * 1.2, 0.1, 0, Math.PI * 2);
  x.fill();
  x.restore();
}

function drawMochi(x: CanvasRenderingContext2D, p: Pose) {
  if (p.hb <= 0.1) return;
  const hh = p.hb;
  const hw = p.hb * GASP;

  x.save();
  x.translate(p.x, p.y);
  if (p.tilt !== 0) x.rotate(p.tilt);
  x.scale(p.sx, p.sy);

  drawHandL(x, hw, hh, p);
  drawHandR(x, hw, hh, p);

  const body = mochiPath(hw, hh);
  const g = x.createLinearGradient(hw * 0.7, -hh * 0.85, -hw * 0.8, hh * 0.9);
  g.addColorStop(0, "#EDEDEF");
  g.addColorStop(1, "#C4C5CA");
  x.fillStyle = g;
  x.fill(body);

  if (p.tint > 0.01) {
    const tg = x.createRadialGradient(0, 0, 0, 0, 0, hh * 1.3);
    tg.addColorStop(0, `rgba(59,160,245,${0.45 * p.tint})`);
    tg.addColorStop(0.7, `rgba(59,160,245,${0.25 * p.tint})`);
    tg.addColorStop(1, "rgba(59,160,245,0)");
    x.fillStyle = tg;
    x.fill(body);
  }

  const sh = x.createRadialGradient(0, 0, hh * 0.15, 0, 0, hh * 1.25);
  sh.addColorStop(0, "rgba(0,0,0,0)");
  sh.addColorStop(0.6, "rgba(0,0,0,0)");
  sh.addColorStop(1, "rgba(0,0,0,0.2)");
  x.fillStyle = sh;
  x.fill(body);

  const hl = x.createRadialGradient(hw * 0.34, -hh * 0.46, 0, hw * 0.34, -hh * 0.46, hh * 0.42);
  hl.addColorStop(0, "rgba(255,255,255,0.55)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = hl;
  x.fill(body);

  // Eyes
  x.save();
  x.clip(body);
  x.fillStyle = "#1A1412";
  x.strokeStyle = "#1A1412";
  for (const sd of [-1, 1]) {
    const ex = sd * hw * 0.38 + p.lookX * hw * 0.18;
    const ey = -hh * 0.08 + p.lookY * hh * 0.18;
    const er = hh * 0.14;
    x.save();
    x.translate(ex, ey);

    if (p.eye === "happy") {
      x.lineWidth = er * 0.55;
      x.lineCap = "round";
      x.beginPath();
      x.arc(0, er * 0.2, er * 0.85, Math.PI * 1.12, Math.PI * 1.88);
      x.stroke();
    } else if (p.eye === "content") {
      x.lineWidth = er * 0.45;
      x.lineCap = "round";
      x.beginPath();
      x.arc(0, -er * 0.1, er * 0.8, Math.PI * 0.15, Math.PI * 0.85);
      x.stroke();
    } else {
      x.scale(1, Math.max(0.12, p.open));
      x.beginPath();
      x.ellipse(0, 0, er * 0.78, er * 1.05, 0, 0, Math.PI * 2);
      x.fill();
    }
    x.restore();
  }
  x.restore();

  // Activity badge
  if (p.badge > 0.01) {
    const bs = p.badge;
    const br = hh * 0.3;
    x.save();
    x.translate(-hw * 0.78, -hh * 0.72);
    x.scale(bs, bs);
    x.fillStyle = "#000000";
    x.beginPath();
    x.arc(0, 0, br + hh * 0.07, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#3BA0F5";
    x.beginPath();
    x.arc(0, 0, br, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#0B1B3A";
    for (const i of [-1, 0, 1]) {
      x.beginPath();
      x.arc(i * br * 0.5, 0, br * 0.17, 0, Math.PI * 2);
      x.fill();
    }
    x.restore();
  }

  x.restore();
}

// ── Greeting Engine ──────────────────────────────────────────────────────────

export class Greeting {
  private startMs = 0;
  private tc = Number.POSITIVE_INFINITY;
  private fired = false;
  private timers: number[] = [];

  onComplete: (() => void) | null = null;

  start() {
    this.startMs = performance.now();
    this.tc = Number.POSITIVE_INFINITY;
    this.fired = false;
    this.cancelTimers();
    Sound.play("greeting");
    this.timers.push(
      window.setTimeout(() => this.fire(), (GT.end + 0.05) * 1000),
    );
  }

  hold() {
    if (this.tc >= GT.autoLeave) this.tc = Number.POSITIVE_INFINITY;
  }

  hover() {
    this.hold();
  }

  interrupt() {
    const t = (performance.now() - this.startMs) / 1000;
    if (!Number.isFinite(this.tc) || this.tc > t) this.tc = t;
    this.cancelTimers();
    Sound.fadeOut("greeting", 0.25);
    this.timers.push(
      window.setTimeout(() => this.fire(), (GT.COLLAPSE + 0.05) * 1000),
    );
  }

  stop() {
    this.cancelTimers();
    Sound.fadeOut("greeting", 0.2);
  }

  draw(x: CanvasRenderingContext2D) {
    if (this.startMs === 0) return;
    const t = (performance.now() - this.startMs) / 1000;
    const p = pose(t, this.tc);

    x.clearRect(0, 0, 640, 150);

    if (p.card > 0) {
      x.save();
      x.globalAlpha = p.card;
      rr(x, GCARD.x, GCARD.y, GCARD.w, GCARD.h, GCARD_R);
      x.fillStyle = "#141518";
      x.fill();
      x.restore();

      x.save();
      rr(x, GCARD.x, GCARD.y, GCARD.w, GCARD.h, GCARD_R);
      x.clip();
      drawParticles(x, t, p);
      x.restore();
    } else if (Number.isFinite(this.tc) && t >= this.tc) {
      x.save();
      drawParticles(x, t, p);
      x.restore();
    }

    drawMochi(x, p);

    if (!this.fired && t >= GT.end && this.tc >= GT.autoLeave) {
      this.fire();
    }
  }

  private fire() {
    if (this.fired) return;
    this.fired = true;
    this.cancelTimers();
    this.onComplete?.();
  }

  private cancelTimers() {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
  }
}
