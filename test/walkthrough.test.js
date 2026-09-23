import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.js";
import { buildContent, generateWalkthrough, validateRequest, ValidationError } from "../src/walkthrough.js";

const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const sampleReport = {
  headline: "Bright two-room flat",
  overview: "A quick tour.",
  overall_condition: "good",
  rooms: [
    { name: "Kitchen", narration: "...", highlights: [], condition: "good", issues: [], not_visible: [] },
  ],
  top_priorities: [],
  questions_to_ask: [],
};

function fakeClient(message, calls = []) {
  return {
    beta: {
      messages: {
        stream(params) {
          calls.push(params);
          return { finalMessage: async () => message };
        },
      },
    },
  };
}

const validBody = {
  property: { address: "1 Test St", type: "House" },
  rooms: [{ name: "Kitchen", notes: "new cabinets", images: [{ media_type: "image/png", data: PIXEL }] }],
};

test("validateRequest rejects missing rooms and bad images", () => {
  assert.throws(() => validateRequest({}), ValidationError);
  assert.throws(() => validateRequest({ rooms: [{ name: "A", images: [] }] }), ValidationError);
  assert.throws(
    () => validateRequest({ rooms: [{ name: "A", images: [{ media_type: "image/tiff", data: "x" }] }] }),
    ValidationError,
  );
});

test("buildContent labels each room before its photos", () => {
  const content = buildContent(validateRequest(validBody));
  assert.match(content[0].text, /1 Test St/);
  assert.match(content[1].text, /Room 1 of 1: Kitchen\nNotes: new cabinets/);
  assert.equal(content[2].type, "image");
  assert.equal(content[2].source.data, PIXEL);
});

test("generateWalkthrough parses structured output", async () => {
  const calls = [];
  const client = fakeClient(
    { model: "claude-opus-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(sampleReport) }] },
    calls,
  );
  const { report } = await generateWalkthrough(validateRequest(validBody), client);
  assert.deepEqual(report, sampleReport);
  assert.equal(calls[0].output_config.format.type, "json_schema");
  assert.equal(calls[0].fallbacks, "default");
});

test("generateWalkthrough surfaces refusals", async () => {
  const client = fakeClient({ stop_reason: "refusal", content: [] });
  await assert.rejects(generateWalkthrough(validateRequest(validBody), client), { status: 422 });
});

test("server serves the page and the API", async (t) => {
  const client = fakeClient({ model: "m", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(sampleReport) }] });
  const server = createServer({ client }).listen(0);
  t.after(() => server.close());
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const page = await fetch(base + "/");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /AI Property Walkthrough/);

  const bad = await fetch(base + "/api/walkthrough", { method: "POST", body: "{}" });
  assert.equal(bad.status, 400);

  const ok = await fetch(base + "/api/walkthrough", { method: "POST", body: JSON.stringify(validBody) });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).report, sampleReport);

  const traversal = await fetch(base + "/..%2fpackage.json");
  assert.notEqual(traversal.status, 200);
});
