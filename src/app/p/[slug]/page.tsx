import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Walkthrough } from "@/components/walkthrough";
import { createClient } from "@/lib/supabase/server";
import { mediaUrl } from "@/lib/media";
import { PROPERTY_SELECT, sortRooms, type PropertyWithRooms } from "@/lib/types";

const getProperty = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("properties")
    .select(PROPERTY_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return data as unknown as PropertyWithRooms | null;
});

export async function generateMetadata(props: PageProps<"/p/[slug]">): Promise<Metadata> {
  const property = await getProperty((await props.params).slug);
  if (!property) return { title: "Walkthrough not found" };
  const cover = sortRooms(property.rooms)[0]?.photos[0];
  return {
    title: `${property.address} · Walkthrough`,
    description: `Walk through ${property.address} room by room.`,
    openGraph: cover ? { images: [mediaUrl(cover.storage_path)] } : undefined,
  };
}

export default async function PublicWalkthroughPage(props: PageProps<"/p/[slug]">) {
  const property = await getProperty((await props.params).slug);
  if (!property) notFound();
  return (
    <Walkthrough
      address={property.address}
      rooms={sortRooms(property.rooms).filter((r) => r.photos.length)}
      floorPlanUrl={property.floor_plan_path ? mediaUrl(property.floor_plan_path) : null}
    />
  );
}
