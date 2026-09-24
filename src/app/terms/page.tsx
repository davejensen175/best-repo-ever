import Link from "next/link";

export const metadata = { title: "Terms · NextRoom" };

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <Link href="/" className="text-sm text-muted-foreground underline">
        ← Home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Terms (draft)</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Placeholder terms for the pilot. Have a lawyer review these before charging for the service.
      </p>
      <h2 className="mt-8 font-semibold">Your content</h2>
      <p className="mt-2">
        You keep ownership of the photos, floor plans and other material you upload. By uploading, you warrant that
        you own that material or have the rights and permissions needed to upload it and publish it through this
        service, including any rights held by the photographer, the seller and the brokerage.
      </p>
      <p className="mt-2">
        You grant us a limited license to store, process and display that material only to provide the service to
        you and to the people you share your walkthrough links with.
      </p>
      <h2 className="mt-8 font-semibold">Accuracy</h2>
      <p className="mt-2">
        You are responsible for making sure published walkthroughs accurately represent the property and comply with
        your MLS and local rules.
      </p>
    </main>
  );
}
