// cn setting — what this machine has turned on.
//
//   cn setting [--json]             every setting, and the state it is in
//   cn setting <name> <state>       put one in a state; `off` is always one
//
// A setting is behaviour beyond the worklist that a person turns on for themselves; each
// is off until then, so cairn does nothing to a session that nobody asked for. It holds
// for this machine, in every repository and against every deployment: it is kept in
// `~/.config/cairn/config.json`, or `$XDG_CONFIG_HOME/cairn/config.json` where that is
// set, and nothing in the environment or a repository overrides it.
//
// cn keeps a setting and prints it, and never acts on one. `cn brief` names the settings
// that are not off, each with its state, on its last line, and the skill says what a
// session does when it reads one there. `cn doctor` names them too.
//
// The settings, and the states each takes besides `off`:
//
//   next-session   a session whose work has closed leaves the prompt the next one opens
//                  with
//       offer      it offers to, in a sentence, and writes it when the person says yes
//       auto       it writes it unprompted, for sessions that run with nobody attending
//
// A person asks for one in their own words and the agent runs this; nobody edits the
// file. A name that is not a setting exits 1 naming the ones there are, and a state the
// setting does not take exits 1 naming the ones it does. Putting a setting in the state
// it is in exits 0 and writes nothing. A machine with no config has nothing to keep a
// setting in, and is told to run `cn init` first. This verb calls no deployment.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { UsageError, answer, fail } from "../lib/cli.mts";
import { configPath, readConfig, writeConfig } from "../lib/config.mts";
import { SETTINGS, isSetting, settingsSet, statesOf, withSetting } from "../lib/settings.mts";

export const name = "setting";
export const summary = "what this machine has turned on, and putting a setting in a state";
export const spec = { bool: ["json"] } as const satisfies ArgSpec;

const USAGE = "cn setting [--json], or cn setting <name> <state>";

type Parsed = { action: "list"; json: boolean } | { action: "set"; setting: string; state: string };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  if (pos.length === 0) return { action: "list", json: opts.json };
  const [setting, state, ...extra] = pos;
  if (setting === undefined || state === undefined || extra.length > 0) throw new UsageError(USAGE);
  if (opts.json) throw new UsageError(`--json goes with the list alone: ${USAGE}`);
  return { action: "set", setting, state };
}

/** One setting as the list states it. */
type Row = { name: string; state: string; states: string[]; summary: string };

/** One line per setting: its name, its state, what it does, and the states it takes. */
export function settingLines(rows: Row[]): string[] {
  const names = Math.max(...rows.map((r) => r.name.length));
  const states = Math.max(...rows.map((r) => r.state.length));
  return rows.map(
    (r) =>
      `${r.name.padEnd(names)}  ${r.state.padEnd(states)}  ${r.summary} (${r.states.join(", ")})`,
  );
}

export function run(argv: string[]): number {
  const parsed = parse(argv);
  const existing = readConfig();
  const set = new Map(settingsSet(existing).map((s) => [s.name, s.state]));

  if (parsed.action === "list") {
    const rows: Row[] = SETTINGS.map((s) => ({
      name: s.name,
      state: set.get(s.name) ?? "off",
      states: statesOf(s.name),
      summary: s.summary,
    }));
    answer(parsed.json, rows, settingLines);
    return 0;
  }

  if (!isSetting(parsed.setting))
    return fail(
      `${parsed.setting} is not a setting; there is ${SETTINGS.map((s) => s.name).join(", ")}`,
    );
  const states = statesOf(parsed.setting);
  if (!states.includes(parsed.state))
    return fail(
      `${parsed.setting} is ${states.join(", ")}, not ${parsed.state}; cn setting --help says what each does`,
    );
  if (!existing)
    return fail(
      `no config at ${configPath()} to keep a setting in: cn init --name <name> --url <url> sets this machine up first`,
    );
  if ((set.get(parsed.setting) ?? "off") !== parsed.state)
    writeConfig(withSetting(existing, parsed.setting, parsed.state));
  console.log(`${parsed.setting} ${parsed.state}`);
  return 0;
}
