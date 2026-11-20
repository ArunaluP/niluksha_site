"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { LoginSchema, loginWithPassword } from "@/features/auth/service";
import { AppError } from "@/lib/errors";
import { deleteSession } from "@/lib/session";

export type LoginState = { error?: string; fieldErrors?: { email?: string[]; password?: string[] }; email?: string } | undefined;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.extend({ next: z.string().optional() }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, email: String(formData.get("email") ?? "") };
  }

  const { email, password, next } = parsed.data;
  try {
    await loginWithPassword(email, password);
  } catch (err) {
    if (err instanceof AppError) return { error: err.message, email };
    throw err;
  }

  // Only allow redirects to our own pages (blocks "?next=https://evil.com").
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  redirect(safeNext);
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
