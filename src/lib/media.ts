import { supabaseEnv } from "@/lib/env";

export const MEDIA_BUCKET = "listing-media";

/** Public URL for an object in the listing-media bucket. */
export function mediaUrl(path: string) {
  return `${supabaseEnv().url}/storage/v1/object/public/${MEDIA_BUCKET}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}
