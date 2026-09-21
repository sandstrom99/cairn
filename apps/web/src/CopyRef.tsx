// CopyRef.tsx: one click puts the reference form on the clipboard, `cn-26 "apps/web, the
// read-only window"`, ready to paste into a session. That form is how work is named to an
// agent, so it is the thing worth copying: an agent told the id and the title knows what
// is meant and can `cn show` the rest.
import { type Referable, ref } from "@cairn/cli/src/lib/ref.mts";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

export function CopyRef({ item }: { item: Referable }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        // Refused without a secure context or a user gesture; then nothing claims to have copied.
        navigator.clipboard?.writeText(ref(item)).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
      className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg bg-white/70 px-2 text-meta font-medium text-slate shadow-[0_0_0_1px_rgb(21_24_30/0.07)] hover:text-ink"
    >
      {copied ? <Check className="size-[13px]" /> : <Copy className="size-[13px]" />}
      <span aria-live="polite">{copied ? "Copied" : "Copy reference"}</span>
    </button>
  );
}
