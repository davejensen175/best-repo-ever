/** A tappable spot on a photo that leads to another room. x and y are normalized 0..1 on the photo. */
export type Hotspot = {
  id: string;
  to_room_id: string;
  x: number;
  y: number;
};

export type Photo = {
  id: string;
  room_id: string;
  storage_path: string;
  is_primary: boolean;
  order_index: number;
  hotspots: Hotspot[];
};

export type Room = {
  id: string;
  label: string;
  order_index: number;
  floorplan_x: number | null;
  floorplan_y: number | null;
  photos: Photo[];
};

export type Property = {
  id: string;
  address: string;
  mls_number: string | null;
  status: "draft" | "published";
  slug: string | null;
  floor_plan_path: string | null;
  published_at: string | null;
};

export type PropertyWithRooms = Property & { rooms: Room[] };

export const PROPERTY_SELECT =
  "id, address, mls_number, status, slug, floor_plan_path, published_at, " +
  "rooms(id, label, order_index, floorplan_x, floorplan_y, " +
  "photos(id, room_id, storage_path, is_primary, order_index, hotspots(id, to_room_id, x, y)))";

/** Sorts rooms and each room's photos into display order (primary photo first). */
export function sortRooms(rooms: Room[]): Room[] {
  return [...rooms]
    .sort((a, b) => a.order_index - b.order_index)
    .map((room) => ({
      ...room,
      photos: [...room.photos].sort(
        (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.order_index - b.order_index,
      ),
    }));
}
