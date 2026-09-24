// Connect.tsx: what the page shows when the deployment will not answer it. The line is the
// deployment's own (lib/guard.ts names the fix), and under it is the one thing a reader can
// do about it from here: paste the secret, which stays in this browser (secret.ts). A
// deployment that never answers at all gets the same panel with no form, since no secret
// would help.
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ground } from "./Ground.tsx";

/** The frame both panels share: the ground, and the glass that says which deployment it is. */
function Panel({ host, children }: { host: string; children: ReactNode }) {
  return (
    <>
      <Ground waiting={false} />
      <main className="relative z-10 grid min-h-screen place-items-center p-4">
        <section className="glass relative w-[min(440px,100%)] rounded-3xl p-7">
          <h1 className="text-title font-[650] tracking-[-0.012em]">
            This deployment did not answer
          </h1>
          <p className="mt-1 font-mono text-meta text-slate">{host}</p>
          {children}
        </section>
      </main>
    </>
  );
}

/** The deployment refused the secret: its line, and the form to paste the right one. */
export function Connect({
  host,
  message,
  onSecret,
}: {
  host: string;
  message: string;
  onSecret: (secret: string) => void;
}) {
  return (
    <Panel host={host}>
      <p role="alert" className="mt-4 text-row">
        {message}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // A FormData entry is a string or a File; only the string is a secret.
          const entered = new FormData(event.currentTarget).get("secret");
          onSecret(typeof entered === "string" ? entered : "");
        }}
      >
        <label htmlFor="secret" className="mt-5 block text-small font-semibold text-slate">
          Deployment secret
        </label>
        <div className="mt-1.5 flex gap-2">
          <Input id="secret" type="password" name="secret" autoComplete="off" className="bg-lift" />
          <Button type="submit">Save in this browser</Button>
        </div>
      </form>
    </Panel>
  );
}

/** The deployment never opened its socket: said once the page has waited `seconds` for it. */
export function Unanswered({ host, seconds }: { host: string; seconds: number }) {
  return (
    <Panel host={host}>
      <p role="alert" className="mt-4 text-row">
        No answer in {seconds} seconds. It may be down, or this may not be its address:{" "}
        <code className="font-mono">cn doctor</code> says why.
      </p>
    </Panel>
  );
}
