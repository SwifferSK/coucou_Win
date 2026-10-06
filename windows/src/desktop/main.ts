import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { listen, emit } from "@tauri-apps/api/event";
import { onDragDrop } from "../core/bridge";
import { BotEngine } from "../mochi/engine";
import { getStoredOutfit } from "../mochi/outfits";
import { Sound } from "../core/sound";

const canvas = document.getElementById("mochi-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const engine = new BotEngine();

let isSleeping = false;
let lastUserActivity = performance.now();
let lastFrameTime = performance.now();
let nextIdleLookTime = performance.now() + 2000;

// Gesture state
let isPointerDown = false;
let pointerStartX = 0;
let pointerStartY = 0;
let initialWinX = 0;
let initialWinY = 0;
let isDragging = false;
let lastClickTime = 0;
let singleClickTimer: number | null = null;
let isAlertRetracted = false;

function setup() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = 120;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  engine.setOutfit(getStoredOutfit(), false);
  void Sound.preload();

  // Pointer tracking & window repositioning
  window.addEventListener("pointerdown", (e) => {
    if (e.button === 0) {
      isPointerDown = true;
      isDragging = false;
      pointerStartX = e.screenX;
      pointerStartY = e.screenY;
      lastUserActivity = performance.now();
      if (isSleeping) {
        isSleeping = false;
        engine.setState("idle");
      }

      try {
        const appWin = getCurrentWebviewWindow();
        void appWin.outerPosition().then((pos) => {
          initialWinX = pos.x;
          initialWinY = pos.y;
        });
      } catch {
        /* fallback */
      }
    }
  });

  window.addEventListener("pointermove", (e) => {
    lastUserActivity = performance.now();
    if (isSleeping) {
      isSleeping = false;
      engine.setState("idle");
    }

    if (isPointerDown) {
      const dx = e.screenX - pointerStartX;
      const dy = e.screenY - pointerStartY;
      if (!isDragging && Math.hypot(dx, dy) > 6) {
        isDragging = true;
        if (singleClickTimer != null) {
          clearTimeout(singleClickTimer);
          singleClickTimer = null;
        }
      }

      if (isDragging) {
        try {
          const appWin = getCurrentWebviewWindow();
          const targetX = initialWinX + Math.round(dx * (window.devicePixelRatio || 1));
          const targetY = initialWinY + Math.round(dy * (window.devicePixelRatio || 1));
          void appWin.setPosition(new PhysicalPosition(targetX, targetY));
        } catch {
          /* fallback */
        }
      }
    }

    // Eye tracking relative to Mochi head
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    engine.lookX = Math.tanh((e.clientX - cx) / 35);
    engine.lookY = -Math.tanh((e.clientY - cy) / 35);
  });

  window.addEventListener("pointerup", (e) => {
    if (e.button === 0) {
      isPointerDown = false;
      if (!isDragging) {
        // Pure click (not a drag)
        const now = performance.now();
        if (now - lastClickTime < 320) {
          // Double click: Fly home to notch
          if (singleClickTimer != null) {
            clearTimeout(singleClickTimer);
            singleClickTimer = null;
          }
          lastClickTime = 0;
          flyHome();
        } else {
          // Single click: poke / slap with slight delay for double click
          lastClickTime = now;
          singleClickTimer = window.setTimeout(() => {
            singleClickTimer = null;
            engine.slap();
            Sound.play("pop");
            engine.triggerEmote("happy");
          }, 220);
        }
      }
      isDragging = false;
    }
  });

  // Right-click: Open Wardrobe in the Island
  window.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    engine.triggerEmote("proud");
    Sound.play("pop");
    void emit("desktop-mochi-wardrobe", {});
  });

  // Native double-click fallback
  window.addEventListener("dblclick", (e) => {
    e.preventDefault();
    flyHome();
  });

  // Outfit sync
  window.addEventListener("storage", (e) => {
    if (e.key === "mochiOutfit") {
      engine.setOutfit(getStoredOutfit(), true);
    }
  });

  void listen<{ outfit: string }>("mochi-outfit-changed", (event) => {
    if (event.payload.outfit) {
      engine.setOutfit(event.payload.outfit as any, true);
    }
  });

  // State & Dance sync from Island
  void listen<{ state: string; dancing: boolean; outfit?: string }>("bot-state-sync", (event) => {
    if (event.payload.state) {
      engine.setState(event.payload.state as any);
    }
    if (typeof event.payload.dancing === "boolean") {
      engine.setDancing(event.payload.dancing);
    }
    if (event.payload.outfit) {
      engine.setOutfit(event.payload.outfit as any, false);
    }
  });

  // Task finished: jump for joy!
  void listen("task-finished", () => {
    engine.triggerEmote("happy");
  });

  // Alert cycle: when Claude asks for approval/question, Mochi surprises & retracts to island
  void listen<{ alertActive: boolean }>("alert-state-changed", (event) => {
    if (event.payload.alertActive && !isAlertRetracted) {
      isAlertRetracted = true;
      engine.triggerEmote("surprised");
      Sound.play("blip");
      setTimeout(() => {
        try {
          const appWin = getCurrentWebviewWindow();
          void appWin.hide();
        } catch {
          /* ignore */
        }
      }, 450);
    } else if (!event.payload.alertActive && isAlertRetracted) {
      isAlertRetracted = false;
      setTimeout(() => {
        try {
          const appWin = getCurrentWebviewWindow();
          void appWin.show();
          engine.triggerEmote("happy");
        } catch {
          /* ignore */
        }
      }, 600);
    }
  });

  // Drag & drop file directly onto Desktop Mochi
  void onDragDrop((e) => {
    if (e.type === "drop" && e.paths && e.paths.length > 0) {
      engine.gulp();
      Sound.play("approve");
      engine.triggerEmote("happy");
      void emit("desktop-mochi-file-dropped", { path: e.paths[0] });
    }
  });

  requestAnimationFrame(loop);
}

function flyHome() {
  engine.triggerEmote("happy");
  Sound.play("pop");
  void emit("desktop-mochi-fly-home", {});
  setTimeout(() => {
    try {
      const appWin = getCurrentWebviewWindow();
      void appWin.hide();
    } catch {
      /* ignore */
    }
  }, 200);
}

function loop(nowMs: number) {
  const dt = Math.min(0.05, (nowMs - lastFrameTime) / 1000);
  lastFrameTime = nowMs;

  // Autonomous idle look-around if user has been inactive for > 2s
  if (!isSleeping && nowMs - lastUserActivity > 2000) {
    if (nowMs >= nextIdleLookTime) {
      const r = Math.random();
      if (r < 0.4) {
        engine.lookX = (Math.random() - 0.5) * 0.9;
        engine.lookY = (Math.random() - 0.5) * 0.7;
      } else if (r < 0.7) {
        engine.lookX = 0;
        engine.lookY = 0;
        engine.blink();
      } else if (r < 0.85) {
        engine.triggerEmote("proud");
      }
      nextIdleLookTime = nowMs + 1500 + Math.random() * 3000;
    }
  }

  // Sleep detection: 2 minutes idle
  if (!isSleeping && nowMs - lastUserActivity > 120000) {
    isSleeping = true;
    engine.setState("sleeping");
  }

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, 120, 120);

  engine.update(dt);
  engine.draw(ctx, 120, 120);

  const fpsInterval = isSleeping ? 100 : 1000 / 30;
  setTimeout(() => requestAnimationFrame(loop), fpsInterval);
}

setup();
