"use client";

import { useRef, useState } from "react";
import { ArrowUpRight, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mediaUrl } from "@/lib/media";
import type { Room } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAction } from "@/lib/use-action";
import { addHotspot, deleteHotspot, updateHotspot } from "../../actions";

type Position = { x: number; y: number };

export function HotspotEditor({ propertyId, rooms }: { propertyId: string; rooms: Room[] }) {
  const { pending, error, run } = useAction();
  const photos = rooms.flatMap((room) => room.photos.map((photo, i) => ({ ...photo, room, number: i + 1 })));
  const [photoId, setPhotoId] = useState(photos[0]?.id);
  // A new spot the agent clicked, waiting for a destination room.
  const [draft, setDraft] = useState<Position | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Local positions so dragging is smooth before the server round trip lands.
  const [overrides, setOverrides] = useState<Record<string, Position>>({});
  const photoRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);

  if (rooms.length < 2) {
    return <p className="text-sm text-muted-foreground">Add at least two rooms to link them with hotspots.</p>;
  }

  const photo = photos.find((p) => p.id === photoId) ?? photos[0];
  const labelOf = (roomId: string) => rooms.find((r) => r.id === roomId)?.label ?? "Unknown room";
  const destinations = rooms.filter((r) => r.id !== photo.room.id);
  const hotspots = photo.hotspots.filter((h) => h.to_room_id !== photo.room.id);
  const selectedHotspot = hotspots.find((h) => h.id === selected);

  function selectPhoto(id: string) {
    setPhotoId(id);
    setDraft(null);
    setSelected(null);
  }

  function pointToPosition(clientX: number, clientY: number): Position {
    const rect = photoRef.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return { x: clamp((clientX - rect.left) / rect.width), y: clamp((clientY - rect.top) / rect.height) };
  }

  const positionOf = (h: { id: string; x: number; y: number }) => overrides[h.id] ?? { x: h.x, y: h.y };

  return (
    <div className="grid gap-4">
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Choose a photo">
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-label={`${p.room.label} photo ${p.number}`}
            aria-pressed={p.id === photo.id}
            onClick={() => selectPhoto(p.id)}
            className={cn(
              "relative shrink-0 overflow-hidden rounded-md border-2",
              p.id === photo.id ? "border-brand" : "border-transparent opacity-70 hover:opacity-100",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl(p.storage_path)} alt="" className="h-14 w-20 object-cover" loading="lazy" />
            <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 text-left text-[10px] text-white">
              {p.room.label}
            </span>
            {p.hotspots.length > 0 && (
              <span className="absolute top-0.5 right-0.5 rounded-full bg-brand px-1.5 text-[10px] font-semibold text-white tabular-nums">
                {p.hotspots.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <div className="grid content-start gap-2">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {draft
              ? "Pick the room this spot leads to."
              : "Click a doorway or opening on the photo to add a hotspot. Drag hotspots to adjust."}
          </p>
          <div
            ref={photoRef}
            data-testid="hotspot-photo"
            className="relative mx-auto w-fit max-w-full cursor-crosshair touch-none overflow-hidden rounded-xl border bg-black select-none"
            onClick={(e) => {
              setSelected(null);
              setDraft(pointToPosition(e.clientX, e.clientY));
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaUrl(photo.storage_path)}
              alt={`${photo.room.label}, photo ${photo.number}`}
              className="block max-h-[70vh] w-auto max-w-full"
              draggable={false}
            />
            {hotspots.map((h) => {
              const pos = positionOf(h);
              return (
                <button
                  key={h.id}
                  type="button"
                  aria-label={`Hotspot to ${labelOf(h.to_room_id)}`}
                  aria-pressed={h.id === selected}
                  className={cn(
                    "absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-white shadow-md active:cursor-grabbing",
                    h.id === selected ? "bg-brand ring-4 ring-white/70" : "bg-brand/90",
                  )}
                  style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    dragRef.current = { id: h.id, moved: false };
                  }}
                  onPointerMove={(e) => {
                    if (dragRef.current?.id !== h.id) return;
                    dragRef.current.moved = true;
                    const next = pointToPosition(e.clientX, e.clientY);
                    setOverrides((o) => ({ ...o, [h.id]: next }));
                  }}
                  onPointerUp={(e) => {
                    const drag = dragRef.current;
                    dragRef.current = null;
                    if (drag?.id !== h.id) return;
                    if (drag.moved) {
                      const position = pointToPosition(e.clientX, e.clientY);
                      setOverrides((o) => ({ ...o, [h.id]: position }));
                      run(() => updateHotspot(propertyId, h.id, { position }));
                    } else {
                      setDraft(null);
                      setSelected(h.id === selected ? null : h.id);
                    }
                  }}
                >
                  <ArrowUpRight className="size-3.5" />
                  <span className="max-w-28 truncate">{labelOf(h.to_room_id)}</span>
                </button>
              );
            })}
            {draft && (
              <span
                aria-hidden
                className="absolute size-5 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-2 border-white bg-brand shadow-md"
                style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}
              />
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="grid content-start gap-3 text-sm">
          {draft ? (
            <div className="grid gap-2" role="group" aria-label="Hotspot destination">
              <p className="font-medium">This spot leads to…</p>
              {destinations.map((room) => (
                <Button
                  key={room.id}
                  variant="outline"
                  className="justify-start"
                  disabled={pending}
                  onClick={() => {
                    const position = draft;
                    setDraft(null);
                    run(() => addHotspot(propertyId, photo.id, room.id, position));
                  }}
                >
                  {room.label}
                </Button>
              ))}
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          ) : selectedHotspot ? (
            <div className="grid gap-2">
              <label className="grid gap-1">
                <span className="font-medium">Leads to</span>
                <select
                  className="h-9 rounded-md border bg-transparent px-2"
                  value={selectedHotspot.to_room_id}
                  disabled={pending}
                  onChange={(e) => {
                    const toRoomId = e.target.value;
                    run(() => updateHotspot(propertyId, selectedHotspot.id, { toRoomId }));
                  }}
                >
                  {destinations.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => {
                    setSelected(null);
                    run(() => deleteHotspot(propertyId, selectedHotspot.id));
                  }}
                >
                  <Trash2 /> Delete hotspot
                </Button>
                <Button variant="ghost" onClick={() => setSelected(null)}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              <p className="font-medium">
                Hotspots on this photo <span className="text-muted-foreground tabular-nums">({hotspots.length})</span>
              </p>
              {hotspots.length ? (
                <ul className="grid gap-1">
                  {hotspots.map((h) => (
                    <li key={h.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSelected(h.id)}
                        className="flex flex-1 items-center gap-2 rounded-md border px-2 py-1.5 text-left hover:bg-accent/50"
                      >
                        <ArrowUpRight className="size-4 text-brand" />
                        <span className="truncate">{labelOf(h.to_room_id)}</span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Delete hotspot to ${labelOf(h.to_room_id)}`}
                        disabled={pending}
                        onClick={() => run(() => deleteHotspot(propertyId, h.id))}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">None yet. Buyers can still use the arrows and the room list.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
