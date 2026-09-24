"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { MEDIA_BUCKET } from "@/lib/media";
import { MAX_PHOTOS } from "@/lib/limits";
import { slugify } from "@/lib/utils";

async function requireUser() {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  return { supabase: await createClient(), userId };
}

export type ActionResult = { error?: string };

class ActionError extends Error {}

function fail(message: string, error?: { message: string } | null): never {
  if (error) console.error(message, error.message);
  throw new ActionError(message);
}

/** Runs an action body, turning expected failures into { error } so the message reaches the UI. */
async function run(body: () => Promise<void>): Promise<ActionResult> {
  try {
    await body();
    return {};
  } catch (err) {
    unstable_rethrow(err); // let redirect() through
    if (err instanceof ActionError) return { error: err.message };
    console.error(err);
    return { error: "Something went wrong. Please try again." };
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function refresh(propertyId: string) {
  revalidatePath(`/dashboard/properties/${propertyId}`);
}

/** Ensures a storage path belongs to this user and property before saving it. */
function assertOwnPath(path: string, userId: string, propertyId: string) {
  if (!path.startsWith(`${userId}/${propertyId}/`) || path.includes("..")) fail("Invalid upload path.");
}

export async function createProperty(formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireUser();
    const address = String(formData.get("address") ?? "").trim();
    if (!address) fail("Address is required.");
    const { data, error } = await supabase
      .from("properties")
      .insert({ address, mls_number: String(formData.get("mls_number") ?? "").trim() || null })
      .select("id")
      .single();
    if (error || !data) fail("Could not create the property.", error);
    redirect(`/dashboard/properties/${data.id}`);
  });
}

export async function updateProperty(propertyId: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireUser();
    const address = String(formData.get("address") ?? "").trim();
    if (!address) fail("Address is required.");
    const { error } = await supabase
      .from("properties")
      .update({
        address,
        mls_number: String(formData.get("mls_number") ?? "").trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", propertyId);
    if (error) fail("Could not save the property.", error);
    refresh(propertyId);
    revalidatePath("/dashboard");
  });
}

export async function deleteProperty(propertyId: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const folder = `${userId}/${propertyId}`;
    const { data: files } = await supabase.storage.from(MEDIA_BUCKET).list(folder, { limit: 1000 });
    if (files?.length) {
      await supabase.storage.from(MEDIA_BUCKET).remove(files.map((f) => `${folder}/${f.name}`));
    }
    const { error } = await supabase.from("properties").delete().eq("id", propertyId);
    if (error) fail("Could not delete the property.", error);
    revalidatePath("/dashboard");
    redirect("/dashboard");
  });
}

/** Records uploaded photos. Each photo starts in its own room; the agent then merges and renames. */
export async function addPhotos(propertyId: string, paths: string[]): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    paths.forEach((p) => assertOwnPath(p, userId, propertyId));

    const { data: rooms, error: roomsError } = await supabase
      .from("rooms")
      .select("order_index, photos(count)")
      .eq("property_id", propertyId);
    if (roomsError) fail("Could not load rooms.", roomsError);
    const existing = (rooms ?? []).reduce((n, r) => n + ((r.photos as unknown as { count: number }[])[0]?.count ?? 0), 0);
    if (existing + paths.length > MAX_PHOTOS) fail(`A property can have at most ${MAX_PHOTOS} photos.`);

    const start = (rooms ?? []).reduce((max, r) => Math.max(max, r.order_index + 1), 0);
    const { data: created, error } = await supabase
      .from("rooms")
      .insert(paths.map((_, i) => ({ property_id: propertyId, label: `Room ${start + i + 1}`, order_index: start + i })))
      .select("id, order_index");
    if (error || !created) fail("Could not create rooms.", error);

    const byOrder = new Map(created.map((r) => [r.order_index, r.id]));
    const { error: photoError } = await supabase.from("photos").insert(
      paths.map((path, i) => ({ room_id: byOrder.get(start + i)!, storage_path: path, is_primary: true })),
    );
    if (photoError) fail("Could not save photos.", photoError);
    refresh(propertyId);
  });
}

