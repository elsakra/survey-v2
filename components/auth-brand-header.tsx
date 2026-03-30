import Link from "next/link";
import { VoicewellLogo } from "@/components/voicewell-logo";

export function AuthBrandHeader() {
  return (
    <div className="mb-6 flex flex-col items-center gap-3">
      <Link href="/" className="inline-flex outline-none ring-offset-2 ring-offset-[var(--color-bg)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]" title="Voicewell">
        <VoicewellLogo height={28} priority />
      </Link>
      <p className="text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-label)]">
        Voice insight platform
      </p>
    </div>
  );
}
