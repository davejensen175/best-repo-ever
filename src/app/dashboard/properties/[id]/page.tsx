import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { createClient, getUserId } from "@/lib/supabase/server";
import { mediaUrl } from "@/lib/media";
import { PROPERTY_SELECT, sortRooms, type PropertyWithRooms } from "@/lib/types";
import { DetailsForm } from "./details-form";
import { FloorPlanEditor } from "./floor-plan-editor";
import { HotspotEditor } from "./hotspot-editor";
import { PhotoManager } from "./photo-manager";
import { PublishPanel } from "./publish-panel";

export default async function PropertyPage(props: PageProps<"/dashboard/properties/[id]">) {
  const { id } = await props.params;
  const userId = await getUserId();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase.from("properties").select(PROPERTY_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const property = data as unknown as PropertyWithRooms;
  const rooms = sortRooms(property.rooms);
  const photoCount = rooms.reduce((n, r) => n + r.photos.length, 0);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (await requestOrigin());

  return (
    <div className="grid gap-10">
      <div>
        <Link href="/dashboard" className="text-sm text-muted-foreground underline">
          ← All listings
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{property.address}</h1>
          <Badge variant={property.status === "published" ? "default" : "secondary"}>{property.status}</Badge>
        </div>
      </div>

      <PublishPanel
        propertyId={property.id}
        status={property.status}
        slug={property.slug}
        roomCount={rooms.length}
        siteUrl={siteUrl}
      />

      <Section step={1} title="Details">
        <DetailsForm propertyId={property.id} address={property.address} mlsNumber={property.mls_number} />
      </Section>

      <Section
        step={2}
        title="Photos and rooms"
        description="Each photo starts as its own room. Rename rooms, move photos into the same room, and put the rooms in walkthrough order."
      >
        <PhotoManager propertyId={property.id} userId={userId} rooms={rooms} photoCount={photoCount} />
      </Section>

      <Section
        step={3}
        title="Floor plan"
        description="Upload the floor plan, then place each room on it. Buyers see this as a minimap."
      >
        <FloorPlanEditor
          key={property.floor_plan_path ?? "none"}
          propertyId={property.id}
          userId={userId}
          floorPlanUrl={property.floor_plan_path ? mediaUrl(property.floor_plan_path) : null}
          rooms={rooms.map(({ id, label, floorplan_x, floorplan_y }) => ({ id, label, floorplan_x, floorplan_y }))}
        />
      </Section>

      <Section
        step={4}
        title="Hotspots"
        description="Click a spot on a photo, such as a doorway, and pick the room it leads to. Buyers tap hotspots to walk from room to room."
      >
        <HotspotEditor propertyId={property.id} rooms={rooms} />
      </Section>
    </div>
  );
}

async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

function Section({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-lg font-semibold">
          <span className="mr-2 text-muted-foreground">{step}.</span>
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
