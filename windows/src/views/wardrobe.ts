// Wardrobe View — DOM port of WardrobeView in IslandViewContent.swift.
// Displays outfit picker grid with real-time preview, season detection, and persistence.

import { h, clear } from "./dom";
import {
  type OutfitName,
  OUTFIT_LIST,
  getSeasonalOutfit,
  resolveOutfit,
  getStoredOutfit,
  setStoredOutfit,
  drawOutfitBehind,
  drawOutfitFront,
  getOutfitBodyColors,
  mochiOutfitPath,
  type MochiHeadInfo,
} from "../mochi/outfits";
import { Sound } from "../core/sound";
import type { ViewActions, ViewHost } from "./views";

export interface WardrobeActions extends ViewActions {
  selectOutfit(outfit: OutfitName): void;
  previewOutfit(outfit: OutfitName | null): void;
}

export function buildWardrobe(actions: WardrobeActions): ViewHost {
  let hoveredOutfit: OutfitName | null = null;
  let currentSelection: OutfitName = getStoredOutfit();

  const titleText = h("span", { class: "wardrobe-title", text: "Wardrobe" });
  const subtitleText = h("span", { class: "wardrobe-subtitle" });

  const headerRow = h("div", { class: "wardrobe-header" }, titleText, subtitleText);

  const grid = h("div", { class: "wardrobe-grid" });

  function updateSubtitle() {
    if (hoveredOutfit) {
      if (hoveredOutfit === "auto") {
        const seasonal = getSeasonalOutfit();
        const seasonalInfo = OUTFIT_LIST.find((o) => o.id === seasonal);
        const name = seasonalInfo ? seasonalInfo.displayName : "None";
        subtitleText.textContent = `Auto · follows the seasons (now: ${name})`;
      } else {
        const info = OUTFIT_LIST.find((o) => o.id === hoveredOutfit);
        subtitleText.textContent = info ? info.displayName : "";
      }
      return;
    }

    if (currentSelection === "auto") {
      const seasonal = getSeasonalOutfit();
      const seasonalInfo = OUTFIT_LIST.find((o) => o.id === seasonal);
      const name = seasonalInfo ? seasonalInfo.displayName : "None";
      subtitleText.textContent = `Auto · ${name}`;
    } else {
      const info = OUTFIT_LIST.find((o) => o.id === currentSelection);
      subtitleText.textContent = info ? info.displayName : "";
    }
  }

  function renderGrid() {
    clear(grid);
    for (const item of OUTFIT_LIST) {
      const isSelected = item.id === currentSelection;
      const isHovered = item.id === hoveredOutfit;

      const canvas = h("canvas", { class: "outfit-canvas", width: 34, height: 34 });
      drawMiniOutfitIcon(canvas, item.id);

      const pill = h(
        "button",
        {
          class: `outfit-pill ${isSelected ? "selected" : ""} ${isHovered ? "hovered" : ""}`,
          title: item.displayName,
          onclick: () => {
            currentSelection = item.id;
            setStoredOutfit(item.id);
            actions.selectOutfit(item.id);
            Sound.play("pop");
            renderGrid();
            updateSubtitle();
          },
          onmouseenter: () => {
            hoveredOutfit = item.id;
            actions.previewOutfit(item.id);
            updateSubtitle();
          },
          onmouseleave: () => {
            if (hoveredOutfit === item.id) {
              hoveredOutfit = null;
              actions.previewOutfit(null);
              updateSubtitle();
            }
          },
        },
        canvas,
      );

      grid.appendChild(pill);
    }
  }

  const el = h("div", { class: "view wardrobe-view" }, headerRow, grid);

  renderGrid();
  updateSubtitle();

  return {
    el,
    sync() {
      currentSelection = getStoredOutfit();
      renderGrid();
      updateSubtitle();
    },
  };
}

function drawMiniOutfitIcon(canvas: HTMLCanvasElement, outfit: OutfitName) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = 34;
  const h = 34;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2 + 1.5;
  const iconR = 8.5;
  const rx = iconR * 1.14;
  const ry = iconR * 0.88;
  const effectiveOutfit = resolveOutfit(outfit);

  const headInfo: MochiHeadInfo = {
    R: iconR,
    rx,
    ry,
    yaw: 0,
    pitch: 0,
    roll: 0,
    physDx: 0,
    physDy: 0,
  };

  // Behind pass
  if (effectiveOutfit !== "none") {
    ctx.save();
    ctx.translate(cx, cy);
    drawOutfitBehind(ctx, effectiveOutfit, headInfo, 1, 1);
    ctx.restore();
  }

  // Body
  const body = mochiOutfitPath(rx, ry);
  ctx.save();
  ctx.translate(cx, cy);
  const colors = getOutfitBodyColors(effectiveOutfit);
  const g = ctx.createLinearGradient(rx * 0.7, -ry * 0.85, -rx * 0.8, ry * 0.9);
  g.addColorStop(0, colors ? colors[0] : "#EDEDEF");
  g.addColorStop(1, colors ? colors[1] : "#C4C5CA");
  ctx.fillStyle = g;
  ctx.fill(body);

  // Eyes
  ctx.clip(body);
  ctx.fillStyle = "#1A1412";
  for (const sd of [-1, 1]) {
    const eyeYaw = sd * 0.37;
    const eyePitch = -0.12;
    const cp = Math.cos(eyePitch);
    const ex = Math.sin(eyeYaw) * cp * rx;
    const ey = -Math.sin(eyePitch) * ry;
    const ew = iconR * 0.25;
    const eh = iconR * 0.27;
    ctx.beginPath();
    ctx.ellipse(ex, ey, ew / 2, eh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Front pass
  if (effectiveOutfit !== "none") {
    drawOutfitFront(ctx, effectiveOutfit, headInfo, body, 1, 1);
  }
  ctx.restore();

  // "AUTO" badge text if outfit is auto
  if (outfit === "auto") {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "bold 6.5px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("AUTO", cx, h - 2);
    ctx.restore();
  }
}
