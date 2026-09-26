// verbs/index.mts: the registry main.mts dispatches on. One file per verb; add it here.
//
// A verb exports `name`, `summary` (one line for `cn --help`), `spec` (the flags it
// takes, as it hands them to parseArgs) and `run(argv)`, which is a CLI body in the sense
// of lib/cli.mts: it may return an exit code or throw a UsageError. A verb's name is its
// file, `verbs/<name>.mts`, and that file's own leading comment is its `--help` text:
// `header(name)` reads it, for main.mts and for the test that holds the spec, the header
// and the docs to one another (contract.test.mts).

import type { ArgSpec } from "../lib/args.mts";
import { type CliBody, usageFromHeader } from "../lib/cli.mts";
import * as ack from "./ack.mts";
import * as brief from "./brief.mts";
import * as claim from "./claim.mts";
import * as close from "./close.mts";
import * as create from "./create.mts";
import * as dep from "./dep.mts";
import * as doctor from "./doctor.mts";
import * as drop from "./drop.mts";
import * as epic from "./epic.mts";
import * as init from "./init.mts";
import * as journal from "./journal.mts";
import * as list from "./list.mts";
import * as log from "./log.mts";
import * as project from "./project.mts";
import * as ready from "./ready.mts";
import * as release from "./release.mts";
import * as resolve from "./resolve.mts";
import * as review from "./review.mts";
import * as search from "./search.mts";
import * as show from "./show.mts";
import * as update from "./update.mts";
import * as wait from "./wait.mts";
import * as waiting from "./waiting.mts";

type Verb = { name: string; summary: string; spec: ArgSpec; run: CliBody };

/** The `--help` text of the verb called `name`: the leading comment of `verbs/<name>.mts`. */
export const header = (name: string): string =>
  usageFromHeader(new URL(`./${name}.mts`, import.meta.url).href);

/**
 * In the order a session meets them: make work, read it, work it from claim to close,
 * then the things around it.
 */
export const VERBS: Verb[] = [
  brief,
  create,
  list,
  search,
  ready,
  show,
  log,
  claim,
  release,
  update,
  journal,
  close,
  drop,
  dep,
  wait,
  waiting,
  ack,
  resolve,
  review,
  epic,
  project,
  doctor,
  init,
];
