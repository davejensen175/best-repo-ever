import { expect, test, type Page } from "@playwright/test";

const fixture = (name: string) => `tests/fixtures/${name}`;
const unique = Date.now().toString(36);

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Test Agent");
  await page.getByLabel("Brokerage").fill("Test Realty");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const roomNames = (page: Page) => page.getByLabel("Room name");

async function renameRoom(page: Page, index: number, name: string) {
  const input = roomNames(page).nth(index);
  await input.fill(name);
  await input.press("Enter");
  await expect(roomNames(page).nth(index)).toHaveValue(name);
}

test("agent builds and publishes a walkthrough; buyer moves through it", async ({ page, browser }) => {
  // 1. Sign up and create a property.
  await signUp(page, `agent-${unique}@example.com`);
  await page.getByLabel("Address").fill(`12 Test Lane ${unique}`);
  await page.getByRole("button", { name: "New listing" }).click();
  await expect(page.getByRole("heading", { name: `12 Test Lane ${unique}` })).toBeVisible();
  const editorUrl = page.url();

  // 2. Upload photos. Each starts as its own room.
  await page
    .locator('input[type=file][multiple]')
    .setInputFiles(["entry.jpg", "living.jpg", "living-2.jpg", "kitchen.jpg", "bedroom.jpg"].map(fixture));
  await expect(roomNames(page)).toHaveCount(5, { timeout: 30_000 });

  // Name the rooms, merge the second living-room photo, and fix the order.
  await renameRoom(page, 0, "Entry");
  await renameRoom(page, 1, "Living room");
  await renameRoom(page, 3, "Kitchen");
  await renameRoom(page, 4, "Bedroom");
  await page.getByLabel("Move photo to room").nth(2).selectOption({ label: "Living room" });
  await expect(roomNames(page)).toHaveCount(4);
  await page.getByRole("button", { name: "Move up" }).nth(3).click(); // Bedroom above Kitchen
  await expect(roomNames(page).nth(2)).toHaveValue("Bedroom");
  await expect(page.locator("li").filter({ has: page.locator('input[value="Living room"]') }).locator("img")).toHaveCount(2);

  // 3. Floor plan from a PDF, then place every room.
  await page.locator('input[accept*="application/pdf"]').setInputFiles(fixture("floor-plan.pdf"));
  const plan = page.getByTestId("floor-plan");
  await expect(plan.locator("img")).toBeVisible({ timeout: 30_000 });
  const spots: Record<string, [number, number]> = {
    Entry: [0.17, 0.8],
    "Living room": [0.3, 0.3],
    Kitchen: [0.8, 0.25],
    Bedroom: [0.67, 0.75],
  };
  for (const [room, [x, y]] of Object.entries(spots)) {
    await page.getByRole("button", { name: new RegExp(`${room}\\s*not placed`) }).click();
    const box = (await plan.boundingBox())!;
    await plan.click({ position: { x: box.width * x, y: box.height * y } });
    await expect(plan.getByRole("button", { name: `${room} marker` })).toBeVisible();
  }
  await expect(page.getByText("All rooms placed.")).toBeVisible();

  // Drag the kitchen marker a little; the new spot must persist after reload.
  const kitchen = plan.getByRole("button", { name: "Kitchen marker" });
  const kb = (await kitchen.boundingBox())!;
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
  await page.mouse.down();
  await page.mouse.move(kb.x + kb.width / 2 - 40, kb.y + kb.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(1000);
  await page.reload();
  const moved = (await plan.getByRole("button", { name: "Kitchen marker" }).boundingBox())!;
  expect(Math.abs(moved.x - (kb.x - 40))).toBeLessThan(8);

  // 4. Hotspots: link the entry photo to the living room.
  const photo = page.getByTestId("hotspot-photo");
  const destination = page.getByRole("group", { name: "Hotspot destination" });
  await page.getByRole("button", { name: "Entry photo 1" }).click();
  await photo.locator("img").evaluate((img: HTMLImageElement) => img.decode());
  let pb = (await photo.boundingBox())!;
  await photo.click({ position: { x: pb.width * 0.5, y: pb.height * 0.45 } });
  await destination.getByRole("button", { name: "Kitchen" }).click();
  // Pick the wrong room first, then fix it from the marker.
  await photo.getByRole("button", { name: "Hotspot to Kitchen" }).click();
  await page.getByLabel("Leads to").selectOption({ label: "Living room" });
  await expect(photo.getByRole("button", { name: "Hotspot to Living room" })).toBeVisible();
  // A second hotspot, then delete it.
  await page.getByRole("button", { name: "Done" }).click();
  await photo.click({ position: { x: pb.width * 0.85, y: pb.height * 0.6 } });
  await destination.getByRole("button", { name: "Bedroom" }).click();
  await page.getByRole("button", { name: "Delete hotspot to Bedroom" }).click();
  await expect(photo.getByRole("button", { name: /^Hotspot to/ })).toHaveCount(1);
  // The bedroom photo gets one back to the living room.
  await page.getByRole("button", { name: "Bedroom photo 1" }).click();
  await photo.locator("img").evaluate((img: HTMLImageElement) => img.decode());
  pb = (await photo.boundingBox())!;
  await photo.click({ position: { x: pb.width * 0.2, y: pb.height * 0.5 } });
  await destination.getByRole("button", { name: "Living room" }).click();
  await expect(photo.getByRole("button", { name: "Hotspot to Living room" })).toBeVisible();
  await page.waitForTimeout(1000);
  await page.reload();
  await expect(photo.getByRole("button", { name: "Hotspot to Living room" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Entry photo 1" })).toContainText("1");

  await page.screenshot({ path: "test-results/editor.png", fullPage: true });

  // 5. Publish.
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const shareUrl = await page.getByLabel("Share link").inputValue();
  expect(shareUrl).toMatch(/\/p\/12-test-lane-/);

  // 6. A buyer (no session) on a phone.
  const buyer = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const b = await buyer.newPage();
  await b.goto(new URL(shareUrl).pathname);
  await expect(b.getByRole("heading", { name: "Entry" })).toBeVisible();
  await expect(b.getByText("Room 1 of 4")).toBeVisible();
  await b.screenshot({ path: "test-results/viewer-entry.png" });

  // Tap the entry photo's hotspot to walk into the living room.
  await b.getByRole("button", { name: "Walk to Living room" }).click();
  await expect(b.getByRole("heading", { name: "Living room" })).toBeVisible();
  await expect(b.getByRole("button", { name: /^Photo \d$/ })).toHaveCount(2);
  await b.getByRole("button", { name: "Next", exact: true }).click(); // second living-room photo
  await expect(b.getByRole("heading", { name: "Living room" })).toBeVisible();
  await b.getByRole("button", { name: "Next", exact: true }).click(); // crosses into the bedroom
  await expect(b.getByRole("heading", { name: "Bedroom" })).toBeVisible();
  await expect(b.getByRole("button", { name: "Walk to Living room" })).toBeVisible();

  // Minimap: open and jump to the kitchen.
  await b.getByRole("button", { name: "Open floor plan" }).click();
  await b.screenshot({ path: "test-results/viewer-minimap.png" });
  await b.getByRole("button", { name: "Go to Kitchen" }).click();
  await expect(b.getByRole("heading", { name: "Kitchen" })).toBeVisible();
  await expect(b.getByText("Room 4 of 4")).toBeVisible();
  await b.screenshot({ path: "test-results/viewer-kitchen.png" });

  // Room list jumps back to the start.
  await b.getByRole("button", { name: "All rooms" }).click();
  await b.getByRole("button", { name: /1\s*Entry/ }).click();
  await expect(b.getByRole("heading", { name: "Entry" })).toBeVisible();
  expect(await b.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Drafts are private: the buyer can't open the editor preview, and unpublishing hides the page.
  await b.goto(`${new URL(editorUrl).pathname}/preview`);
  await expect(b).toHaveURL(/\/login/);
  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByText("Draft. Only you can see it.")).toBeVisible();
  const gone = await b.goto(new URL(shareUrl).pathname);
  expect(gone?.status()).toBe(404);
  await buyer.close();

  // Another agent can't see or open this listing.
  const other = await browser.newContext();
  const o = await other.newPage();
  await signUp(o, `other-${unique}@example.com`);
  await expect(o.getByText(`12 Test Lane ${unique}`)).toHaveCount(0);
  const denied = await o.goto(new URL(editorUrl).pathname);
  expect(denied?.status()).toBe(404);
  await other.close();
});
