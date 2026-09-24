import { AuthForm } from "../auth-form";

export const metadata = { title: "Create account · NextRoom" };

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
