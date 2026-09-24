import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { NewPropertyForm } from "./new-property-form";

export const metadata = { title: "Your listings · NextRoom" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: properties, error } = await supabase
    .from("properties")
    .select("id, address, mls_number, status, created_at, rooms(count)")
    .order("created_at", { ascending: false });

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Your listings</h1>
        <p className="text-muted-foreground">Create a property, add its photos and floor plan, then publish.</p>
      </div>

      <NewPropertyForm />

      {error && <p className="text-destructive">Could not load your listings.</p>}
      {properties && properties.length === 0 && (
        <p className="text-muted-foreground">No listings yet. Add your first one above.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {properties?.map((p) => {
          const roomCount = (p.rooms as unknown as { count: number }[])[0]?.count ?? 0;
          return (
            <Link key={p.id} href={`/dashboard/properties/${p.id}`} className="rounded-xl focus-visible:ring-2">
              <Card className="h-full transition-colors hover:bg-accent/50">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle>{p.address}</CardTitle>
                    <Badge variant={p.status === "published" ? "default" : "secondary"}>{p.status}</Badge>
                  </div>
                  <CardDescription>{p.mls_number ? `MLS ${p.mls_number}` : "No MLS number"}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {roomCount} {roomCount === 1 ? "room" : "rooms"}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
