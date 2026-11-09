import { Simulation } from "../../src/engine/simulation";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
test("loads the model, advances time, inspects geometry, changes floors and saves a scenario", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Every path. Every person." }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /orchestra and mezzanine/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Step 0.1 s", exact: true }).click();
  await expect(page.locator(".metric-grid").first()).toContainText("0.1");
  await page.getByRole("button", { name: "Balcony", exact: true }).click();
  await expect(
    page.getByRole("img", { name: /Bailey Hall balcony/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Main floor", exact: true }).click();
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Ⅱ Pause", exact: true }).click();
  await expect(page.locator(".metric-grid").first()).not.toContainText("0.1 s");
  const file = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "↓ Save scenario", exact: true })
    .click();
  expect((await file).suggestedFilename()).toBe("bailey-scenario.json");
  await page
    .getByRole("button", { name: "03   Geometry & assumptions" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Geometry register" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "01   Live simulation" }).click();
  await page.screenshot({
    path: "results/interface-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("rejects an invalid barrier and supports a narrow viewport", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("LED guidance & barriers", { exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Transparent corridor belts", exact: true })
    .check();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const input = page.locator(".installation").getByRole("spinbutton").first();
  await input.fill("3");
  await expect(page.getByRole("alert")).toContainText("1.1");
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "results/interface-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("runs a paired browser-worker experiment and offers deterministic replay", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "02   Paired experiments" }).click();
  await page.getByLabel("Replications", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Run paired experiment →" }).click();
  await expect(
    page.getByRole("heading", { name: "Replicated results" }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole("button", { name: "Replay ↗" })).toHaveCount(1);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "↓ Export batch & logs" }).click();
  const downloaded = await downloading;
  const batch = JSON.parse(await readFile((await downloaded.path())!, "utf8"));
  expect(batch.runs[0]).toEqual(
    new Simulation(batch.runs[0].config, batch.runs[0].seed).run(),
  );
  await page.getByRole("button", { name: "Replay ↗" }).click();
  await expect(
    page.getByRole("img", { name: /orchestra and mezzanine/ }),
  ).toBeVisible();
});
