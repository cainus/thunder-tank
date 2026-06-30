import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

vi.mock("../src/game/GameCanvas", () => ({
  GameCanvas: ({ onMapEnded }: { onMapEnded: (outcome: "won" | "lost") => void }) => (
    <div data-testid="mock-game-canvas">
      <button type="button" onClick={() => onMapEnded("won")}>
        Mock Win
      </button>
    </div>
  ),
}));

describe("App", () => {
  it("boots to the single-player campaign title menu", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Thunder Tank" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Campaign" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Controller Setup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Controller Recorder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explosion Sounds" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Motor Sounds" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Level Editor" })).toBeInTheDocument();
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
});
