// Unit spec for the DOM HUD overlay that carries the RESPAWN countdown and the
// CTF AI role labels above the 3D overlay canvases (TT-28, game-hud-overlay.ts).
import { afterEach, describe, expect, it } from "vitest";
import { LAYER_Z } from "../src/game/layer-stack";
import {
  GameHudOverlay,
  GAME_HUD_OVERLAY_TESTID,
  type AiRoleLabelState,
} from "../src/game/game-hud-overlay";

describe("GameHudOverlay (TT-28)", () => {
  const overlays: GameHudOverlay[] = [];
  let host: HTMLElement;

  function mount(): GameHudOverlay {
    host = document.createElement("div");
    document.body.appendChild(host);
    const overlay = new GameHudOverlay(host);
    overlays.push(overlay);
    return overlay;
  }

  function root(): HTMLElement {
    return host.querySelector<HTMLElement>(`[data-testid="${GAME_HUD_OVERLAY_TESTID}"]`)!;
  }

  afterEach(() => {
    while (overlays.length > 0) {
      overlays.pop()!.dispose();
    }
    host?.remove();
  });

  it("mounts a HUD layer at the contract's z-index above the 3D overlays", () => {
    mount();
    const el = root();
    expect(el).not.toBeNull();
    expect(el.style.zIndex).toBe(String(LAYER_Z.gameHudOverlay));
    expect(LAYER_Z.gameHudOverlay).toBeGreaterThan(LAYER_Z.tankOverlay);
  });

  it("shows and hides the RESPAWN countdown text", () => {
    const overlay = mount();
    const message = root().firstElementChild as HTMLElement;

    expect(message.style.display).toBe("none");

    overlay.setRespawnCountdown("RESPAWN\n3");
    expect(message.style.display).toBe("block");
    expect(message.textContent).toBe("RESPAWN\n3");

    overlay.setRespawnCountdown(null);
    expect(message.style.display).toBe("none");
  });

  it("reconciles AI role labels by id, reusing nodes and dropping stale ones", () => {
    const overlay = mount();
    const blue: AiRoleLabelState = { id: "t1", text: "Raid Flag", screenX: 100, screenY: 40, team: "blue" };
    const red: AiRoleLabelState = { id: "t2", text: "Protect Flag", screenX: 200, screenY: 60, team: "red" };

    overlay.syncAiRoleLabels([blue, red]);
    let labels = root().querySelectorAll<HTMLElement>("div:not(:first-child)");
    expect(labels).toHaveLength(2);
    expect(labels[0].textContent).toBe("Raid Flag");
    expect(labels[0].style.color).toBe("rgb(191, 239, 255)"); // blue
    expect(labels[1].style.color).toBe("rgb(255, 208, 200)"); // red
    expect(labels[0].style.transform).toContain("100px");

    // Reuse the same node for t1, drop t2 which is no longer present.
    const firstNode = labels[0];
    overlay.syncAiRoleLabels([{ ...blue, text: "Return to Base", screenX: 150, screenY: 40 }]);
    labels = root().querySelectorAll<HTMLElement>("div:not(:first-child)");
    expect(labels).toHaveLength(1);
    expect(labels[0]).toBe(firstNode);
    expect(labels[0].textContent).toBe("Return to Base");
    expect(labels[0].style.transform).toContain("150px");

    // Empty sync clears all labels.
    overlay.syncAiRoleLabels([]);
    expect(root().querySelectorAll("div:not(:first-child)")).toHaveLength(0);
  });

  it("sweeps a prior overlay off the shared host on re-mount", () => {
    mount();
    // Second overlay on the same host — mirrors a fresh Phaser.Game re-mounting.
    const second = new GameHudOverlay(host);
    overlays.push(second);
    expect(host.querySelectorAll(`[data-testid="${GAME_HUD_OVERLAY_TESTID}"]`)).toHaveLength(1);
  });
});
