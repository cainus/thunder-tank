import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

vi.mock("../src/game/GameCanvas", () => ({
  GameCanvas: ({
    matchMode,
    onMapEnded,
    onPlayerStatusChanged,
  }: {
    matchMode: "campaign" | "deathmatch" | "coOp";
    onMapEnded: (outcome: "won" | "lost") => void;
    onPlayerStatusChanged: (status: {
      buffs: { speedUntil: number; rapidFireUntil: number; shieldUntil: number };
      gunFrozenUntil: number;
      now: number;
    }) => void;
  }) => (
    <div data-testid="mock-game-canvas">
      <span>Mode: {matchMode}</span>
      <button
        type="button"
        onClick={() =>
          onPlayerStatusChanged({
            buffs: { speedUntil: 1_000, rapidFireUntil: 0, shieldUntil: 2_000 },
            gunFrozenUntil: 0,
            now: 100,
          })
        }
      >
        Mock Powerups
      </button>
      <button type="button" onClick={() => onMapEnded("won")}>
        Mock Win
      </button>
      <button type="button" onClick={() => onMapEnded("lost")}>
        Mock Loss
      </button>
    </div>
  ),
}));

describe("App", () => {
  it("boots to the single-player campaign title menu", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Thunder Tank" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Campaign" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2P Deathmatch" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Co-op Campaign" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Controller Setup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Controller Recorder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explosion Sounds" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Motor Sounds" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Level Editor" })).toBeInTheDocument();
  });

  it("starts co-op campaign from the title screen", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Co-op Campaign" }));

    expect(screen.getByTestId("mock-game-canvas")).toBeInTheDocument();
    expect(screen.getByText("Mode: coOp")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mock Win" }));

    expect(screen.getByRole("heading", { name: "Map Cleared" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next Map" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next Map" }));

    expect(screen.getByText("Mode: coOp")).toBeInTheDocument();
  });

  it("starts two-player deathmatch from the title screen", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "2P Deathmatch" }));
    fireEvent.click(screen.getByRole("button", { name: "Mock Win" }));

    expect(screen.getByRole("heading", { name: "P1 Wins" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rematch" })).toBeInTheDocument();
    expect(screen.getByText("Player 1 reached the score limit.")).toBeInTheDocument();
  });

  it("shows only the advance button on the map-cleared screen", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start Campaign" }));
    fireEvent.click(screen.getByRole("button", { name: "Mock Win" }));

    expect(screen.getByRole("heading", { name: "Map Cleared" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next Map" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Controller Setup" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Controller Recorder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Explosion Sounds" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Motor Sounds" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Level Editor" })).not.toBeInTheDocument();
  });

  it("moves restart-screen utilities behind a lower-left settings menu", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start Campaign" }));
    fireEvent.click(screen.getByRole("button", { name: "Mock Loss" }));

    expect(screen.getByRole("heading", { name: "Tank Destroyed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart Map" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Controller Setup" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(screen.getByRole("button", { name: "Controller Setup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Controller Recorder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explosion Sounds" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Motor Sounds" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Level Editor" })).toBeInTheDocument();
  });

  it("shows active power-up names in the HUD as labeled chips", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start Campaign" }));
    fireEvent.click(screen.getByRole("button", { name: "Mock Powerups" }));

    expect(screen.getByLabelText("Active power-ups")).toBeInTheDocument();
    expect(screen.getByText("Speed")).toBeInTheDocument();
    expect(screen.getByText("Shield")).toBeInTheDocument();
    expect(screen.queryByText("Rapid Fire")).not.toBeInTheDocument();
  });
});
