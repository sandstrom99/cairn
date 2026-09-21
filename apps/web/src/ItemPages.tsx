// ItemPages.tsx: the page for one id, `/cn-26`, `/ep-4`, `/bl-2`: what `cn show` prints,
// with room. An issue is its facts, then everything written into it in full where the
// brief has a first line, then its proof and its journal. An epic is its health and every
// issue under it, the finished ones too. A blocker is what it waits for and what it holds.
//
// Nothing here asks the deployment anything; App.tsx does, and these render what came back.
import {
  type EpicLineView,
  type IssueLineView,
  type ShownBlocker,
  type ShownEpic,
  type ShownIssue,
  age,
  blockerFacts,
  healthParts,
  issueFacts,
  journalParts,
  since,
} from "@cairn/cli/src/lib/format.mts";
import type { Referable } from "@cairn/cli/src/lib/ref.mts";
import { IssueRows } from "./IssueRows.tsx";
import { HealthRows } from "./Overview.tsx";
import { Prose } from "./Prose.tsx";
import type { ReactNode } from "react";
import { Run } from "./Ref.tsx";
import {
  Crumbs,
  Group,
  Heading,
  Neighbours,
  Passage,
  Refs,
  Sheet,
  State,
  type Tone,
} from "./Sheet.tsx";

/** An issue as a list carries it: enough for a row, and which epic and kind it is. */
export type Listed = IssueLineView & { epic: Referable; type: string };

/** The one line of state at the top of an issue, in cn's words for each. */
function stateOf(
  issue: ShownIssue,
  stuck: EpicLineView["health"]["stuck"],
  now: number,
): { tone: Tone; word: string; rest?: ReactNode } {
  if (issue.status === "in_progress")
    return {
      tone: "moving",
      word: "moving",
      rest: `${issue.claimedBy?.name ?? ""} ${issue.claimedAt === undefined ? "" : age(issue.claimedAt, now)}`,
    };
  if (issue.status === "open" && issue.waitingOn.length > 0)
    return {
      tone: "waiting",
      word: "waiting",
      rest: (
        <>
          on <Refs items={issue.waitingOn} />
        </>
      ),
    };
  if (stuck?.id === issue.id)
    return { tone: "stuck", word: "stuck", rest: `silent ${age(stuck.lastActivity, now)}` };
  if (issue.status === "open" && issue.blockedBy.length > 0)
    return {
      tone: "still",
      word: "blocked",
      rest: (
        <>
          by <Refs items={issue.blockedBy} />
        </>
      ),
    };
  if (issue.status === "closed")
    return {
      tone: "still",
      word: "closed",
      rest: issue.closedAt === undefined ? undefined : since(issue.closedAt, now),
    };
  if (issue.status === "dropped")
    return { tone: "still", word: "dropped", rest: issue.droppedReason };
  return { tone: "still", word: "open", rest: "nobody holds it" };
}

