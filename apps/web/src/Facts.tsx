// Facts.tsx: an issue's facts set by what they are, rather than as one table. Its epic,
// project and status are three tiles; its proof, or the reason it was dropped, a card with
// the output folded under it; its edges a neighbourhood, a row per kind and a chip per issue
// named; the directions finished work left for it a list; its links a list; and its description, design and acceptance one document at the
// column's width.
//
// Every fact is `issueFacts`', in cn's words and cn's order: each is set in its own element
// carrying `data-fact`, whose text is the label and the value `cn show` prints (sheet.test.tsx
// holds them to it). What the page adds beside a fact, the epic's count bar and counts, the
// project's word and name, the dot on each chip, sits outside that element.
import type { Fact, Named } from "@cairn/cli/parts";
import { healthParts } from "@cairn/cli/parts";
import type { EpicLineView, ProjectView } from "@cairn/cli/views";
import { CircleCheck, CircleDashed, Link2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CountBar } from "./Chart.tsx";
import { Ref, Run } from "./Ref.tsx";
import type { Listed } from "./rows.tsx";
import { NextList, OPENABLE } from "./Sheet.tsx";
import { Dot, Priority, type Tone, projectWord, toneOf, toneText } from "./tone.tsx";

/** What the page holds beside the issue: the open epics, the projects and every issue, each undefined until it answers. */
export type Around = {
  epics?: EpicLineView[];
  projects?: ProjectView[];
  issues?: Listed[];
};

const TILES = new Set(["epic", "project", "status"]);
const RECORD = new Set(["proof", "reason"]);

/** A fact's name, small, with the space cn's column puts after it kept in the text. */
function Label({ children }: { children: string }) {
  return (
    <>
      <span className="text-meta text-slate">{children}</span>{" "}
    </>
  );
}

export function IssueFacts({
  facts,
  output,
  around,
  now,
}: {
  facts: Fact[];
  /** What the command a close ran said, folded under the proof. */
  output?: string;
  around: Around;
  now: number;
}) {
  const of = (label: string) => facts.find((f) => f.label === label);
  const record = facts.filter((f) => RECORD.has(f.label));
  const edges = facts.filter((f) => !TILES.has(f.label) && !RECORD.has(f.label) && f.refs);
  const links = of("links");
  const next = of("next");
  return (
    <>
      <div className="mt-6 grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,1.3fr)] gap-3 narrow:grid-cols-2">
        <EpicTile fact={of("epic")} epics={around.epics} now={now} />
        <ProjectTile fact={of("project")} projects={around.projects} />
        <StatusTile fact={of("status")} />
      </div>
      {record.length > 0 && <Record facts={record} output={output} />}
      {edges.length > 0 && <Neighbourhood facts={edges} issues={around.issues} />}
      {next?.next && (
        <div data-fact="next" className="paper mt-3 px-4 pt-2.5 pb-2">
          <Label>next</Label>
          <NextList items={next.next} className="text-row" />
        </div>
      )}
      {links?.links && <Links fact={links} />}
    </>
  );
}

const TILE = "paper flex flex-col gap-2.5 px-4 pt-3 pb-3.5";

function EpicTile({ fact, epics, now }: { fact?: Fact; epics?: EpicLineView[]; now: number }) {
  const epic = fact?.refs?.[0];
  if (!epic) return null;
  const view = epics?.find((e) => e.id === epic.id);
  const counts = view && healthParts(view, now).counts;
  return (
    <div className={cn(TILE, "narrow:col-span-2")}>
      <div data-fact="epic" className="grid gap-1">
        <Label>epic</Label>
        <Ref item={epic} className="line-clamp-2 text-row font-[550]" />
      </div>
      {view && counts && (
        <p className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <CountBar counts={view.counts} type={view.type} text={counts} />
          <Run text={counts} className="text-meta text-slate" />
        </p>
      )}
    </div>
  );
}

