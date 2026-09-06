import { test, expect } from "@playwright/test";
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';

test("failure, recovery, event details, export, comparison and persisted history", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("button", { name: "Run rehearsal" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Run rehearsal" }).click();
  await expect(page.getByText("3/4 CHECKS PASSED")).toBeVisible();
  await expect(
    page.getByText("2 delivery booking(s)", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run with recovery" }).click();
  await expect(page.getByText("4/4 CHECKS PASSED")).toBeVisible();
  await expect(
    page.getByText("1 delivery booking(s)", { exact: true }),
  ).toBeVisible();
  await page.locator(".event-row").first().click();
  await expect(page.locator("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download run report" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("lost-response-recovery");
  const pdfPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF run report', exact: true }).click();
  const pdfDownload = await pdfPromise;
  expect(pdfDownload.suggestedFilename()).toMatch(/lost-response-recovery.*\.pdf$/);
  const report = await PDFDocument.load(await readFile((await pdfDownload.path())!));
  expect(report.getAuthor()).toBe('Tharinda.dev');
  expect(report.getPageCount()).toBeGreaterThanOrEqual(3);
  await page
    .getByRole("button", { name: "Compare strategies", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Baseline behavior" }),
  ).toBeVisible();
  await expect(page.locator(".big-result.passed")).toContainText("4");
  await page.getByRole("button", { name: /Run history/ }).click();
  const count = await page.locator(".history-row").count();
  expect(count).toBeGreaterThanOrEqual(2);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Run history/ }).click();
  await expect(page.locator(".history-row")).toHaveCount(count);
  await page.locator(".history-row").first().click();
  await expect(page.getByText("4/4 CHECKS PASSED")).toBeVisible();
  await page.screenshot({ path: "work/studio-recovery.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("other fault presets recover over HTTP", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  for (const name of [
    "Duplicate delivery event",
    "Rate-limited delivery",
    "Unexpected payment response",
  ]) {
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await page
      .getByRole("button", { name: "With recovery", exact: true })
      .click();
    await page.getByRole("button", { name: "Run rehearsal" }).click();
    await expect(page.getByText("4/4 CHECKS PASSED")).toBeVisible();
  }
});

test("mobile navigation, overflow and reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("button", { name: "Run rehearsal" }),
  ).toBeEnabled();
  for (const name of [
    "Connections",
    "Field guide",
    "Compare strategies",
    "Rehearsal studio",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({ path: "work/studio-mobile.png", fullPage: true });
});

test("invalid input and cross-origin requests are rejected", async ({
  request,
}) => {
  for (const body of [
    null,
    {},
    { scenario: "unknown", strategy: "baseline" },
  ]) {
    const r = await request.post("/api/runs", {
      data: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    expect(r.status()).toBe(400);
  }
  const cross = await request.post("/api/runs", {
    data: { scenario: "lost-response", strategy: "baseline" },
    headers: { Origin: "https://example.com" },
  });
  expect(cross.status()).toBe(403);
  const local = await request.post("/api/runs", {
    data: { scenario: "duplicate-event", strategy: "recovery" },
    headers: { Origin: new URL(test.info().project.use.baseURL!).origin },
  });
  expect(local.status()).toBe(200);
  expect(await local.text()).toContain('"outcome":"passed"');
});

test('illustrated project guide is a real PDF and developer credit is visible', async ({ page, request }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Field guide', exact: true }).click();
  await expect(page.getByText('Understand the whole system.', { exact: false })).toBeVisible();
  await expect(page.locator('.developer-credit')).toContainText('Tharinda.dev');
  const link = page.getByRole('link', { name: 'Download project guide' });
  await expect(link).toBeVisible();
  const response = await request.get((await link.getAttribute('href'))!);
  expect(response.status()).toBe(200);
  const pdf = await PDFDocument.load(await response.body());
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(10);
  expect(pdf.getAuthor()).toBe('Tharinda.dev');
});
