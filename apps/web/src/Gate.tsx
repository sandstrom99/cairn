// Gate.tsx: the one error boundary, and what it shows for each kind of failure. Every error
// the deployment throws is a ConvexError whose data is a member of the backend's CairnError
// union (backend/convex/lib/errors.ts), so the kind is read, not guessed: unauthorized is
// the guard refusing the secret and gets the Connect form; not-found is the deployment
// answering that nothing has that id and gets Lost; anything else is broken and gets its
// message, plainly. convex/react throws out of useQuery, which is how a query's refusal
// reaches a boundary above it.
import type { CairnError } from "@cairn/backend/convex/lib/errors.js";
import { ConvexError } from "convex/values";
import { Component, type ReactNode } from "react";
import { Connect } from "./Connect.tsx";
import { Title } from "./page.tsx";
import { shortcut } from "./platform.ts";

/** The deployment's own `{ kind, message }` when the error is one it threw, else undefined. */
export function errorData(error: unknown): CairnError | undefined {
  if (!(error instanceof ConvexError)) return undefined;
  const data: unknown = error.data;
  return typeof data === "object" && data !== null && "kind" in data && "message" in data
    ? (data as CairnError)
    : undefined;
}

/** What the gate shows for an error, by its kind. */
export function Fallback({
  error,
  host,
  what,
  onSecret,
}: {
  error: Error;
  host: string;
  what?: string;
  onSecret: (secret: string) => void;
}): ReactNode {
  const data = errorData(error);
  if (data?.kind === "unauthorized")
    return <Connect host={host} message={data.message} onSecret={onSecret} />;
  if (data?.kind === "not-found") return <Lost what={what ?? data.message} />;
  return <Broken message={data?.message ?? error.message} />;
}

/** The boundary: its children until one of them throws, then the fallback for that error. */
export class Gate extends Component<
  { host: string; what?: string; onSecret: (secret: string) => void; children: ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error === undefined) return this.props.children;
    const { host, what, onSecret } = this.props;
    return <Fallback error={error} host={host} what={what} onSecret={onSecret} />;
  }
}

/** A path that names nothing: said plainly, with the way back. */
export function Lost({ what }: { what: string }) {
  return (
    <div>
      <Title>Nothing here is called {what}</Title>
      <p className="mt-3 text-slate">
        It may have been typed wrong, or live on another deployment.{" "}
        <a href="/" className="text-ink underline decoration-faint underline-offset-[3px]">
          Back to the overview
        </a>
        , or press {shortcut()} and look for it by title.
      </p>
    </div>
  );
}

/** An error that is neither a refused secret nor a missing id: its message, and the way back. */
export function Broken({ message }: { message: string }) {
  return (
    <div>
      <Title>Something broke</Title>
      <p className="mt-3 text-slate">
        <span className="font-mono text-row">{message}</span>{" "}
        <a href="/" className="text-ink underline decoration-faint underline-offset-[3px]">
          Back to the overview
        </a>
      </p>
    </div>
  );
}