function ProjectTile({ fact, projects }: { fact?: Fact; projects?: ProjectView[] }) {
  const slug = fact?.text;
  if (slug === undefined) return null;
  const project = projects?.find((p) => p.slug === slug);
  const word = project && projectWord(project);
  return (
    <div className={TILE}>
      <div data-fact="project" className="grid gap-1">
        <Label>project</Label>
        <a
          href={`/projects/${slug}`}
          className="font-mono text-row font-[650] decoration-faint underline-offset-[3px] hover:underline"
        >
          {slug}
        </a>
      </div>
      {project && word && (
        <>
          <p className="-mt-1.5 truncate text-meta text-slate" title={project.name}>
            {project.name}
          </p>
          <p className="mt-auto flex items-center gap-2 text-meta">
            <Dot tone={toneOf(word)} />
            <span className={cn("font-medium", toneText(toneOf(word)))}>{word}</span>
          </p>
        </>
      )}
    </div>
  );
}

/**
 * cn's status line, `closed 3h ago · P3 · created 4h ago · revision 3`, its pieces set
 * apart: the state in its tone, the priority a badge, the rest small. The separators stay in
 * the text, unseen.
 */
function StatusTile({ fact }: { fact?: Fact }) {
  if (fact?.text === undefined) return null;
  const [head = "", ...rest] = fact.text.split(" · ");
  const tone = toneOf(head.split(" ")[0] ?? "");
  return (
    <div className={TILE}>
      <div data-fact="status" className="grid gap-1.5">
        <Label>status</Label>
        <span className="flex flex-col gap-2">
          <span
            className={cn(
              "inline-flex items-start gap-2 text-body font-[620]",
              tone === "still" ? "text-ink" : toneText(tone),
            )}
          >
            <Dot tone={tone} className="mt-[0.5em]" />
            {head}
          </span>
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-meta text-slate">
            {rest.map((piece) => (
              <span key={piece}>
                <span className="unseen"> · </span>
                <Priority token={piece} />
              </span>
            ))}
          </span>
        </span>
      </div>
    </div>
  );
}

/** `vp run verify (exit 0)`, the command and its exit code apart. */
const RAN = /^(.*) \(exit (-?\d+)\)$/;

/**
 * How it ended: the proof a close stored, the command in mono and its exit code a badge, who
 * and when after them, with what the command said folded under it; or the reason a drop gave.
 */
function Record({ facts, output }: { facts: Fact[]; output?: string }) {
  return (
    <div className="paper mt-3 divide-y divide-hair">
      {facts.map((fact) => {
        const ran = fact.code?.match(RAN);
        const Icon = fact.label === "proof" ? (ran ? CircleCheck : CircleDashed) : undefined;
        return (
          <div key={fact.label} className="flex items-start gap-3 px-4 py-3">
            {Icon && <Icon className="mt-[3px] size-4 shrink-0 text-slate" aria-hidden="true" />}
            <div data-fact={fact.label} className="grid min-w-0 gap-1">
              <Label>{fact.label}</Label>
              <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                {ran && (
                  <>
                    <code className="font-mono text-row font-medium break-all">{ran[1]}</code>{" "}
                    <span className="rounded-[5px] bg-ink/7 px-1.5 py-px font-mono text-meta">
                      <span className="unseen">(</span>exit {ran[2]}
                      <span className="unseen">)</span>
                    </span>{" "}
                  </>
                )}
                {fact.code && !ran && <code className="font-mono">{fact.code} </code>}
                <span className={cn(ran ? "text-meta text-slate" : "text-row")}>{fact.text}</span>
              </span>
            </div>
          </div>
        );
      })}
      {output !== undefined && output.trim() !== "" && (
        <details className="group">
          <summary className="cursor-pointer px-4 py-2.5 text-small text-slate hover:text-ink">
            output
          </summary>
          <pre className="max-h-72 overflow-auto px-4 pb-3.5 font-mono text-micro whitespace-pre-wrap text-code">
            {output}
          </pre>
        </details>
      )}
    </div>
  );
}

