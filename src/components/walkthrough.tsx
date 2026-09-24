"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, List, Map as MapIcon, X } from "lucide-react";
import { mediaUrl } from "@/lib/media";
import type { Room } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  address: string;
  rooms: Room[];
  floorPlanUrl: string | null;
  /** Set on the agent's draft preview to show a way back to the editor. */
  previewBackHref?: string;
};

export function Walkthrough({ address, rooms, floorPlanUrl, previewBackHref }: Props) {
  const [roomIndex, setRoomIndex] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  // Aspect ratio per photo, so hotspots can be placed on the letterboxed image.
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const room = rooms[roomIndex];
  const photo = room?.photos[photoIndex] ?? room?.photos[0];
  const hasPlan = Boolean(floorPlanUrl) && rooms.some((r) => r.floorplan_x != null);

  const goToRoom = useCallback(
    (index: number, photo: "first" | "last" = "first") => {
      if (index < 0 || index >= rooms.length) return;
      setRoomIndex(index);
      setPhotoIndex(photo === "first" ? 0 : rooms[index].photos.length - 1);
      setListOpen(false);
    },
    [rooms],
  );

  /** Steps one photo forward or back, crossing into the next or previous room at the ends. */
  const step = useCallback(
    (delta: 1 | -1) => {
      const next = photoIndex + delta;
      if (next >= 0 && next < room.photos.length) setPhotoIndex(next);
      else goToRoom(roomIndex + delta, delta === 1 ? "first" : "last");
    },
    [goToRoom, photoIndex, room, roomIndex],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "Escape") {
        setMapOpen(false);
        setListOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  if (!room || !photo) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
        This walkthrough has no photos yet.
      </main>
    );
  }

  const prevRoom = rooms[roomIndex - 1];
  const nextRoom = rooms[roomIndex + 1];
  const ratio = ratios[photo.id];
  const hotspots = photo.hotspots.flatMap((h) => {
    const index = rooms.findIndex((r) => r.id === h.to_room_id);
    return index >= 0 && index !== roomIndex ? [{ ...h, index, label: rooms[index].label }] : [];
  });

  function measure(img: HTMLImageElement | null, id: string) {
    if (!img?.complete || !img.naturalWidth) return;
    const value = img.naturalWidth / img.naturalHeight;
    setRatios((r) => (r[id] === value ? r : { ...r, [id]: value }));
  }

  return (
    <main
      className="fixed inset-0 overflow-hidden bg-black text-white select-none"
      onTouchStart={(e) => (touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start || mapOpen || listOpen) return;
        const dx = e.changedTouches[0].clientX - start.x;
        const dy = e.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
      }}
    >
      <Preload rooms={[prevRoom, nextRoom]} />

      {/* Tap zones for moving between photos on either side of the image. */}
      <button type="button" aria-label="Previous" className="absolute inset-y-16 left-0 w-1/4" onClick={() => step(-1)} />
      <button type="button" aria-label="Next" className="absolute inset-y-16 right-0 w-1/4" onClick={() => step(1)} />

      {/* The photo sits above the tap zones but lets clicks through, except on its hotspots.
          Once the image's aspect ratio is known, the frame shrinks to the image so hotspot
          positions line up with the photo rather than the letterbox. */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center" style={{ containerType: "size" }}>
        <div
          className="relative"
          style={ratio ? { width: `min(100cqw, ${ratio} * 100cqh)`, aspectRatio: ratio } : { width: "100%", height: "100%" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={photo.id}
            ref={(img) => measure(img, photo.id)}
            onLoad={(e) => measure(e.currentTarget, photo.id)}
            src={mediaUrl(photo.storage_path)}
            alt={`${room.label}, photo ${photoIndex + 1} of ${room.photos.length}`}
            className="size-full animate-[fade-in_250ms_ease-out] object-contain"
            draggable={false}
          />
          {ratio &&
            hotspots.map((h) => (
              <button
                key={h.id}
                type="button"
                aria-label={`Walk to ${h.label}`}
                onClick={() => goToRoom(h.index)}
                className="group pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
              >
                <span className="relative grid size-11 place-items-center rounded-full border-2 border-white bg-white/25 shadow-lg backdrop-blur transition group-hover:scale-110">
                  <span aria-hidden className="absolute inset-0 animate-ping rounded-full border-2 border-white/60" />
                  <ArrowUpRight className="size-5" />
                </span>
                <span className="max-w-32 truncate rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium">{h.label}</span>
              </button>
            ))}
        </div>
      </div>

      <header className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="truncate text-xs text-white/70">{address}</p>
          <h1 className="truncate text-lg font-semibold" aria-live="polite">
            {room.label}
          </h1>
          <p className="text-xs text-white/70 tabular-nums">
            Room {roomIndex + 1} of {rooms.length}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {previewBackHref && (
            <Link href={previewBackHref} className="rounded-full bg-white/15 px-3 py-2 text-sm backdrop-blur">
              Exit preview
            </Link>
          )}
          <button
            type="button"
            onClick={() => setListOpen(true)}
            className="rounded-full bg-white/15 p-2 backdrop-blur"
            aria-label="All rooms"
          >
            <List className="size-5" />
          </button>
        </div>
      </header>

      {hasPlan && (
        <Minimap
          floorPlanUrl={floorPlanUrl!}
          rooms={rooms}
          currentIndex={roomIndex}
          expanded={mapOpen}
          onExpand={() => setMapOpen(true)}
          onClose={() => setMapOpen(false)}
          onSelect={(i) => {
            goToRoom(i);
            setMapOpen(false);
          }}
        />
      )}

      <footer className="absolute inset-x-0 bottom-0 grid gap-3 bg-gradient-to-t from-black/80 to-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {room.photos.length > 1 && (
          <div className="flex justify-center gap-1.5" aria-label="Photos in this room">
            {room.photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                aria-label={`Photo ${i + 1}`}
                aria-current={i === photoIndex}
                onClick={() => setPhotoIndex(i)}
                className={cn("size-2 rounded-full", i === photoIndex ? "bg-white" : "bg-white/40")}
              />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <RoomButton direction="prev" room={prevRoom} onClick={() => goToRoom(roomIndex - 1)} />
          <RoomButton direction="next" room={nextRoom} onClick={() => goToRoom(roomIndex + 1)} />
        </div>
      </footer>

      {listOpen && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-black/90 p-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
          <div className="mx-auto max-w-md">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Rooms</h2>
              <button type="button" onClick={() => setListOpen(false)} aria-label="Close" className="rounded-full p-2 hover:bg-white/10">
                <X className="size-5" />
              </button>
            </div>
            <ol className="grid gap-2">
              {rooms.map((r, i) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => goToRoom(i)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/10",
                      i === roomIndex && "bg-white/15",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl(r.photos[0].storage_path)} alt="" className="h-12 w-16 rounded object-cover" loading="lazy" />
                    <span className="w-5 text-white/60 tabular-nums">{i + 1}</span>
                    <span className="font-medium">{r.label}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </main>
  );
}

function RoomButton({ direction, room, onClick }: { direction: "prev" | "next"; room?: Room; onClick: () => void }) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!room}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-1 rounded-full bg-white/15 px-3 py-2.5 text-sm font-medium backdrop-blur disabled:invisible",
        direction === "next" && "flex-row-reverse text-right",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{room ? room.label : ""}</span>
    </button>
  );
}

function Minimap({
  floorPlanUrl,
  rooms,
  currentIndex,
  expanded,
  onExpand,
  onClose,
  onSelect,
}: {
  floorPlanUrl: string;
  rooms: Room[];
  currentIndex: number;
  expanded: boolean;
  onExpand: () => void;
  onClose: () => void;
  onSelect: (index: number) => void;
}) {
  const plan = (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={floorPlanUrl} alt="Floor plan" className="block w-full" draggable={false} />
      {rooms.map((r, i) => {
        if (r.floorplan_x == null || r.floorplan_y == null) return null;
        const current = i === currentIndex;
        const style = { left: `${r.floorplan_x * 100}%`, top: `${r.floorplan_y * 100}%` };
        if (!expanded) {
          return (
            <span
              key={r.id}
              aria-hidden
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 rounded-full",
                current ? "z-10 size-3.5 animate-pulse bg-brand ring-4 ring-brand/30" : "size-2.5 bg-neutral-500",
              )}
              style={style}
            />
          );
        }
        return (
          <button
            key={r.id}
            type="button"
            aria-label={`Go to ${r.label}`}
            aria-current={current ? "location" : undefined}
            onClick={() => onSelect(i)}
            className={cn(
              "absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-white shadow",
              current ? "z-10 bg-brand ring-4 ring-brand/30" : "bg-neutral-600",
            )}
            style={style}
          >
            <span className="max-w-32 truncate">{r.label}</span>
          </button>
        );
      })}
    </div>
  );

  if (expanded) {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 p-4 backdrop-blur" onClick={onClose}>
        <div className="relative w-full max-w-2xl overflow-hidden rounded-xl bg-white p-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close floor plan"
            className="absolute top-2 right-2 z-20 rounded-full bg-black/70 p-1.5 text-white"
          >
            <X className="size-4" />
          </button>
          {plan}
          <p className="mt-2 text-center text-sm text-neutral-600">Tap a room to go there</p>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label="Open floor plan"
      className="absolute right-4 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4.5rem)] z-10 w-32 overflow-hidden rounded-lg bg-white p-1 shadow-lg sm:w-56"
    >
      {plan}
      <span className="absolute top-1 left-1 rounded bg-black/60 p-0.5">
        <MapIcon className="size-3 text-white" />
      </span>
    </button>
  );
}

/** Warms the cache for neighbouring rooms so moving between them feels instant. */
function Preload({ rooms }: { rooms: (Room | undefined)[] }) {
  return (
    <div hidden>
      {rooms.map((r) =>
        r ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={r.id} src={mediaUrl(r.photos[0].storage_path)} alt="" />
        ) : null,
      )}
    </div>
  );
}
