import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

vi.mock("../src/game/GameCanvas", () => ({
  GameCanvas: () => <div data-testid="mock-game-canvas" />,
}));

describe("App", () => {
  it("boots to the single-player campaign title menu", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Thunder Tank" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Campaign" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Controller Setup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Controller Recorder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explosion Sounds" })).toBeInTheDocument();
    expect(screen.queryByText(/editor/i)).not.toBeInTheDocument();
  });
});
