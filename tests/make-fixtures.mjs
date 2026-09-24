// Generates the small test fixtures in tests/fixtures (run with: node tests/make-fixtures.mjs).
import { chromium } from "@playwright/test";

const rooms = [
  ["entry", "Entry", "#c9b79c"],
  ["living", "Living room", "#9fb4a5"],
  ["living-2", "Living room (2)", "#8fa595"],
  ["kitchen", "Kitchen", "#d8c3a5"],
  ["bedroom", "Bedroom", "#a9b8cf"],
];
const plan = `<style>html,body{margin:0}</style><div style="position:relative;width:1200px;height:800px;background:#fff;font:28px sans-serif">
  ${[["Entry", 0, 500, 400, 300], ["Living room", 0, 0, 700, 500], ["Kitchen", 700, 0, 500, 400], ["Bedroom", 400, 400, 800, 400]]
    .map(([n, x, y, w, h]) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:6px solid #333;box-sizing:border-box;display:flex;align-items:center;justify-content:center">${n}</div>`)
    .join("")}
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
for (const [file, label, color] of rooms) {
  await page.setContent(
    `<div style="width:1200px;height:800px;background:linear-gradient(160deg,${color},#333);display:flex;align-items:center;justify-content:center;font:bold 72px sans-serif;color:#fff">${label}</div>`,
  );
  await page.screenshot({ path: `tests/fixtures/${file}.jpg`, type: "jpeg", quality: 70 });
}
await page.setContent(plan);
await page.screenshot({ path: "tests/fixtures/floor-plan.png" });
await page.pdf({ path: "tests/fixtures/floor-plan.pdf", width: "1200px", height: "800px", printBackground: true });
await browser.close();
