const MAX_PHOTOS_PER_ROOM = 6;
const MAX_EDGE = 1568; // Larger images are downscaled by the API anyway; resizing first keeps uploads small.
const DEFAULT_ROOMS = ["Entry", "Living room", "Kitchen", "Bedroom", "Bathroom"];

const form = document.getElementById("walkthrough-form");
const roomsList = document.getElementById("rooms");
const roomTemplate = document.getElementById("room-template");
const statusEl = document.getElementById("status");
const generateBtn = document.getElementById("generate");
const reportEl = document.getElementById("report");

// Photos per room element, stored as { media_type, data, url }.
const photos = new WeakMap();

function addRoom(name = "") {
  const node = roomTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".room-name").value = name;
  photos.set(node, []);
  node.querySelector(".remove-room").addEventListener("click", () => node.remove());

  const input = node.querySelector(".room-files");
  input.addEventListener("change", () => {
    addPhotos(node, input.files);
    input.value = "";
  });
  const zone = node.querySelector(".dropzone");
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("over");
    addPhotos(node, e.dataTransfer.files);
  });
  roomsList.append(node);
}

async function addPhotos(room, fileList) {
  const list = photos.get(room);
  const files = [...fileList].filter((f) => f.type.startsWith("image/"));
  for (const file of files) {
    if (list.length >= MAX_PHOTOS_PER_ROOM) {
      setStatus(`Each room can have up to ${MAX_PHOTOS_PER_ROOM} photos.`, true);
      break;
    }
    try {
      list.push(await resizeImage(file));
    } catch {
      setStatus(`Could not read ${file.name}.`, true);
    }
  }
  renderThumbs(room);
}

function renderThumbs(room) {
  const wrap = room.querySelector(".thumbs");
  wrap.replaceChildren(
    ...photos.get(room).map((photo, i) => {
      const fig = document.createElement("figure");
      const img = document.createElement("img");
      img.src = photo.url;
      img.alt = "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "×";
      btn.setAttribute("aria-label", "Remove photo");
      btn.addEventListener("click", () => {
        photos.get(room).splice(i, 1);
        renderThumbs(room);
      });
      fig.append(img, btn);
      return fig;
    }),
  );
}

async function resizeImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { media_type: "image/jpeg", data: url.split(",")[1], url };
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function collectRequest() {
  const data = new FormData(form);
  const rooms = [...roomsList.children].map((room) => ({
    name: room.querySelector(".room-name").value.trim(),
    notes: room.querySelector(".room-notes").value.trim(),
    images: photos.get(room).map(({ media_type, data }) => ({ media_type, data })),
  }));
  return {
    property: {
      address: data.get("address"),
      type: data.get("type"),
      audience: data.get("audience"),
      notes: data.get("notes"),
    },
    rooms: rooms.filter((r) => r.images.length > 0),
  };
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = collectRequest();
  if (body.rooms.length === 0) {
    setStatus("Add photos to at least one room.", true);
    return;
  }
  generateBtn.disabled = true;
  setStatus("Walking through the property… this can take a minute or two.");
  try {
    const res = await fetch("/api/walkthrough", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Request failed (${res.status}).`);
    renderReport(payload.report, body);
    setStatus("Done.");
    reportEl.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    generateBtn.disabled = false;
  }
});

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function list(items, className) {
  const ul = el("ul", className);
  for (const item of items) ul.append(el("li", "", item));
  return ul;
}

function badge(value) {
  return el("span", `badge ${value}`, value);
}

function renderReport(report, request) {
  const photoByRoom = new Map(
    [...roomsList.children].map((room) => [room.querySelector(".room-name").value.trim(), photos.get(room)]),
  );

  const head = el("div", "report-head");
  const title = el("h2", "", report.headline);
  const printBtn = el("button", "secondary no-print", "Print / save PDF");
  printBtn.type = "button";
  printBtn.addEventListener("click", () => window.print());
  head.append(title, printBtn);

  const meta = el("p", "meta");
  if (request.property.address) meta.append(`${request.property.address} · `);
  meta.append("Overall condition: ", badge(report.overall_condition));

  const sections = [head, meta, el("p", "", report.overview)];

  if (report.top_priorities.length) {
    const box = el("div", "callout");
    box.append(el("h3", "", "Top priorities"), list(report.top_priorities));
    sections.push(box);
  }

  report.rooms.forEach((room, i) => {
    const sec = el("article", "report-room");
    const h = el("h3", "", `${i + 1}. ${room.name} `);
    h.append(badge(room.condition));
    sec.append(h);

    // Match photos by room name, falling back to position if the model renamed the room.
    const imgs = photoByRoom.get(room.name) ?? photoByRoom.get(request.rooms[i]?.name) ?? [];
    if (imgs.length) {
      const strip = el("div", "strip");
      for (const p of imgs) {
        const img = el("img");
        img.src = p.url;
        img.alt = room.name;
        strip.append(img);
      }
      sec.append(strip);
    }

    sec.append(el("p", "", room.narration));
    if (room.highlights.length) sec.append(el("h4", "", "Highlights"), list(room.highlights));
    if (room.issues.length) {
      sec.append(el("h4", "", "Issues"));
      const ul = el("ul", "issues");
      for (const issue of room.issues) {
        const li = el("li");
        const t = el("strong", "", issue.title + " ");
        t.append(badge(issue.severity));
        li.append(t, el("p", "", issue.detail), el("p", "rec", `Recommendation: ${issue.recommendation}`));
        ul.append(li);
      }
      sec.append(ul);
    }
    if (room.not_visible.length) sec.append(el("h4", "", "Couldn't assess from photos"), list(room.not_visible, "muted"));
    sections.push(sec);
  });

  if (report.questions_to_ask.length) {
    sections.push(el("h3", "", "Questions to ask"), list(report.questions_to_ask));
  }
  sections.push(
    el("p", "disclaimer", "AI-generated from photos only. Not a substitute for a licensed professional inspection."),
  );

  reportEl.replaceChildren(...sections);
  reportEl.hidden = false;
}

document.getElementById("add-room").addEventListener("click", () => addRoom());
DEFAULT_ROOMS.forEach(addRoom);
