"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/lib/use-action";
import { deleteProperty, updateProperty } from "../../actions";

export function DetailsForm({
  propertyId,
  address,
  mlsNumber,
}: {
  propertyId: string;
  address: string;
  mlsNumber: string | null;
}) {
  const { pending, error, run } = useAction();
  return (
    <form
      action={(formData) => run(() => updateProperty(propertyId, formData))}
      className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
    >
      <div className="grid gap-2">
        <Label htmlFor="address">Address</Label>
        <Input id="address" name="address" defaultValue={address} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="mls_number">MLS number</Label>
        <Input id="mls_number" name="mls_number" defaultValue={mlsNumber ?? ""} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="text-destructive"
          disabled={pending}
          onClick={() => {
            if (confirm("Delete this listing and all its photos? This can't be undone.")) {
              run(() => deleteProperty(propertyId));
            }
          }}
        >
          Delete
        </Button>
      </div>
      {error && <p className="text-sm text-destructive sm:col-span-3">{error}</p>}
    </form>
  );
}
