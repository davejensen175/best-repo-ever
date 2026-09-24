"use client";

import { useRef, useState } from "react";
import { FileImage, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { pdfToPng, resizeImage, uploadMedia } from "@/lib/upload";
import { useAction } from "@/lib/use-action";
import { placeRoom, setFloorPlan } from "../../actions";

type NodeRoom = { id: string; label: string; floorplan_x: number | null; floorplan_y: number | null };
type Position = { x: number; y: number };

export function FloorPlanEditor({
  propertyId,
  userId,
  floorPlanUrl,
  rooms,
}: {
  propertyId: string;
  userId: string;
  floorPlanUrl: string | null;
  rooms: NodeRoom[];
}) {
  const { pending, error, setError, run } = useAction();
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  // Local overrides so dragging is smooth before the server round trip lands.
  // The parent re-keys this component when the floor plan changes, which clears them.
  const [overrides, setPositions] = useState<Record<string, Position | null>>({});
  const planRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);
  const positions: Record<string, Position | null> = Object.fromEntries(
    rooms.map((r) => [
      r.id,
      r.id in overrides
        ? overrides[r.id]
        : r.floorplan_x != null && r.floorplan_y != null
          ? { x: r.floorplan_x, y: r.floorplan_y }
          : null,
    ]),
  );

  async function uploadPlan(file: File) {
    setError(null);
    setUploading(true);
    try {
      const png =
        file.type === "application/pdf" ? await pdfToPng(file) : await resizeImage(file, 2400, "image/png");
      const path = await uploadMedia(userId, propertyId, png, "png");
      run(() => setFloorPlan(propertyId, path));
    } catch (err) {
      setError(`Could not use that file: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setUploading(false);
    }
  }

  function pointToPosition(clientX: number, clientY: number): Position {
    const rect = planRef.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return { x: clamp((clientX - rect.left) / rect.width), y: clamp((clientY - rect.top) / rect.height) };
  }

  function save(roomId: string, position: Position | null) {
    setPositions((p) => ({ ...p, [roomId]: position }));
    run(() => placeRoom(propertyId, roomId, position));
  }

  const busy = pending || uploading;
  const unplaced = rooms.filter((r) => !positions[r.id]);

  if (!floorPlanUrl) {
    return (
      <div className="grid gap-2">
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center hover:bg-accent/50",
            busy && "pointer-events-none opacity-60",
          )}
        >
          <FileImage className="size-6 text-muted-foreground" />
          <span className="font-medium">{busy ? "Uploading floor plan…" : "Upload a floor plan"}</span>
          <span className="text-sm text-muted-foreground">Image or PDF (the first page is used)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadPlan(file);
              e.target.value = "";
            }}
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  const selectedRoom = rooms.find((r) => r.id === selected);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
      <div className="grid gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {selectedRoom
            ? `Click the plan to place "${selectedRoom.label}".`
            : unplaced.length
              ? "Pick a room on the right, then click where it is on the plan. Drag markers to adjust."
              : "All rooms placed. Drag markers to adjust."}
        </p>
        <div
          ref={planRef}
          data-testid="floor-plan"
          className={cn(
            "relative touch-none overflow-hidden rounded-xl border bg-white select-none",
            selectedRoom && "cursor-crosshair",
          )}
          onClick={(e) => {
            if (!selected) return;
            save(selected, pointToPosition(e.clientX, e.clientY));
            setSelected(null);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={floorPlanUrl} alt="Floor plan" className="block w-full" draggable={false} />
          {rooms.map((room, index) => {
            const pos = positions[room.id];
            if (!pos) return null;
            return (
              <button
                key={room.id}
                type="button"
                aria-label={`${room.label} marker`}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab items-center gap-1 rounded-full bg-brand px-2 py-1 text-xs font-semibold text-white shadow-md active:cursor-grabbing"
                style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  dragRef.current = { id: room.id, moved: false };
                }}
                onPointerMove={(e) => {
                  if (dragRef.current?.id !== room.id) return;
                  dragRef.current.moved = true;
                  const next = pointToPosition(e.clientX, e.clientY);
                  setPositions((p) => ({ ...p, [room.id]: next }));
                }}
                onPointerUp={(e) => {
                  const drag = dragRef.current;
                  dragRef.current = null;
                  if (drag?.id === room.id && drag.moved) save(room.id, pointToPosition(e.clientX, e.clientY));
                }}
              >
                <span className="tabular-nums">{index + 1}</span>
                <span className="max-w-28 truncate">{room.label}</span>
              </button>
            );
          })}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="grid content-start gap-3">
        <ul className="grid gap-1">
          {rooms.map((room, index) => {
            const placed = Boolean(positions[room.id]);
            return (
              <li key={room.id} className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSelected(selected === room.id ? null : room.id)}
                  className={cn(
                    "flex flex-1 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm",
                    selected === room.id ? "border-brand bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <span className="w-5 text-muted-foreground tabular-nums">{index + 1}</span>
                  <span className="flex-1 truncate">{room.label}</span>
                  <span className={cn("text-xs", placed ? "text-brand" : "text-muted-foreground")}>
                    {placed ? "placed" : "not placed"}
                  </span>
                </button>
                {placed && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Remove ${room.label} from plan`}
                    disabled={busy}
                    onClick={() => save(room.id, null)}
                  >
                    <X />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild disabled={busy}>
            <label className="cursor-pointer">
              Replace plan
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadPlan(file);
                  e.target.value = "";
                }}
              />
            </label>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={busy}
            onClick={() => confirm("Remove the floor plan and all room placements?") && run(() => setFloorPlan(propertyId, null))}
          >
            Remove plan
          </Button>
        </div>
      </div>
    </div>
  );
}
