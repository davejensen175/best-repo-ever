"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProperty, type ActionResult } from "./actions";

export function NewPropertyForm() {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    (_, formData) => createProperty(formData),
    undefined,
  );
  return (
    <Card>
      <CardContent>
        <form action={action} className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" name="address" placeholder="123 Main St, Springfield" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="mls_number">MLS number</Label>
            <Input id="mls_number" name="mls_number" placeholder="Optional" />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "New listing"}
          </Button>
          {state?.error && <p className="text-sm text-destructive sm:col-span-3">{state.error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