export async function renameRoom(propertyId: string, roomId: string, label: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireUser();
    const clean = label.trim().slice(0, 80);
    if (!clean) fail("Room name can't be empty.");
    const { error } = await supabase.from("rooms").update({ label: clean }).eq("id", roomId);
    if (error) fail("Could not rename the room.", error);
    refresh(propertyId);
  });
}

export async function reorderRooms(propertyId: string, orderedIds: string[]): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireUser();
    const results = await Promise.all(
      orderedIds.map((id, i) => supabase.from("rooms").update({ order_index: i }).eq("id", id).eq("property_id", propertyId)),
    );
    const failed = results.find((r) => r.error);
    if (failed) fail("Could not reorder rooms.", failed.error);
    refresh(propertyId);
  });
}

async function removeObjects(supabase: Awaited<ReturnType<typeof createClient>>, paths: string[]) {
  if (paths.length) await supabase.storage.from(MEDIA_BUCKET).remove(paths);
}

export async function deleteRoom(propertyId: string, roomId: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireUser();
    const { data: photos } = await supabase.from("photos").select("storage_path").eq("room_id", roomId);
    const { error } = await supabase.from("rooms").delete().eq("id", roomId);
    if (error) fail("Could not delete the room.", error);
    await removeObjects(supabase, (photos ?? []).map((p) => p.storage_path));
    refresh(propertyId);
  });
}

/** Moves a photo into another room, deleting the source room if it ends up empty. */
export async function movePhoto(propertyId: string, photoId: string, targetRoomId: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireUser();
    const { data: photo, error: getError } = await supabase.from("photos").select("room_id").eq("id", photoId).single();
    if (getError || !photo) fail("Photo not found.", getError);
    if (photo.room_id === targetRoomId) return;

    const { count } = await supabase.from("photos").select("id", { count: "exact", head: true }).eq("room_id", targetRoomId);
    const { error } = await supabase
      .from("photos")
      .update({ room_id: targetRoomId, is_primary: !count, order_index: count ?? 0 })
      .eq("id", photoId);
    if (error) fail("Could not move the photo.", error);
    // Hotspots on this photo that led to its new room now point at the room you're already in.
    await supabase.from("hotspots").delete().eq("photo_id", photoId).eq("to_room_id", targetRoomId);

    const { data: remaining } = await supabase
      .from("photos")
      .select("id, is_primary")
      .eq("room_id", photo.room_id)
      .order("order_index");
    if (!remaining?.length) {
      await supabase.from("rooms").delete().eq("id", photo.room_id);
    } else if (!remaining.some((p) => p.is_primary)) {
      await supabase.from("photos").update({ is_primary: true }).eq("id", remaining[0].id);
    }
    refresh(propertyId);
  });
}

export async function setPrimaryPhoto(propertyId: string, photoId: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireUser();
    const { data: photo } = await supabase.from("photos").select("room_id").eq("id", photoId).single();
    if (!photo) fail("Photo not found.");
    await supabase.from("photos").update({ is_primary: false }).eq("room_id", photo.room_id);
    const { error } = await supabase.from("photos").update({ is_primary: true }).eq("id", photoId);
    if (error) fail("Could not update the photo.", error);
    refresh(propertyId);
  });
}

export async function deletePhoto(propertyId: string, photoId: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireUser();
    const { data: photo } = await supabase.from("photos").select("room_id, storage_path, is_primary").eq("id", photoId).single();
    if (!photo) fail("Photo not found.");
    const { error } = await supabase.from("photos").delete().eq("id", photoId);
    if (error) fail("Could not delete the photo.", error);
    await removeObjects(supabase, [photo.storage_path]);

    const { data: remaining } = await supabase.from("photos").select("id").eq("room_id", photo.room_id).order("order_index");
    if (!remaining?.length) await supabase.from("rooms").delete().eq("id", photo.room_id);
    else if (photo.is_primary) await supabase.from("photos").update({ is_primary: true }).eq("id", remaining[0].id);
    refresh(propertyId);
  });
}

