"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, signup, type AuthState } from "./actions";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? login : signup, undefined);
  const isSignup = mode === "signup";

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{isSignup ? "Create your account" : "Sign in"}</CardTitle>
        <CardDescription>
          {isSignup ? "Turn your listing photos into a walkthrough." : "Welcome back."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          {next && <input type="hidden" name="next" value={next} />}
          {isSignup && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" autoComplete="name" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="brokerage">Brokerage</Label>
                <Input id="brokerage" name="brokerage" autoComplete="organization" />
              </div>
            </>
          )}
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              minLength={isSignup ? 8 : undefined}
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
            />
          </div>
          {isSignup && (
            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <input type="checkbox" name="rights" className="mt-1" required />
              <span>
                I confirm I have the rights to every photo and floor plan I upload, and I agree to the{" "}
                <Link href="/terms" className="underline">
                  terms
                </Link>
                .
              </span>
            </label>
          )}
          {state?.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state?.message && <p className="text-sm text-brand">{state.message}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {isSignup ? "Already have an account? " : "New here? "}
          <Link href={isSignup ? "/login" : "/signup"} className="underline">
            {isSignup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