export function IssuePage({
  issue,
  siblings,
  stuck,
  now,
}: {
  issue: ShownIssue;
  /** Every issue of the same epic, in the order the epic lists them. */
  siblings: Referable[];
  stuck: EpicLineView["health"]["stuck"];
  now: number;
}) {
  const at = siblings.findIndex((s) => s.id === issue.id);
  const before = at > 0 ? siblings[at - 1] : undefined;
  const after = at >= 0 ? siblings[at + 1] : undefined;
  const where = at >= 0 ? `${at + 1} of ${siblings.length}` : "";
  const state = stateOf(issue, stuck, now);
  const proof = issue.verification;

  return (
    <article>
      <Crumbs epic={issue.epic}>
        <Neighbours compact before={before} after={after} where={where} />
      </Crumbs>
      <Heading item={issue} />
      <State tone={state.tone} word={state.word}>
        {state.rest}
      </State>

      <Sheet facts={issueFacts(issue, now)}>
        {issue.description && (
          <Passage label="description">
            <Prose text={issue.description} />
          </Passage>
        )}
        {issue.design && (
          <Passage label="design">
            <Prose text={issue.design} />
          </Passage>
        )}
        {issue.acceptance && (
          <Passage label="acceptance">
            <Prose text={issue.acceptance} />
          </Passage>
        )}
      </Sheet>

      {proof && (
        <Group title="Proof it is done">
          <div className="paper divide-y divide-hair">
            {"command" in proof ? (
              <>
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-[13px]">
                  <code className="font-mono text-row">{proof.command}</code>{" "}
                  <span className="text-small text-slate">
                    exit {proof.exitCode}, run by {proof.by.name} {since(proof.at, now)}
                  </span>
                </p>
                {proof.output.trim() !== "" && (
                  <pre className="max-h-72 overflow-auto px-4 py-3 font-mono text-micro whitespace-pre-wrap text-[#3a4150]">
                    {proof.output}
                  </pre>
                )}
              </>
            ) : (
              <p className="px-4 py-[13px] text-row">
                Closed unverified by {proof.by.name} {since(proof.at, now)}: {proof.unverified}
              </p>
            )}
          </div>
        </Group>
      )}

      {issue.journal.length > 0 && (
        <Group title="Journal">
          <ul className="paper divide-y divide-hair">
            {issue.journal.map((entry) => (
              <JournalEntry key={entry.at} entry={entry} now={now} />
            ))}
          </ul>
          {issue.journal.length >= 5 && (
            <p className="mt-2 ml-0.5 text-meta text-slate">
              The five newest, which is what cn show carries. Older entries are in the history.
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
    <li className="grid grid-cols-[116px_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5 px-4 py-[13px] max-[720px]:grid-cols-[minmax(0,1fr)_auto]">
      <span className="col-start-3 row-start-1 text-meta text-slate max-[720px]:col-start-2">
        {when}
      </span>{" "}
      <span className="col-start-2 row-start-1 text-small text-slate max-[720px]:col-start-1 max-[720px]:row-start-2">
        {author}
      </span>{" "}
      <span className="col-start-1 row-start-1 text-small font-[550]">
        {kind}
        <span className="unseen">: </span>
      </span>
      <div className="col-span-2 col-start-2 row-start-2 max-[720px]:col-start-1 max-[720px]:row-start-3">
        <Prose text={body} />
      </div>
    </li>
  );
}

const GROUPS: { title: string; pick: (issue: Listed) => boolean }[] = [
  { title: "In progress", pick: (i) => i.status === "in_progress" },
  { title: "Open", pick: (i) => i.status === "open" && i.type !== "follow-up" },
  { title: "Follow-ups", pick: (i) => i.status === "open" && i.type === "follow-up" },
  { title: "Closed", pick: (i) => i.status === "closed" },
  { title: "Dropped", pick: (i) => i.status === "dropped" },
];

/** A row on an epic's own page does not repeat the epic, the way `cn show ep-3` does not. */
const withoutEpic = ({ id, title, status, priority, claimedBy }: Listed): IssueLineView => ({
  id,
  title,
  status,
  priority,
  claimedBy,
});

export function EpicPage({
  epic,
  issues,
  now,
}: {
  epic: ShownEpic;
  issues: Listed[];
  now: number;
}) {
  const { counts, rows } = healthParts(epic, now);
  const tone: Tone =
    epic.health.waiting.length > 0
      ? "waiting"
      : epic.health.stuck
        ? "stuck"
        : epic.health.moving.length > 0
          ? "moving"
          : "still";
  const word = tone === "still" ? (epic.status === "open" ? "nothing moving" : epic.status) : tone;
  return (
    <article>
      <Crumbs />
      <Heading item={epic} />
      <State tone={tone} word={word}>
        <Run text={counts} />
      </State>

      {rows.length > 0 && (
        <div className="mt-6">
          <HealthRows rows={rows} />
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
      {GROUPS.map(({ title, pick }) => {
        const picked = issues.filter(pick);
        if (picked.length === 0) return null;
        return (
          <Group key={title} title={title} count={picked.length}>
            <IssueRows issues={picked.map(withoutEpic)} />
          </Group>
        );
      })}
    </article>
  );
}

export function BlockerPage({ blocker, now }: { blocker: ShownBlocker; now: number }) {
  const resolved = blocker.status === "resolved";
  return (
    <article>
      <Crumbs />
      <Heading item={blocker} />
      <State tone={resolved ? "still" : "waiting"} word={resolved ? "resolved" : "waiting"}>
        {resolved ? blocker.resolution : `on ${blocker.owner}`}
      </State>
      <Sheet facts={blockerFacts(blocker, now)} />
    </article>
  );
}
