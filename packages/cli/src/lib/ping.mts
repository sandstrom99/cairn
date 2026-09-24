// ping.mts: one query, `projects.list`, as the proof that a deployment answers and takes
// the secret this machine holds.
//
//   import { ping } from "../lib/ping.mts";
//   const answer = await ping({ url, secret });
//
// `cn doctor` proves it against the deployment the config resolves and `cn init` against
// one that is not in the file yet, and each words its own lines; what is decided here is
// what came back. A refusal is the deployment's `unauthorized`: the secret is wrong, or
// missing where one is wanted. Anything else that failed did not answer, and carries the
// error's message with the secret struck from it first: a deployment behind this CLI
// quotes the whole argument object back in a validation error, and `secret` is an
// argument on every call.

import { type CairnClient, api, connectTo } from "./client.mts";
import { errorData, redacted } from "./cli.mts";

export type Ping =
  | { answered: true; projects: number }
  | { answered: false; refused: boolean; message: string };

/** What `projects.list` against `target` came back with. `client` is injectable for tests. */
export async function ping(
  target: { url: string; secret?: string },
  client: CairnClient = connectTo(target),
): Promise<Ping> {
  try {
    const projects = await client.query(api.projects.list, {});
    return { answered: true, projects: projects.length };
  } catch (e) {
    // The deployment's own errors carry their message in the data; anything else says
    // what it says, a ConvexError from elsewhere as the JSON of its data.
    const data = errorData(e);
    const said = data?.message ?? (e instanceof Error ? e.message : String(e));
    const struck = target.secret === undefined ? said : said.split(target.secret).join("[secret]");
    return { answered: false, refused: data?.kind === "unauthorized", message: redacted(struck) };
  }
}
