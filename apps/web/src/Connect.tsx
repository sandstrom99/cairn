// Connect.tsx: what the page shows when the deployment will not answer it. The line is the
// deployment's own (lib/guard.ts names the fix), and under it is the one thing a reader can
// do about it from here: paste the secret, which stays in this browser (secret.ts).
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <main className="relative z-10 grid min-h-screen place-items-center p-4">
      <form
        className="glass relative w-[min(440px,100%)] rounded-3xl p-7"
        onSubmit={(event) => {
          event.preventDefault();
          // A FormData entry is a string or a File; only the string is a secret.
          const entered = new FormData(event.currentTarget).get("secret");
          onSecret(typeof entered === "string" ? entered : "");
        }}
      >
        <h1 className="text-title font-[650] tracking-[-0.012em]">
          This deployment did not answer
        </h1>
        <p className="mt-1 font-mono text-meta text-slate">{host}</p>
        <p role="alert" className="mt-4 text-row">
          {message}
        </p>
        <label htmlFor="secret" className="mt-5 block text-small font-semibold text-slate">
          Deployment secret
        </label>
        <div className="mt-1.5 flex gap-2">
          <Input
            id="secret"
            type="password"
            name="secret"
            autoComplete="off"
            className="bg-white/80"
          />
          <Button type="submit">Save in this browser</Button>
        </div>
      </form>
    </main>
  );
}
