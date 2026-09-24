// Overview.tsx: what the page opens on. The brief as a headline, what waits on a person
// where there is any, then every open epic with its health.
//
// Every row here is one of cn's lines, typeset. The pieces come from the `…Parts`
// functions in @cairn/cli's parts.mts, the same ones the lines themselves are joined
// from, and the text a row ends up with is the line: the separators cn prints stay in the
// markup, pale or unseen, so a row copied off the page pastes as cn's output.
// rows.test.tsx holds each row to that.
//
// Nothing here holds state or asks the deployment anything, so a test renders it to a
// string. The queries are in App.tsx.
import { blockerParts, healthParts } from "@cairn/cli/parts";
import type { BlockerLineView, BriefView, EpicLineView } from "@cairn/cli/views";
import type { Referable } from "@cairn/cli/ref";
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { headline, underline } from "./brief.ts";
import { Group } from "./page.tsx";
import { Ref, Refs, Run } from "./Ref.tsx";
import { HealthRows, RowLink } from "./rows.tsx";
import { StateWord } from "./tone.tsx";

export function Brief({ view }: { view: BriefView }) {
  const under = underline(view);
  return (
    <header>
      <h1 className="text-brief font-bold tracking-[-0.028em] text-balance narrow:text-[1.875rem]">
        {headline(view).map((clause, i) => (
          <Fragment key={clause.text}>
            {i > 0 && " "}
            <span className={cn("inline-block", clause.empty && "font-medium text-faint")}>
              {clause.text}
            </span>
          </Fragment>
        ))}
      </h1>
      {under && <p className="mt-3.5 text-base text-slate">{under}</p>}
    </header>
  );
}

/** `cn waiting`, as the block the page puts first: each blocker, and what it holds. */
export function Waiting({ blockers, now }: { blockers: WaitingBlocker[]; now: number }) {
  if (blockers.length === 0) return null;
  return (
    <Group title="Waiting on you" id="waiting-on-you" className="mt-10">
      <div className="paper paper-waiting divide-y divide-hair">
        {blockers.map((blocker) => (
          <BlockerRow key={blocker.id} blocker={blocker} now={now} />
        ))}
      </div>
    </Group>
  );
}

export type WaitingBlocker = BlockerLineView & { issues: Referable[] };

function BlockerRow({ blocker, now }: { blocker: WaitingBlocker; now: number }) {
  const { target, kind, tail } = blockerParts(blocker, now);
  return (
    <div className="divide-y divide-hair">
      {/* cn's order is reference, kind, tail; the page leads with the kind as its state word. */}
      <div className="grid grid-cols-[92px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 px-4 py-[13px] narrow:grid-cols-[78px_minmax(0,1fr)]">
        <Ref item={target} className="col-start-2 row-start-1" />{" "}
        <span className="col-start-1 row-start-1">
          <StateWord word={kind} tone="waiting" className="text-small" />
        </span>
        <span className="col-start-2 text-small text-slate">
          <span className="unseen"> · </span>
          <Run text={tail} />
        </span>
      </div>
      {blocker.issues.length > 0 && (
        <div className="grid grid-cols-[92px_minmax(0,1fr)] items-baseline gap-3 px-4 py-[11px] text-row narrow:grid-cols-[78px_minmax(0,1fr)]">
          <span className="text-small text-slate">holds</span>{" "}
          <span>
            <Refs items={blocker.issues} />
          </span>
        </div>
      )}
    </div>
  );
}

/** `cn epic list`: the epics with something to say first, then the ones with nothing moving. */
export function Epics({ epics, now }: { epics: EpicLineView[]; now: number }) {
  if (epics.length === 0)
    return (
      <p className="mt-10 text-slate">
        No open epics. <code className="font-mono text-small">cn epic new "…"</code> starts one.
      </p>
    );
  const parts = epics.map((epic) => healthParts(epic, now));
  const live = parts.filter((p) => p.rows.length > 0);
  const still = parts.filter((p) => p.rows.length === 0);
  return (
    <>
      {live.map(({ epic, counts, rows }, i) => (
        <section key={epic.id} className={i === 0 ? "mt-10" : "mt-8"}>
          <div className="mx-0.5 mb-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="text-title font-[620] tracking-[-0.012em]">
              <Ref item={epic} />
            </h2>{" "}
            <Run text={counts} className="ml-auto text-small text-slate narrow:ml-0" />
          </div>
          <HealthRows rows={rows} />
        </section>
      ))}
      {still.length > 0 && (
        <Group
          title="Nothing moving"
          id="nothing-moving"
          className={live.length === 0 ? "mt-10" : "mt-8"}
        >
          <ul className="paper divide-y divide-hair">
            {still.map(({ epic, counts }) => (
              <RowLink
                key={epic.id}
                href={`/${epic.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 narrow:grid-cols-1"
              >
                <Ref item={epic} plain className="decoration-faint underline-offset-[3px]" />{" "}
                <Run text={counts} className="text-small text-slate" />
              </RowLink>
            ))}
          </ul>
        </Group>
      )}
    </>
  );
}
