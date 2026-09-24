import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-4 py-16">
      <p className="text-sm font-semibold tracking-wide text-brand uppercase">NextRoom</p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Walkthroughs from the listing photos you already have.
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        Upload your photographer&apos;s shots and a floor plan. Buyers move room to room and always see where they
        are standing. No capture rig, no second site visit.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/signup">Create a walkthrough</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    </main>
  );
}
