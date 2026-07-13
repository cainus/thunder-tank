// DOM HUD overlay for in-world HUD messages that must read ON TOP of the 3D
// overlay canvases (TT-28).
//
// The RESPAWN countdown and the CTF AI role labels used to be Phaser Text on the
// base game canvas, relying on `setDepth` to sit above everything. But Phaser
// depth only orders sprites within the base canvas; the tank/tree/crate/car
// overlays are sibling canvases composited above it (see layer-stack.ts), so the
// 3D elements painted over those messages. This overlay is a plain DOM layer
// mounted on the same host at a z-index above every 3D overlay, so its contents
// always read on top. It mirrors the mount/dispose lifecycle of the three.js
// overlays (tank-3d.ts) — one instance per Phaser.Game, swept on re-mount.
import { LAYER_Z } from "./layer-stack";
import type { TeamId } from "./types";

// data-testid stamped on the overlay root so tests (and any duplicate-cleanup
// sweep) can find it — mirrors TANK_OVERLAY_TESTID for the tank overlay.
export const GAME_HUD_OVERLAY_TESTID = "game-hud-overlay";

// One AI role label's per-frame state, already converted to screen-space pixels
// (relative to the top-left of the overlay, which covers the whole game view).
export interface AiRoleLabelState {
  // Stable key (the owning tank's id) used to reuse the same DOM node per tank.
  id: string;
  text: string;
  screenX: number;
  screenY: number;
  team: TeamId;
}

/**
 * Removes any pre-existing game HUD overlay from `host`. Each map runs inside a
 * fresh Phaser.Game mounted on the same persistent host, so an overlay left
 * behind by a prior game would otherwise stack a second HUD on top. Mirrors
 * removeExistingTankOverlays in tank-3d.ts.
 */
export function removeExistingGameHudOverlays(host: HTMLElement): void {
  host.querySelectorAll(`[data-testid="${GAME_HUD_OVERLAY_TESTID}"]`).forEach((node) => node.remove());
}

export class GameHudOverlay {
  private readonly root: HTMLDivElement;
  private readonly respawnMessage: HTMLDivElement;
  private readonly aiRoleLabels = new Map<string, HTMLDivElement>();

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.setAttribute("data-testid", GAME_HUD_OVERLAY_TESTID);
    Object.assign(this.root.style, {
      position: "absolute",
      inset: "0",
      overflow: "hidden",
      // The overlay never intercepts input — the game canvas below owns it.
      pointerEvents: "none",
      // Sit above every 3D overlay canvas (see layer-stack.ts). Phaser depth
      // cannot cross the canvas boundary, so HUD messages that must read on top
      // of the 3D elements live here in the CSS z-index stack (TT-28).
      zIndex: String(LAYER_Z.gameHudOverlay),
    } satisfies Partial<CSSStyleDeclaration>);

    this.respawnMessage = document.createElement("div");
    Object.assign(this.respawnMessage.style, {
      position: "absolute",
      left: "50%",
      top: "34%",
      transform: "translate(-50%, -50%)",
      textAlign: "center",
      whiteSpace: "pre-line",
      color: "#f4e2a3",
      fontFamily: "Inter, sans-serif",
      fontSize: "42px",
      fontWeight: "800",
      lineHeight: "1.1",
      // Approximates the Phaser stroke the countdown had (strokeThickness 7).
      textShadow: "0 0 6px #15120b, 0 2px 6px #15120b",
      webkitTextStroke: "1px #15120b",
      display: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.respawnMessage);

    removeExistingGameHudOverlays(host);
    host.appendChild(this.root);
  }

  // Shows the full-screen "RESPAWN\nN" countdown, or hides it when `text` is null.
  setRespawnCountdown(text: string | null): void {
    if (!text) {
      this.respawnMessage.style.display = "none";
      return;
    }
    this.respawnMessage.textContent = text;
    this.respawnMessage.style.display = "block";
  }

  // Reconciles the on-screen AI role labels to exactly `labels`: existing nodes
  // are reused by id, new ones are created, and any label no longer present is
  // removed. Callers pass only the labels that should currently be visible.
  syncAiRoleLabels(labels: AiRoleLabelState[]): void {
    const seen = new Set<string>();
    for (const label of labels) {
      seen.add(label.id);
      let el = this.aiRoleLabels.get(label.id);
      if (!el) {
        el = this.createAiRoleLabel();
        this.aiRoleLabels.set(label.id, el);
        this.root.appendChild(el);
      }
      el.textContent = label.text;
      el.style.color = label.team === "blue" ? "#bfefff" : "#ffd0c8";
      // Position the label centered on its screen-space point.
      el.style.transform = `translate(-50%, -50%) translate(${label.screenX}px, ${label.screenY}px)`;
    }

    for (const [id, el] of this.aiRoleLabels) {
      if (!seen.has(id)) {
        el.remove();
        this.aiRoleLabels.delete(id);
      }
    }
  }

  private createAiRoleLabel(): HTMLDivElement {
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "absolute",
      left: "0",
      top: "0",
      fontFamily: "Arial, sans-serif",
      fontSize: "13px",
      fontWeight: "800",
      backgroundColor: "rgba(12, 17, 13, 0.72)",
      padding: "3px 6px",
      borderRadius: "3px",
      whiteSpace: "nowrap",
    } satisfies Partial<CSSStyleDeclaration>);
    return el;
  }

  dispose(): void {
    this.aiRoleLabels.clear();
    this.root.remove();
  }
}
