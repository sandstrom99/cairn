// cn setting — what this machine has turned on.
//
//   cn setting [--json]             every setting, and whether it is on
//   cn setting <name> on|off        turn one on or off
//
// A setting is behaviour beyond the worklist that a person turns on for themselves; each
// is off until then, so cairn does nothing to a session that nobody asked for. It holds
// for this machine, in every repository and against every deployment: it is kept in
// `~/.config/cairn/config.json`, or `$XDG_CONFIG_HOME/cairn/config.json` where that is
// set, and nothing in the environment or a repository overrides it.
//
// cn keeps a setting and prints it, and never acts on one. `cn brief` names the settings
// that are on, on its last line, and the skill says what a session does when it reads a
// name there. `cn doctor` names them too.
//
// The settings:
//
//   next-session   a session whose work has closed ends by writing the prompt the next
//                  one opens with
//
// A person asks for one in their own words and the agent runs this; nobody edits the
// file. A name that is not a setting exits 1 naming the ones there are. Turning on what
// is on, or off what is off, exits 0 and writes nothing. A machine with no config has
// nothing to keep a setting in, and is told to run `cn init` first. This verb calls no
// deployment.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { UsageError, answer, fail } from "../lib/cli.mts";
import { configPath, readConfig, writeConfig } from "../lib/config.mts";
import { SETTINGS, isSetting, settingsOn, withSetting } from "../lib/settings.mts";

export const name = "setting";
export const summary = "what this machine has turned on, and turning one on or off";
export const spec = { bool: ["json"] } as const satisfies ArgSpec;

const USAGE = "cn setting [--json], or cn setting <name> on|off";

type Parsed = { action: "list"; json: boolean } | { action: "set"; setting: string; on: boolean };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  if (pos.length === 0) return { action: "list", json: opts.json };
  const [setting, word, ...extra] = pos;
  if (setting === undefined || extra.length > 0 || (word !== "on" && word !== "off"))
    throw new UsageError(USAGE);
  if (opts.json) throw new UsageError(`--json goes with the list alone: ${USAGE}`);
  return { action: "set", setting, on: word === "on" };
}

/** One setting as the list states it. */
type Row = { name: string; on: boolean; summary: string };

/** One line per setting: its name, `on` or `off`, and what it does. */
export function settingLines(rows: Row[]): string[] {
  const width = Math.max(...rows.map((r) => r.name.length));
  return rows.map((r) => `${r.name.padEnd(width)}  ${r.on ? "on " : "off"}  ${r.summary}`);
}

export function run(argv: string[]): number {
  const parsed = parse(argv);
  const existing = readConfig();

  if (parsed.action === "list") {
    const on = new Set<string>(settingsOn(existing));
    const rows: Row[] = SETTINGS.map((s) => ({
      name: s.name,
      on: on.has(s.name),
      summary: s.summary,
    }));
    answer(parsed.json, rows, settingLines);
    return 0;
  }

  if (!isSetting(parsed.setting))
    return fail(
      `${parsed.setting} is not a setting; there is ${SETTINGS.map((s) => s.name).join(", ")}`,
    );
  if (!existing)
    return fail(
      `no config at ${configPath()} to keep a setting in: cn init --name <name> --url <url> sets this machine up first`,
    );
  const word = parsed.on ? "on" : "off";
  if (settingsOn(existing).includes(parsed.setting) !== parsed.on)
    writeConfig(withSetting(existing, parsed.setting, parsed.on));
  console.log(`${parsed.setting} ${word}`);
  return 0;
}
