// App.tsx: the whole page. One live subscription to `api.epics.list` — the same function
// `cn epic list` calls — printed through the CLI's own reference form.
//
// The secret is state rather than a build-time value, because the deployment answers
// `unauthorized` to a caller that did not send the right one and the page has to be able
// to ask. An error boundary around the subscription is what carries that answer to the
// reader: convex/react throws a ConvexError out of `useQuery`, and the guard's line names
// the fix. Changing the secret remounts the boundary, so a fixed secret clears the error.
import { api } from "@cairn/backend/convex/_generated/api.js";
import { useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Component, type ReactNode, useState } from "react";
import { EpicList } from "./EpicList.tsx";
import { devSecret, readSecret, writeSecret } from "./secret.ts";

export function App({ url }: { url: string }) {
  const [secret, setSecret] = useState<string | undefined>(() => readSecret() ?? devSecret());

  return (
    <main>
      <h1>cairn</h1>
      <p>{url}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // A FormData entry is a string or a File; only the string is a secret.
          const entered = new FormData(event.currentTarget).get("secret");
          writeSecret(typeof entered === "string" ? entered : "");
          setSecret(readSecret() ?? devSecret());
        }}
      >
        <input type="password" name="secret" placeholder="deployment secret" autoComplete="off" />
        <button type="submit">Save</button>
      </form>
      <ErrorBoundary key={secret ?? ""}>
        <Epics secret={secret} />
      </ErrorBoundary>
    </main>
  );
}

/** The live list. `undefined` is the subscription not having answered yet, not an empty list. */
function Epics({ secret }: { secret: string | undefined }) {
  const epics = useQuery(api.epics.list, secret === undefined ? {} : { secret });
  if (epics === undefined) return <p>loading…</p>;
  return <EpicList epics={epics} />;
}

/**
 * A ConvexError's `data` when the backend threw one of its own (lib/errors.ts, lib/guard.ts):
 * the kind is for a program, the message is the line a person reads.
 */
type ErrorData = { message?: unknown };

/** What to show the reader: the deployment's own message where it sent one. */
function messageOf(error: Error): string {
  if (error instanceof ConvexError) {
    const data = error.data as ErrorData | undefined;
    if (typeof data === "object" && data !== null && typeof data.message === "string")
      return data.message;
  }
  return error.message;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error === undefined) return this.props.children;
    return <p role="alert">{messageOf(error)}</p>;
  }
}
