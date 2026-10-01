// ItemPages.tsx: the page for one id, `/cn-26`, `/ep-4`, `/bl-2`: what `cn show` prints,
// with room. An issue is its facts set by kind (Facts.tsx), then everything written into it
// in full where the brief has a first line, as one document, and its whole journal.
// An epic is its track, a cell per issue beside the closes of four weeks, what is stuck or
// waiting, and every issue under it, the finished ones too. A blocker is what it waits for
// and what it holds.
//
// Nothing here asks the deployment anything; App.tsx does, and these render what came
// back. Nothing here words a state or a proof either: `issueFacts` and `healthParts` do,
// and the page sets their pieces (sheet.test.tsx). The ask menu's lines come from prompts.ts.
import { JOURNAL_MAX } from "@cairn/backend/convex/lib/limits.js";
import {
  blockerFacts,
  healthParts,
  issueFacts,
  journalParts,
  linkFacts,
  proofParts,
} from "@cairn/cli/parts";
import type { ReviewView, ShownBlocker, ShownEpic, ShownIssue } from "@cairn/cli/views";
import type { Referable } from "@cairn/cli/ref";
import { Track } from "./Chart.tsx";
import { type Around, Document, IssueFacts } from "./Facts.tsx";
import type { WaitingBlocker } from "./Overview.tsx";
import { Group } from "./page.tsx";
import { closesOf, heldBy, trackOf } from "./projects.ts";
import { blockerPrompts, epicPrompts, issuePrompts } from "./prompts.ts";
import { Prose } from "./Prose.tsx";
import { Run } from "./Ref.tsx";
import { Groups, HealthRows, type Listed } from "./rows.tsx";
import { Crumbs, Heading, Neighbours, Sheet, State } from "./Sheet.tsx";
import { epicWord } from "./tone.tsx";

export function IssuePage({
  issue,
  siblings,
  around = {},
  now,
}: {
  issue: ShownIssue;
  /** Every issue of the same epic, in the order the epic lists them. */
  siblings: Referable[];
  /** The open epics, the projects and every issue, for what the tiles and chips add beside cn's facts. */
  around?: Around;
  now: number;
}) {
  const at = siblings.findIndex((s) => s.id === issue.id);
  const before = at > 0 ? siblings[at - 1] : undefined;
  const after = at >= 0 ? siblings[at + 1] : undefined;
  const where = at >= 0 ? `${at + 1} of ${siblings.length}` : "";
  const output = issue.verification && proofParts(issue.verification, now).output;
  const written: [string, string | undefined][] = [
    ["description", issue.description],
    ["design", issue.design],
    ["acceptance", issue.acceptance],
  ];
  const passages = written.flatMap(([label, text]) =>
    text ? [{ label, body: <Prose text={text} /> }] : [],
  );

  return (
    <article>
      <Crumbs epic={issue.epic}>
        <Neighbours compact before={before} after={after} where={where} />
      </Crumbs>
      <Heading item={issue} prompts={issuePrompts(issue, now)} />

      <IssueFacts facts={issueFacts(issue, now)} output={output} around={around} now={now} />
      <Document passages={passages} />

      {issue.journal.length > 0 && (
        <Group title="Journal">
          <ul className="paper divide-y divide-hair">
            {issue.journal.map((entry) => (
              <JournalEntry key={entry.at} entry={entry} now={now} />
            ))}
          </ul>
          {issue.journal.length >= JOURNAL_MAX && (
            <p className="mt-2 ml-0.5 text-meta text-slate">
              The {JOURNAL_MAX} newest. Older entries are in the history.
            </p>
          )}
        </Group>
      )}

      <Neighbours before={before} after={after} where={where} />
    </article>
  );
}

type Entry = ShownIssue["journal"][number];

/** `2h wsl/claude finding: …`, cn's line, with the kind drawn first and the age last. */
export function JournalEntry({ entry, now }: { entry: Entry; now: number }) {
  const { when, author, kind, body } = journalParts(entry, now);
  return (
    <li className="grid grid-cols-[116px_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5 px-4 py-[13px] narrow:grid-cols-[minmax(0,1fr)_auto]">
      <span className="col-start-3 row-start-1 text-meta text-slate narrow:col-start-2">
        {when}
      </span>{" "}
      <span className="col-start-2 row-start-1 text-small text-slate narrow:col-start-1 narrow:row-start-2">
        {author}
      </span>{" "}
      <span className="col-start-1 row-start-1 text-small font-[550]">
        {kind}
        <span className="unseen">: </span>
      </span>
      <div className="col-span-2 col-start-2 row-start-2 narrow:col-start-1 narrow:row-start-3">
        <Prose text={body} />
      </div>
    </li>
  );
}

export function EpicPage({
  epic,
  issues,
  review,
  blockers,
  now,
}: {
  epic: ShownEpic;
  issues: Listed[];
  /** The blockers on the list, for which of the epic's issues one holds; undefined until they answer. */
  blockers?: WaitingBlocker[];
  /** `cn review` of this epic, for the ask menu's line about a mess; undefined until it answers. */
  review?: ReviewView;
  now: number;
}) {
  const { counts, rows } = healthParts(epic, now);
  const links = linkFacts(epic.links, now);
  // What is moving is the track's moving cells and the In progress group; the rows keep what
  // nothing else on the page says, the stuck and the waiting.
  const pressing = rows.filter((row) => row.fact !== "moving");
  return (
    <article>
      <Crumbs />
      <Heading item={epic} prompts={epicPrompts(epic, review)} />
      <State word={epicWord(epic)}>
        <Run text={counts} />
      </State>

      <Track cells={trackOf(issues, epic, heldBy(blockers ?? []))} closes={closesOf(issues, now)} />
      {pressing.length > 0 && (
        <div className="mt-6">
          <HealthRows rows={pressing} />
        </div>
      )}
      {links.length > 0 && (
        <div className="mt-6">
          <Sheet facts={links} />
        </div>
      )}
      {epic.description && (
        <div className="mt-6">
          <Prose text={epic.description} />
        </div>
      )}

      {issues.length === 0 && (
        <p className="mt-8 text-slate">
          No issues yet.{" "}
          <code className="font-mono text-small">
            cn create --project … --epic {epic.id} --title "…"
          </code>{" "}
          files the first.
        </p>
      )}
      <Groups issues={issues} ownEpic />
    </article>
  );
}

export function BlockerPage({ blocker, now }: { blocker: ShownBlocker; now: number }) {
  const resolved = blocker.status === "resolved";
  return (
    <article>
      <Crumbs />
      <Heading item={blocker} prompts={blockerPrompts(blocker)} />
      <State word={resolved ? "resolved" : "waiting"}>
        {resolved ? blocker.resolution : `on ${blocker.owner}`}
      </State>
      <Sheet facts={blockerFacts(blocker, now)} />
    </article>
  );
}
