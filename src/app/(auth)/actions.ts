"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function login(_: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { error: error.message };
  redirect(safeNext(formData.get("next")));
}

export async function signup(_: AuthState, formData: FormData): Promise<AuthState> {
  if (formData.get("rights") !== "on") {
    return { error: "Please confirm you have the rights to the photos and floor plans you upload." };
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL || (await headers()).get("origin") || "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=/dashboard`,
      data: {
        name: String(formData.get("name") ?? "").trim(),
        brokerage: String(formData.get("brokerage") ?? "").trim(),
      },
    },
  });
  if (error) return { error: error.message };
  // With email confirmation on (the hosted Supabase default) there is no session yet.
  if (!data.session) return { message: "Check your email for a confirmation link to finish signing up." };
  redirect("/dashboard");
}
