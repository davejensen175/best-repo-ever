import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign in · NextRoom" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { next, error } = await props.searchParams;
  return (
    <>
      {error === "confirm" && (
        <p role="alert" className="max-w-sm text-center text-sm text-destructive">
          That confirmation link is invalid or has expired. Sign in, or sign up again to get a new link.
        </p>
      )}
      <AuthForm mode="login" next={typeof next === "string" ? next : undefined} />
    </>
  );
}
