"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MAX_PHOTO_EDGE, MAX_PHOTOS } from "@/lib/limits";
import { mediaUrl, MEDIA_BUCKET } from "@/lib/media";
import { createClient } from "@/lib/supabase/client";
import type { Room } from "@/lib/types";
import { resizeImage, uploadMedia } from "@/lib/upload";
import { useAction } from "@/lib/use-action";
import {
  addPhotos,
  deletePhoto,
  deleteRoom,
  movePhoto,
  renameRoom,
  reorderRooms,
  setPrimaryPhoto,
} from "../../actions";

const ACCEPT = "image/jpeg,image/png,image/webp";

export function PhotoManager({
  propertyId,
  userId,
  rooms,
  photoCount,
}: {
  propertyId: string;
  userId: string;
  rooms: Room[];
  photoCount: number;
}) {
  const { pending, error, setError, run } = useAction();
  const [progress, setProgress] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const remaining = MAX_PHOTOS - photoCount;
  const busy = pending || progress !== null;

  async function upload(fileList: FileList | File[]) {
    const files = [...fileList].filter((f) => ACCEPT.split(",").includes(f.type));
    if (!files.length) return setError("Choose JPEG, PNG or WebP photos.");
    if (files.length > remaining) return setError(`You can add ${remaining} more photo(s); a listing holds ${MAX_PHOTOS}.`);
    setError(null);
    const paths: string[] = [];
    try {
      for (const [i, file] of files.entries()) {
        setProgress(`Uploading ${i + 1} of ${files.length}…`);
        paths.push(await uploadMedia(userId, propertyId, await resizeImage(file, MAX_PHOTO_EDGE), "jpg"));
      }
    } catch (err) {
      setProgress(null);
      await createClient().storage.from(MEDIA_BUCKET).remove(paths);
      return setError(`Upload failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
    setProgress(null);
    run(async () => {
      const result = await addPhotos(propertyId, paths);
      if (result.error) await createClient().storage.from(MEDIA_BUCKET).remove(paths);
      return result;
    });
  }

  function move(index: number, delta: number) {
    const ids = rooms.map((r) => r.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    run(() => reorderRooms(propertyId, ids));
  }

  return (
    <div className="grid gap-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!busy) upload(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-brand bg-accent" : "hover:bg-accent/50"
        } ${busy || remaining <= 0 ? "pointer-events-none opacity-60" : ""}`}
      >
        <ImagePlus className="size-6 text-muted-foreground" />
        <span className="font-medium">{progress ?? "Drop listing photos here or click to choose"}</span>
        <span className="text-sm text-muted-foreground">
          JPEG, PNG or WebP · {photoCount} of {MAX_PHOTOS} used · You must have the rights to every photo you upload.
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          disabled={busy || remaining <= 0}
          onChange={(e) => {
            if (e.target.files) upload(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <ol className="grid gap-3">
        {rooms.map((room, index) => (
          <li key={room.id}>
            <Card className="gap-3 py-4">
              <CardContent className="grid gap-3 px-4">
                <div className="flex items-center gap-2">
                  <span className="w-6 text-right text-sm text-muted-foreground tabular-nums">{index + 1}.</span>
                  <Input
                    key={room.label}
                    defaultValue={room.label}
                    aria-label="Room name"
                    className="font-medium"
                    maxLength={80}
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value && value !== room.label) run(() => renameRoom(propertyId, room.id, value));
                      else e.target.value = room.label;
                    }}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                  <Button variant="ghost" size="icon" aria-label="Move up" disabled={busy || index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Move down"
                    disabled={busy || index === rooms.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete room"
                    disabled={busy}
                    onClick={() => {
                      if (confirm(`Delete "${room.label}" and its ${room.photos.length} photo(s)?`)) {
                        run(() => deleteRoom(propertyId, room.id));
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-3 pl-8">
                  {room.photos.map((photo) => (
                    <figure key={photo.id} className="grid w-40 gap-1">
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={mediaUrl(photo.storage_path)}
                          alt={room.label}
                          className="aspect-[4/3] w-40 rounded-md object-cover"
                          loading="lazy"
                        />
                        <button
                          type="button"
                          aria-label={photo.is_primary ? "Primary photo" : "Make primary photo"}
                          title={photo.is_primary ? "Primary photo (shown first)" : "Make primary"}
                          disabled={busy || photo.is_primary}
                          onClick={() => run(() => setPrimaryPhoto(propertyId, photo.id))}
                          className="absolute top-1 left-1 rounded-full bg-black/60 p-1 text-white"
                        >
                          <Star className={`size-4 ${photo.is_primary ? "fill-yellow-400 text-yellow-400" : ""}`} />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete photo"
                          disabled={busy}
                          onClick={() => confirm("Delete this photo?") && run(() => deletePhoto(propertyId, photo.id))}
                          className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      {rooms.length > 1 && (
                        <select
                          aria-label="Move photo to room"
                          className="h-8 rounded-md border bg-background px-2 text-xs"
                          value=""
                          disabled={busy}
                          onChange={(e) => e.target.value && run(() => movePhoto(propertyId, photo.id, e.target.value))}
                        >
                          <option value="">Move to…</option>
                          {rooms
                            .filter((r) => r.id !== room.id)
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.label}
                              </option>
                            ))}
                        </select>
                      )}
                    </figure>
                  ))}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
