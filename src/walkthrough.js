import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.WALKTHROUGH_MODEL || "claude-opus-5";

const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_ROOMS = 30;
const MAX_IMAGES_PER_ROOM = 6;
const MAX_TOTAL_IMAGES = 60;

const SYSTEM_PROMPT = `You are an experienced property inspector and real-estate guide. You are given
photos of a property grouped by room, plus optional details from the person who took them.

Produce a guided walkthrough of the property in the order the rooms are given, as if you were
leading a prospective buyer or renter through it. For each room, describe what is actually
visible in the photos: layout, light, finishes, fixtures and notable features. Then assess its
condition and list specific issues you can see (e.g. water staining, cracked tiles, worn flooring,
missing outlet covers), each with a severity and a concrete recommendation.

Only report what the photos support. If something cannot be judged from the photos (for example
whether appliances work, or what is behind a closed door), say so in the room's "not_visible"
notes instead of guessing. Write in plain, friendly language suitable for a non-expert.`;

const ISSUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "detail", "severity", "recommendation"],
  properties: {
    title: { type: "string" },
    detail: { type: "string" },
    severity: { type: "string", enum: ["low", "medium", "high"] },
    recommendation: { type: "string" },
  },
};

export const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "overview", "overall_condition", "rooms", "top_priorities", "questions_to_ask"],
  properties: {
    headline: { type: "string", description: "One-line summary of the property." },
    overview: { type: "string", description: "Short introduction to the walkthrough." },
    overall_condition: { type: "string", enum: ["excellent", "good", "fair", "poor"] },
    rooms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "narration", "highlights", "condition", "issues", "not_visible"],
        properties: {
          name: { type: "string" },
          narration: { type: "string", description: "Walkthrough narration for this room." },
          highlights: { type: "array", items: { type: "string" } },
          condition: { type: "string", enum: ["excellent", "good", "fair", "poor"] },
          issues: { type: "array", items: ISSUE_SCHEMA },
          not_visible: { type: "array", items: { type: "string" } },
        },
      },
    },
    top_priorities: {
      type: "array",
      description: "The most important items to address or investigate, most important first.",
      items: { type: "string" },
    },
    questions_to_ask: {
      type: "array",
      description: "Questions a buyer or renter should ask the seller, agent or landlord.",
      items: { type: "string" },
    },
  },
};

export class ValidationError extends Error {}

/** Validates the request body and returns a normalized copy. Throws ValidationError. */
export function validateRequest(body) {
  if (!body || typeof body !== "object") throw new ValidationError("Request body must be a JSON object.");
  const property = body.property && typeof body.property === "object" ? body.property : {};
  const rooms = Array.isArray(body.rooms) ? body.rooms : null;
  if (!rooms || rooms.length === 0) throw new ValidationError("Add at least one room with photos.");
  if (rooms.length > MAX_ROOMS) throw new ValidationError(`At most ${MAX_ROOMS} rooms are supported.`);

  let total = 0;
  const normalizedRooms = rooms.map((room, i) => {
    const name = String(room?.name ?? "").trim() || `Room ${i + 1}`;
    const images = Array.isArray(room?.images) ? room.images : [];
    if (images.length === 0) throw new ValidationError(`"${name}" has no photos.`);
    if (images.length > MAX_IMAGES_PER_ROOM) {
      throw new ValidationError(`"${name}" has more than ${MAX_IMAGES_PER_ROOM} photos.`);
    }
    total += images.length;
    return {
      name,
      notes: String(room?.notes ?? "").trim(),
      images: images.map((img) => {
        if (!ALLOWED_MEDIA_TYPES.has(img?.media_type)) {
          throw new ValidationError(`Unsupported image type in "${name}".`);
        }
        if (typeof img.data !== "string" || img.data.length === 0) {
          throw new ValidationError(`Empty image in "${name}".`);
        }
        return { media_type: img.media_type, data: img.data };
      }),
    };
  });
  if (total > MAX_TOTAL_IMAGES) throw new ValidationError(`At most ${MAX_TOTAL_IMAGES} photos in total.`);

  return {
    property: {
      address: String(property.address ?? "").trim(),
      type: String(property.type ?? "").trim(),
      audience: String(property.audience ?? "").trim(),
      notes: String(property.notes ?? "").trim(),
    },
    rooms: normalizedRooms,
  };
}

/** Builds the user message content: property details, then each room's label and photos. */
export function buildContent({ property, rooms }) {
  const details = [
    property.address && `Address: ${property.address}`,
    property.type && `Property type: ${property.type}`,
    property.audience && `Walkthrough is for: ${property.audience}`,
    property.notes && `Notes from the person who took the photos: ${property.notes}`,
  ].filter(Boolean);

  const content = [
    {
      type: "text",
      text: details.length ? `Property details:\n${details.join("\n")}` : "No property details were provided.",
    },
  ];
  rooms.forEach((room, i) => {
    const header = `Room ${i + 1} of ${rooms.length}: ${room.name}` + (room.notes ? `\nNotes: ${room.notes}` : "");
    content.push({ type: "text", text: header });
    for (const img of room.images) {
      content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
    }
  });
  content.push({
    type: "text",
    text: `Write the walkthrough now, covering all ${rooms.length} rooms in the order given and using the room names above.`,
  });
  return content;
}

export class WalkthroughError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

/** Generates a walkthrough report for a validated request. */
export async function generateWalkthrough(request, client = new Anthropic()) {
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: REPORT_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildContent(request) }],
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") {
    throw new WalkthroughError("The model declined to analyze these photos. Try different images.", 422);
  }
  if (response.stop_reason === "max_tokens") {
    throw new WalkthroughError("The walkthrough was too long to finish. Try fewer rooms or photos.");
  }
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new WalkthroughError("The model returned no report.");
  try {
    return { report: JSON.parse(text), model: response.model };
  } catch {
    throw new WalkthroughError("The model returned a report that could not be read.");
  }
}
