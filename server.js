import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { generateWalkthrough, validateRequest, ValidationError, WalkthroughError } from "./src/walkthrough.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_BYTES = 40 * 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new ValidationError("Upload is too large. Use fewer or smaller photos.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ValidationError("Request body is not valid JSON.");
  }
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const filePath = path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

export function createServer({ client = new Anthropic() } = {}) {
  return http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/api/walkthrough") {
      try {
        const request = validateRequest(await readJson(req));
        sendJson(res, 200, await generateWalkthrough(request, client));
      } catch (err) {
        if (err instanceof ValidationError) return sendJson(res, 400, { error: err.message });
        if (err instanceof WalkthroughError) return sendJson(res, err.status, { error: err.message });
        if (err instanceof Anthropic.AuthenticationError) {
          return sendJson(res, 500, { error: "Server is missing a valid Anthropic API key." });
        }
        if (err instanceof Anthropic.RateLimitError) {
          return sendJson(res, 429, { error: "Too many requests right now. Try again shortly." });
        }
        if (err instanceof Anthropic.APIError) {
          console.error(`Anthropic API error ${err.status}:`, err.message);
          return sendJson(res, 502, { error: "The AI service returned an error. Try again." });
        }
        console.error(err);
        return sendJson(res, 500, { error: "Unexpected server error." });
      }
      return;
    }
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
    res.writeHead(405).end();
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, () => {
    console.log(`AI Property Walkthrough running at http://localhost:${PORT}`);
  });
}
