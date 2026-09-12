import { MusicianApplicationForm } from "@/components/forms/MusicianApplicationForm";

export const metadata = { title: "Apply to perform" };

export default function ApplyPage() {
  return (
    <div>
      <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">Apply to perform</h1>
      <p className="mt-3 text-lg leading-relaxed text-ink/75">Tell us about your act, credentials, rates, and availability. Our team reviews every application before you receive booking offers.</p>
      <div className="mt-8">
        <MusicianApplicationForm />
      </div>
    </div>
  );
}
