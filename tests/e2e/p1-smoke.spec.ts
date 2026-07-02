import { expect, test } from "@playwright/test";

test("boots and starts the first P1 campaign map", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [],
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Thunder Tank" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Co-op Campaign" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Capture the Flag", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Co-op Capture the Flag" })).toBeVisible();
  await page.getByRole("button", { name: "Controller Setup" }).click();
  await expect(page.getByRole("heading", { name: "Bindings" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Fire/ })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Controller Recorder" }).click();
  await expect(page.getByRole("heading", { name: "Input Recorder" })).toBeVisible();
  await expect(page.getByText("Step 1 of 9")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Explosion Sounds" }).click();
  await expect(page.getByRole("heading", { name: "Audition" })).toBeVisible();
  await expect(page.getByRole("button", { name: /01 Explosion 1/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /20 bang_05/ })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Motor Sounds" }).click();
  await expect(page.getByRole("heading", { name: "Audition" })).toBeVisible();
  await expect(page.getByRole("button", { name: /01 Heavy loop/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /05 Heavy loop alt/ })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Level Editor" }).click();
  await expect(page.getByRole("heading", { name: "Map Lab" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Map editor canvas" })).toBeVisible();
  await expect(page.getByText("Map is valid for onePlayer.")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Start Campaign" }).click();
  await expect(page.getByTestId("game-canvas")).toBeVisible();
  await expect(page.getByText("Dust Yard")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
});
