import Link from "next/link";
import { Wordmark } from "@/components/brand";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-gold-300/40 bg-paper/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Wordmark compact />
          <nav className="flex gap-5 text-sm font-semibold text-ink/75">
            <Link href="/request" className="hover:text-brand-700">Request a musician</Link>
            <Link href="/apply" className="hover:text-brand-700">Apply to perform</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">{children}</main>
      <footer className="border-t border-gold-300/40 bg-paper/60 py-6 text-center text-sm text-ink/60">Senior Music Connection · We only collect what we need to book and deliver your event.</footer>
    </div>
  );
}
