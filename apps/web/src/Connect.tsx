// Connect.tsx: what the page shows when the deployment will not answer it, in the page's own
// words. The guard's line names cn's config file and environment variable (lib/guard.ts),
// which a person in a browser, on a phone say, has no use for, so it is never printed here
// (cn-85). A browser that sent no secret is asked for one; one whose secret was refused is
// told so; both get the one thing a reader can do from here, paste the secret, which stays
// in this browser (secret.ts). A deployment that never answers at all gets the same panel
// with no form, since no secret would help.
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ground } from "./Ground.tsx";

/** The frame every panel shares: the ground, and the glass that says which deployment it is. */
function Panel({ title, host, children }: { title: string; host: string; children: ReactNode }) {
  return (
    <>
      <Ground waiting={false} />
      <main className="relative z-10 grid min-h-screen place-items-center p-4">
        <section className="glass relative w-[min(440px,100%)] rounded-3xl p-7">
          <h1 className="text-title font-[650] tracking-[-0.012em]">{title}</h1>
          <p className="mt-1 font-mono text-meta text-slate">{host}</p>
          {children}
        </section>
      </main>
    </>
  );
}

/**
 * The deployment wants its secret: asked for when this browser sent none, and said to be
 * refused when it sent one the deployment did not take. The form is the same either way.
 */
export function Connect({
  host,
  refused,
  onSecret,
}: {
  host: string;
  refused: boolean;
  onSecret: (secret: string) => void;
}) {
  return (
    <Panel
      title={refused ? "This deployment refused the secret" : "This deployment needs its secret"}
      host={host}
    >
      {refused ? (
        <p role="alert" className="mt-4 text-row">
          The secret this browser sent is not the one it expects. Paste the right one.
        </p>
      ) : (
        <p className="mt-4 text-row">
          Paste its secret to read the worklist. This browser keeps it, so you are asked once.
        </p>
      )}
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
    <Panel title="This deployment did not answer" host={host}>
      <p role="alert" className="mt-4 text-row">
        No answer in {seconds} seconds. It may be down, or this may not be its address.
      </p>
    </Panel>
  );
}