export async function setFloorPlan(propertyId: string, path: string | null): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    if (path) assertOwnPath(path, userId, propertyId);
    const { data: prev } = await supabase.from("properties").select("floor_plan_path").eq("id", propertyId).single();
    const { error } = await supabase.from("properties").update({ floor_plan_path: path }).eq("id", propertyId);
    if (error) fail("Could not save the floor plan.", error);
    if (prev?.floor_plan_path && prev.floor_plan_path !== path) await removeObjects(supabase, [prev.floor_plan_path]);
    if (!path) await supabase.from("rooms").update({ floorplan_x: null, floorplan_y: null }).eq("property_id", propertyId);
    refresh(propertyId);
  });
}

/** Places a room node on the floor plan (normalized 0..1), or removes it with null. */
export async function placeRoom(propertyId: string, roomId: string, position: { x: number; y: number } | null): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireUser();
    const { error } = await supabase
      .from("rooms")
      .update(position ? { floorplan_x: clamp01(position.x), floorplan_y: clamp01(position.y) } : { floorplan_x: null, floorplan_y: null })
      .eq("id", roomId)
      .eq("property_id", propertyId);
    if (error) fail("Could not place the room.", error);
    refresh(propertyId);
  });
}

/** Adds a hotspot on a photo (normalized 0..1) that leads to another room. */
export async function addHotspot(
  propertyId: string,
  photoId: string,
  toRoomId: string,
  position: { x: number; y: number },
): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireUser();
    const { data: photo } = await supabase.from("photos").select("room_id").eq("id", photoId).single();
    if (!photo) fail("Photo not found.");
    if (photo.room_id === toRoomId) fail("A hotspot has to lead to a different room.");
    const { error } = await supabase
      .from("hotspots")
      .insert({ photo_id: photoId, to_room_id: toRoomId, x: clamp01(position.x), y: clamp01(position.y) });
    if (error) fail("Could not add the hotspot.", error);
    refresh(propertyId);
  });
}

/** Moves a hotspot or changes the room it leads to. */
export async function updateHotspot(
  propertyId: string,
  hotspotId: string,
  change: { toRoomId?: string; position?: { x: number; y: number } },
): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireUser();
    if (change.toRoomId) {
      const { data: hotspot } = await supabase.from("hotspots").select("photos(room_id)").eq("id", hotspotId).single();
      const photo = hotspot?.photos as unknown as { room_id: string } | null;
      if (!photo) fail("Hotspot not found.");
      if (photo.room_id === change.toRoomId) fail("A hotspot has to lead to a different room.");
    }
    const { error } = await supabase
      .from("hotspots")
      .update({
        ...(change.toRoomId && { to_room_id: change.toRoomId }),
        ...(change.position && { x: clamp01(change.position.x), y: clamp01(change.position.y) }),
      })
      .eq("id", hotspotId);
    if (error) fail("Could not update the hotspot.", error);
    refresh(propertyId);
  });
}

export async function deleteHotspot(propertyId: string, hotspotId: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("hotspots").delete().eq("id", hotspotId);
    if (error) fail("Could not delete the hotspot.", error);
    refresh(propertyId);
  });
}

export async function setPublished(propertyId: string, published: boolean): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireUser();
    const { data: property } = await supabase.from("properties").select("address, slug").eq("id", propertyId).single();
    if (!property) fail("Property not found.");
    if (published) {
      const { count } = await supabase.from("rooms").select("id", { count: "exact", head: true }).eq("property_id", propertyId);
      if (!count) fail("Add at least one room before publishing.");
    }
    const { error } = await supabase
      .from("properties")
      .update(
        published
          ? { status: "published", slug: property.slug ?? slugify(property.address), published_at: new Date().toISOString() }
          : { status: "draft" },
      )
      .eq("id", propertyId);
    if (error) fail("Could not update publishing.", error);
    refresh(propertyId);
    revalidatePath("/dashboard");
    if (property.slug) revalidatePath(`/p/${property.slug}`);
  });
}
