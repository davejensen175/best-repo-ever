# AI Property Walkthroughs — Build Spec

Working name: TBD. Domain candidate from source: nextroom.co

## 1. What this is

A tool that takes a listing's existing photos and floor plan and produces an
interactive walkthrough page buyers can move through, plus virtual furnishing
they can toggle on and off. Sold to real estate agents per listing.

The wedge vs. Zillow 3D Home and Matterport: those require someone to physically
walk the property with a capture device or phone rig. This works from assets the
agent already paid a photographer for.

## 2. Scope discipline (read this before building)

True photo-to-3D reconstruction from ~25 unordered listing photos is a research
problem, not a weekend build. Do not start there.

**Phase 1 (this spec):** a node-based walkthrough. Each room is a node anchored to
a position on the floor plan. Buyers click through rooms via hotspots and see the
floor plan update to show where they are standing. Feels like moving through the
house without reconstructing geometry.

**Phase 2 (not now):** actual 3D reconstruction, Gaussian splatting, or
photogrammetry from denser capture.

Ship Phase 1 and get an agent to pay for it before touching Phase 2.

## 3. MVP user flows

### 3.1 Agent flow
1. Sign up, create a property.
2. Upload listing photos (10–40 JPEGs) and a floor plan image or PDF.
3. System proposes a room label for each photo (kitchen, primary bedroom, etc.).
   Agent corrects any wrong ones.
4. Agent drags each room node onto its spot on the floor plan.
5. Agent picks which empty rooms to virtually furnish and in which style.
6. System generates furnished variants. Agent approves or regenerates each.
7. Agent publishes. Gets a shareable URL plus an iframe embed snippet.

### 3.2 Buyer flow
1. Opens the property URL, mobile first.
2. Sees the entry photo full bleed, floor plan minimap in the corner.
3. Taps a hotspot or a room on the minimap to move to that room.
4. Toggles "furnished" on and off. Cycles furnishing style if more than one exists.
5. Optional: contact-agent button that captures name, email, phone.

## 4. Non-negotiable constraints

- **Virtual staging must be disclosed.** Every furnished image needs a visible
  "virtually staged" label. Several states and most MLS rules require this, and
  NAR guidance treats undisclosed staging as misleading. Build the label into the
  renderer so it cannot be turned off.
- **Never alter structural reality.** Furnishing adds furniture. It must not
  remove water stains, change countertops, hide damage, or repaint. That crosses
  from staging into misrepresentation. Enforce this in the generation prompt and
  spot check outputs.
- **Agent owns the photos, not you.** Terms should be clear that the agent
  warrants they have rights to the uploads.

## 5. Suggested stack

- Next.js (App Router) + TypeScript, deployed on Vercel
- Tailwind + shadcn/ui
- Supabase: Postgres, Auth, Storage (or S3 + Clerk if preferred)
- Image generation: an inpainting-capable model for virtual staging. Mask the
  floor/wall region, generate furniture into it. Evaluate 2–3 providers on the
  same 5 test rooms before committing.
- Room classification: a vision model call per photo. Cheap, good enough.
- Floor plan: render as a static image with absolutely positioned node markers.
  No CAD parsing in v1.
- Stripe for payments

## 6. Data model (starting point)

```
users            id, email, name, brokerage, created_at
properties       id, user_id, address, mls_number, status(draft|published),
                 slug, floor_plan_url, published_at
rooms            id, property_id, label, order_index,
                 floorplan_x, floorplan_y          -- normalized 0..1
photos           id, room_id, original_url, is_primary
staged_images    id, photo_id, style, output_url, status(pending|ready|failed),
                 approved_at
hotspots         id, from_room_id, to_room_id, x, y  -- normalized on source photo
leads            id, property_id, name, email, phone, created_at
```

## 7. Build order

1. Auth + property CRUD + photo upload to storage. No AI yet.
2. Public viewer page: photos, manual room ordering, click-to-next-room. Ugly is
   fine. This alone is already better than a photo carousel.
3. Floor plan upload + drag nodes onto it + minimap in the viewer.
4. Hotspot editor: click a spot on a photo, pick the destination room.
5. Auto room labeling from the vision model.
6. Virtual staging pipeline with approve/regenerate loop.
7. Embed snippet + lead capture form.
8. Stripe, per-listing pricing.

Steps 1–3 are the demo you show the first agent. Do not wait for 6.

## 8. Pricing to test

Per listing, one time, covering the life of the listing. Start at $75–$150 and
watch what agents push back on. Do not build subscriptions in v1. Free for the
first 3–5 agents in exchange for feedback and a usable case study.

## 9. Open questions to resolve with real agents

- Do they actually have floor plans for most listings, or only some?
- Who pays, the agent or the seller out of the marketing budget?
- Does their MLS allow an external tour link in the listing, and in which field?
- Do they want branding (their headshot and logo) on the page, or clean?
- Is virtual furnishing the draw, or is the walkthrough navigation the draw?
  This changes what to build next.

## 10. Success criteria for the MVP

One agent uses this on a real, live listing without being asked to, and a second
agent hears about it from the first. Everything else is a vanity metric at this
stage.
