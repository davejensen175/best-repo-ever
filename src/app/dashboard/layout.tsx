import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Link href="/dashboard" className="font-semibold">
            NextRoom
          </Link>
          <form action="/auth/signout" method="post">
            <Button variant="ghost" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
