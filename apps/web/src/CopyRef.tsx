// CopyRef.tsx: one click puts the reference form on the clipboard, `cn-26 "apps/web, the
// read-only window"`, ready to paste into a session. That form is how work is named to an
// agent, so it is the thing worth copying: an agent told the id and the title knows what
// is meant and can `cn show` the rest.
import { type Referable, ref } from "@cairn/cli/ref";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

/** Writes the text; false where the browser refused, which needs a secure context and a gesture. */
export const copy = (text: string): Promise<boolean> =>
  navigator.clipboard?.writeText(text).then(
    () => true,
    () => false,
  ) ?? Promise.resolve(false);

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
      // Refused without a secure context or a user gesture; then nothing claims to have copied.
      onClick={() => copy(ref(item)).then(setCopied)}
      className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg bg-lift px-2 text-meta font-medium text-slate shadow-ring hover:text-ink"
    >
      {copied ? <Check className="size-[13px]" /> : <Copy className="size-[13px]" />}
      <span aria-live="polite">{copied ? "Copied" : "Copy reference"}</span>
    </button>
  );
}
