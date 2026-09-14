import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { landingFor } from "@/auth.config";

export const dynamic = "force-dynamic";

/** Post-login router: sends each role to its own home. */
export default async function GoPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  redirect(landingFor(session.user.role));
}
