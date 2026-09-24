"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAction } from "@/lib/use-action";
import { setPublished } from "../../actions";

export function PublishPanel({
  propertyId,
  status,
  slug,
  roomCount,
  siteUrl,
}: {
  propertyId: string;
  status: "draft" | "published";
  slug: string | null;
  roomCount: number;
  siteUrl: string;
}) {
  const { pending, error, run } = useAction();
  const [copied, setCopied] = useState(false);

  const published = status === "published";
  const shareUrl = slug ? `${siteUrl}/p/${slug}` : "";

  return (
    <Card className="py-4">
      <CardContent className="grid gap-3 px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {published ? "Published. Anyone with the link can view this walkthrough." : "Draft. Only you can see it."}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/properties/${propertyId}/preview`}>
                <Eye /> Preview
              </Link>
            </Button>
            <Button
              size="sm"
              variant={published ? "outline" : "default"}
              disabled={pending || (!published && roomCount === 0)}
              onClick={() => run(() => setPublished(propertyId, !published))}
            >
              {published ? "Unpublish" : "Publish"}
            </Button>
          </div>
        </div>
        {published && shareUrl && (
          <div className="flex gap-2">
            <Input readOnly value={shareUrl} aria-label="Share link" onFocus={(e) => e.target.select()} />
            <Button
              variant="outline"
              size="icon"
              aria-label="Copy link"
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        )}
        {!published && roomCount === 0 && (
          <p className="text-sm text-muted-foreground">Add photos below before publishing.</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