/** A named issue's dot: done in ink, dropped faint, a blocker waiting, else the issue's own state. */
function dotOf(item: Named, issues?: Listed[]): { tone?: Tone; className?: string } {
  if (item.tail === "done") return { className: "bg-ink/70" };
  if (item.tail === "dropped") return { className: "bg-ink/15" };
  if (item.id.startsWith("bl-")) return { tone: "waiting" };
  const status = issues?.find((i) => i.id === item.id)?.status;
  return { tone: status === "in_progress" ? "moving" : "still" };
}

/** The issue's edges, a row per kind in cn's order and a chip per issue named, each with its state's dot. */
function Neighbourhood({ facts, issues }: { facts: Fact[]; issues?: Listed[] }) {
  return (
    <div className="paper mt-3 divide-y divide-hair">
      {facts.map((fact) => (
        <div
          key={fact.label}
          data-fact={fact.label}
          className="grid grid-cols-[116px_minmax(0,1fr)] items-baseline gap-3 px-4 py-2.5 narrow:grid-cols-1 narrow:gap-1.5"
        >
          <Label>{fact.label}</Label>
          <span className="flex flex-wrap gap-1.5">
            {(fact.refs ?? []).map((item, i) => {
              const dot = dotOf(item, issues);
              return (
                <span
                  key={item.id}
                  className={cn(
                    "rounded-lg bg-ink/[0.04] px-2 py-[3px] text-row",
                    item.tail && "text-slate",
                  )}
                >
                  {i > 0 && <span className="unseen">, </span>}
                  <Dot
                    tone={dot.tone ?? "still"}
                    className={cn("mr-1.5 inline-block size-[7px] align-middle", dot.className)}
                  />
                  <Ref item={item} />
                  {item.tail && <span className="text-slate"> {item.tail}</span>}
                </span>
              );
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The links, one item each, each item's text cn's `linkLine`: the label, the URL and who
 * added it, the separators unseen and the URL cut to the row. Items, because the page's plain
 * text breaks a line at `</li>`.
 */
function Links({ fact }: { fact: Fact }) {
  return (
    <div data-fact="links" className="paper mt-3 px-4 pt-2.5 pb-1">
      <Label>links</Label>
      <ul className="divide-y divide-hair">
        {(fact.links ?? []).map(({ url, label, by }) => {
          const text = label ?? url;
          return (
            <li key={url} className="flex min-w-0 items-baseline gap-2.5 py-2 text-row">
              <Link2
                className="size-3.5 shrink-0 translate-y-[2px] text-faint"
                aria-hidden="true"
              />
              {OPENABLE.test(url) ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "underline decoration-mark underline-offset-[3px] transition-colors hover:decoration-ink",
                    label ? "shrink-0 font-[550]" : "min-w-0 truncate",
                  )}
                >
                  {text}
                </a>
              ) : (
                <span className={label ? "shrink-0" : "min-w-0 truncate"}>{text}</span>
              )}
              {label && (
                <span className="min-w-0 truncate text-meta text-slate" title={url}>
                  <span className="unseen"> · </span>
                  {url}
                </span>
              )}
              <span className="ml-auto shrink-0 text-meta text-faint narrow:hidden">
                <span className="unseen"> · </span>
                {by}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The issue's long text as one document: a section each, its name over it, at the column's width. */
export function Document({ passages }: { passages: { label: string; body: ReactNode }[] }) {
  if (passages.length === 0) return null;
  return (
    <div className="paper mt-6 divide-y divide-hair">
      {passages.map(({ label, body }) => (
        <section key={label} className="px-5 pt-3.5 pb-4.5 narrow:px-4">
          <h2 className="mb-2 text-small font-semibold text-slate">{label}</h2>
          <div className="min-w-0">{body}</div>
        </section>
      ))}
    </div>
  );
}
