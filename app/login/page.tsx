import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";
import { landingFor } from "@/auth.config";
import { Button, Field, Input } from "@/components/ui";
import { LogoMark } from "@/components/brand";

export const metadata = { title: "Sign in" };

async function login(formData: FormData) {
  "use server";
  const callbackUrl = String(formData.get("callbackUrl") || "/go");
  try {
    await signIn("credentials", { email: formData.get("email"), password: formData.get("password"), redirectTo: callbackUrl.startsWith("/") ? callbackUrl : "/go" });
  } catch (e) {
    if (e instanceof AuthError) redirect(`/login?error=1&callbackUrl=${encodeURIComponent(callbackUrl)}`);
    throw e;
  }
}

export default async function LoginPage(props: PageProps<"/login">) {
  const session = await auth();
  if (session?.user) redirect(landingFor(session.user.role));
  const sp = await props.searchParams;
  const error = sp.error;
  const callbackUrl = typeof sp.callbackUrl === "string" ? sp.callbackUrl : "/go";
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="surface w-full max-w-sm rounded-3xl p-8">
        <LogoMark size={56} />
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.25em] text-gold-700">Senior Music Connection</p>
        <h1 className="font-display mt-1 text-3xl font-semibold text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-stone-500">Staff, musicians and community contacts all sign in here.</p>
        {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Invalid email or password.</p> : null}
        <form action={login} className="mt-6 space-y-4">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <Field label="Email">
            <Input name="email" type="email" autoComplete="username" required />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>
        {process.env.DEMO_MODE === "true" ? <p className="mt-6 text-xs text-stone-500">Demo accounts and role walkthroughs: <a href="/demo" className="font-semibold text-brand-700 underline">open the demo hub</a>.</p> : null}
      </div>
    </main>
  );
}
