// settings.mts: what a machine has turned on.
//
//   import { settingsSet, withSetting } from "../lib/settings.mts";
//   settingsSet(config)                      // [{ name: "<a setting>", state: "auto" }]
//   withSetting(config, "<a setting>", "offer")
//
// A setting is behaviour beyond the worklist that a person turns on for themselves, so
// nobody's sessions change until they ask (docs/design.md §12). It is machine-wide: it
// lives in `~/.config/cairn/config.json` under `settings`, beside the deployments and
// above any one of them, and nothing in the environment or a repository overrides it.
//
// There is none yet. What is here is the system the first one arrives in, and each
// function takes the settings it reads, so the tests hold it to one of their own.
//
// A setting has states, and `off` is always one of them and where every setting starts.
// The others are the setting's own: how far the person wants cairn to go.
//
// cn stores a setting and prints it; it never acts on one. `cn brief` names the settings
// that are not off, each with its state, and the skill says what a session does when it
// reads one there, so any harness that runs `cn` behaves the same.
//
// A setting that is off is absent from the file, and `settings` is absent when nothing is
// set: a config from before settings existed and one whose settings were all turned off
// again hold the same. A name in the file that is not below was written by another cn;
// it is kept as it is and reads as off, and so does a value that is not one of the
// setting's states.

import type { CairnConfig } from "./config.mts";

/** A setting cn knows: its name, what it is for, and each state past `off` with what it does. */
export type Setting = {
  name: string;
  summary: string;
  states: readonly { state: string; does: string }[];
};

/** Every setting cn knows, in the order they print. */
export const SETTINGS: readonly Setting[] = [];

/** A setting that is not off, and the state it is in. */
type SettingSet = { name: string; state: string };

/** The states a setting takes, `off` first. */
export const statesOf = (setting: Setting): string[] => [
  "off",
  ...setting.states.map((s) => s.state),
];

/** The settings this machine has in a state other than off, in the order they print. */
export const settingsSet = (
  config: CairnConfig | null,
  settings: readonly Setting[] = SETTINGS,
): SettingSet[] =>
  settings.flatMap((s) => {
    const state = config?.settings?.[s.name];
    return s.states.some((known) => known.state === state)
      ? [{ name: s.name, state: state as string }]
      : [];
  });

/** `existing` with one setting in `state`, and everything else as it was. Pure. */
export function withSetting(existing: CairnConfig, name: string, state: string): CairnConfig {
  const { settings: before, ...rest } = existing;
  const { [name]: _was, ...others } = before ?? {};
  const settings = state === "off" ? others : { ...others, [name]: state };
  return Object.keys(settings).length === 0 ? rest : { ...rest, settings };
}
