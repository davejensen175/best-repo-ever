import { notFound } from "next/navigation";
import { Walkthrough } from "@/components/walkthrough";
import { createClient } from "@/lib/supabase/server";
import { mediaUrl } from "@/lib/media";
import { PROPERTY_SELECT, sortRooms, type PropertyWithRooms } from "@/lib/types";

export const metadata = { title: "Preview · NextRoom" };

export default async function PreviewPage(props: PageProps<"/dashboard/properties/[id]/preview">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.from("properties").select(PROPERTY_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const property = data as unknown as PropertyWithRooms;
  return (
    <Walkthrough
      address={property.address}
      rooms={sortRooms(property.rooms).filter((r) => r.photos.length)}
      floorPlanUrl={property.floor_plan_path ? mediaUrl(property.floor_plan_path) : null}
      previewBackHref={`/dashboard/properties/${id}`}
    />
  );
}
