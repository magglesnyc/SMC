"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { ALL_DEMO_ACCOUNTS } from "./accounts";

/** One-click sign-in for a demo role. Only available when DEMO_MODE=true. */
export async function demoSignIn(formData: FormData) {
  if (process.env.DEMO_MODE !== "true") redirect("/login");
  const key = String(formData.get("role") ?? "");
  const account = ALL_DEMO_ACCOUNTS.find((a) => a.key === key);
  if (!account) redirect("/demo");
  try {
    await signOut({ redirect: false });
  } catch {
    // no active session — fine
  }
  try {
    await signIn("credentials", { email: account.email, password: account.password, redirectTo: account.landing });
  } catch (e) {
    if (e instanceof AuthError) redirect("/demo?error=signin");
    throw e;
  }
}
