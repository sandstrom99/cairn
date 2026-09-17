// verbs/index.mts: the registry main.mts dispatches on. One file per verb; add it here.
//
// A verb exports `name`, `summary` (one line for `cn --help`) and `run(argv)`, which is a
// CLI body in the sense of lib/cli.mts: it may return an exit code or throw a UsageError.
// The verb file's own leading comment is its `--help` text, via usageFromHeader.

import type { CliBody } from "../lib/cli.mts";
import * as create from "./create.mts";
import * as doctor from "./doctor.mts";
import * as epic from "./epic.mts";
import * as list from "./list.mts";
import * as project from "./project.mts";
import * as show from "./show.mts";

export type Verb = { name: string; summary: string; run: CliBody };

/** In the order a session meets them: make work, read it, then the things around it. */
export const VERBS: Verb[] = [create, list, show, epic, project, doctor];
