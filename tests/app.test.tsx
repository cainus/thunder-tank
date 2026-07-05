import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

vi.mock("../src/game/GameCanvas", () => ({
  GameCanvas: ({
    matchMode,
    onPlayerStatusChanged,
    onMapEnded,
  }: {
    matchMode: "campaign" | "deathmatch" | "coOp" | "captureTheFlag" | "captureTheFlagCoOp";
    onPlayerStatusChanged: (status: {
      alive: boolean;
      buffs: { speedUntil: number; rapidFireUntil: number; shieldUntil: number };
      health: number;
      maxHealth: number;
      gunFrozenUntil: number;
      now: number;
    }) => void;
    onMapEnded: (outcome: "won" | "lost") => void;
  }) => {
    useEffect(() => {
      onPlayerStatusChanged({
        alive: true,
        buffs: { speedUntil: 0, rapidFireUntil: 0, shieldUntil: 0 },
        health: 1,
        maxHealth: 1,
        gunFrozenUntil: 0,
        now: 0,
      });
    }, [onPlayerStatusChanged]);

    return (
      <div data-testid="mock-game-canvas">
        <span>Mode: {matchMode}</span>
        <button
          type="button"
          onClick={() =>
            onPlayerStatusChanged({
              alive: true,
              buffs: { speedUntil: 0, rapidFireUntil: 0, shieldUntil: 10_000 },
              health: 3,
              maxHealth: 3,
              gunFrozenUntil: 0,
              now: 100,
            })
          }
        >
          Mock Shielded Status
        </button>
        <button
          type="button"
          onClick={() =>
            onPlayerStatusChanged({
              alive: true,
              buffs: { speedUntil: 1_000, rapidFireUntil: 0, shieldUntil: 2_000 },
              health: 1,
              maxHealth: 1,
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
    );
  },
}));

describe("App", () => {
  it("boots to the single-player campaign title menu", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Thunder Tank" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Campaign" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2P Deathmatch" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Co-op Campaign" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Capture the Flag" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Co-op Capture the Flag" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Controller Setup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Controller Recorder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explosion Sounds" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Motor Sounds" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Level Editor" })).toBeInTheDocument();
  });

  it("starts one-player capture the flag from the title screen", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Capture the Flag" }));

    expect(screen.getByTestId("mock-game-canvas")).toBeInTheDocument();
    expect(screen.getByText("Mode: captureTheFlag")).toBeInTheDocument();
    expect(screen.getByText("01. Twin Depot")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mock Win" }));

    expect(screen.getByRole("heading", { name: "Blue Wins" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next Map" })).toBeInTheDocument();
  });

  it("starts co-op capture the flag from the title screen", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Co-op Capture the Flag" }));

    expect(screen.getByTestId("mock-game-canvas")).toBeInTheDocument();
    expect(screen.getByText("Mode: captureTheFlagCoOp")).toBeInTheDocument();
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

  it("shows remaining hits in the HUD, including armor", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start Campaign" }));
    const matchStatus = screen.getByRole("region", { name: "Match status" });
    expect(matchStatus).toHaveTextContent("Hits");
    expect(matchStatus).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "Mock Shielded Status" }));

    expect(matchStatus).toHaveTextContent("Shield");
    expect(matchStatus).toHaveTextContent("4");
  });

  it("shows the target count and remaining points in the HUD", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start Campaign" }));
    const matchStatus = screen.getByRole("region", { name: "Match status" });

    expect(matchStatus).toHaveTextContent("Target");
    expect(matchStatus).toHaveTextContent(/\d+ to go/);
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
