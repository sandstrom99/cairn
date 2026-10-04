// settings.mts: what a machine has turned on.
//
//   import { settingsOn, withSetting } from "../lib/settings.mts";
//   settingsOn(config)                      // ["next-session"], in the order below
//   withSetting(config, "next-session", true)
//
// A setting is behaviour beyond the worklist that a person turns on for themselves, so
// nobody's sessions change until they ask (docs/design.md §12). It is machine-wide: it
// lives in `~/.config/cairn/config.json` under `settings`, beside the deployments and
// above any one of them, and nothing in the environment or a repository overrides it.
//
// cn stores a setting and prints it; it never acts on one. `cn brief` names the settings
// that are on, and the skill says what a session does when it reads a name there, so any
// harness that runs `cn` behaves the same.
//
// A setting that is off is absent from the file, and `settings` is absent when nothing is
// on: a config from before settings existed and one whose settings were all turned off
// again hold the same. A name in the file that is not below was written by another
// cn; it is kept as it is and reads as off.

import type { CairnConfig } from "./config.mts";

/** Every setting cn knows, in the order they print. */
export const SETTINGS = [
  {
    name: "next-session",
    summary: "a session whose work has closed ends by writing the prompt the next one opens with",
  },
] as const;

type SettingName = (typeof SETTINGS)[number]["name"];

/** Whether `name` is a setting this cn knows. */
export const isSetting = (name: string): name is SettingName =>
  SETTINGS.some((s) => s.name === name);

/** The settings this machine has on, in the order they print. */
export const settingsOn = (config: CairnConfig | null): SettingName[] =>
  SETTINGS.filter((s) => config?.settings?.[s.name] === true).map((s) => s.name);

/** `existing` with one setting on or off, and everything else as it was. Pure. */
export function withSetting(existing: CairnConfig, name: SettingName, on: boolean): CairnConfig {
  const { settings: before, ...rest } = existing;
  const { [name]: _was, ...others } = before ?? {};
  const settings = on ? { ...others, [name]: true } : others;
  return Object.keys(settings).length === 0 ? rest : { ...rest, settings };
}
