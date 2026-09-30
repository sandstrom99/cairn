// ProjectPages.tsx: the two pages about projects. Projects is `cn project list` with room: a
// headline that says per project the one thing to know, most pressing first; the chart,
// every live issue a dot in its project's lane; then each project's block, its head line and
// health rows as `cn project list` prints them, its description and links between the two,
// and under the rows its pulse beside where the work is. A project's own page is that one
// project: its state said as a sentence, the chart alone, the pulse and the strips side by
// side, then its live issues grouped as Moving, Waiting on you, Stuck and Open, each row the
// line `cn list --silent 0d` prints with a meter of its silence, and the closes of the last
// four weeks folded away.
//
// Every row is one of cn's lines, from @cairn/cli's parts, and rows.test.tsx holds it to the
// line. The drawings (Chart.tsx) are what `projects.list`, `issues.list` and `blockers.list`
// answered, and the page's own sentences are projects.ts's. Nothing here decides a fact the
// deployment did not: an issue is stuck because its project's health names it, and waiting
// because a listed blocker holds it.
import { type HealthParts, projectParts } from "@cairn/cli/parts";
import type { ListLineView, ProjectView } from "@cairn/cli/views";
import { Link } from "lucide-react";
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { Chart, type Lane, Pulse, Strips } from "./Chart.tsx";
import { Lost } from "./Gate.tsx";
import type { WaitingBlocker } from "./Overview.tsx";
import { Group, Pending, Title } from "./page.tsx";
import {
  type Mark,
  NO_PULSE,
  NOTHING_FILED,
  clauseOf,
  closedIn,
  countsLine,
  heldBy,
  liveIn,
  markOf,
  orderProjects,
  shown,
  stateLine,
  subline,
} from "./projects.ts";
import { Prose } from "./Prose.tsx";
import { Ref, Run } from "./Ref.tsx";
import { HealthRows, IssueRows, type Listed } from "./rows.tsx";
import { OPENABLE } from "./Sheet.tsx";
import { Dot, StateWord, type Tone, projectWord, toneOf, toneText } from "./tone.tsx";

type Reads = {
  projects: ProjectView[] | undefined;
  issues: Listed[] | undefined;
  blockers: WaitingBlocker[] | undefined;
  now: number;
};

/** A project's lane: its live issues, the mark each carries, and the blockers holding them. */
function laneOf(project: ProjectView, issues: Listed[], held: Lane["held"]): Lane {
  const live = liveIn(issues, project.slug);
  const marks = new Map<string, Mark>(live.map((i) => [i.id, markOf(i, project, held)]));
  return { project, issues: live, marks, held };
}

const sum = (pulse: NonNullable<ProjectView["pulse"]>, of: "events" | "closes"): number =>
  pulse.reduce((total, day) => total + day[of], 0);

const most = (pulse: NonNullable<ProjectView["pulse"]>): number =>
  Math.max(0, ...pulse.map((d) => d.events));

const CHART = "How long since each issue moved";
const CHART_ASIDE = "every dot is an issue · higher is more urgent";

export function ProjectsPage({ projects, issues, blockers, now }: Reads) {
  if (projects === undefined || issues === undefined || blockers === undefined)
    return <Pending>Reading the projects…</Pending>;
  if (projects.length === 0)
    return (
      <article>
        <Title>Projects</Title>
        <p className="mt-2 text-slate">None yet. Ask your agent to set up the first project.</p>
      </article>
    );
  const held = heldBy(blockers);
  const lanes = orderProjects(projects).map((p) => laneOf(p, issues, held));
  const pulseMax = Math.max(0, ...projects.map((p) => most(p.pulse ?? NO_PULSE)));
  return (
    <article>
      <header>
        <h1 className="text-brief font-bold tracking-[-0.028em] text-balance narrow:text-[1.875rem]">
          {lanes.map(({ project }, i) => {
            const clause = clauseOf(project);
            return (
              <Fragment key={clause.slug}>
                {i > 0 && " "}
                <span className={cn("inline-block", clause.empty && "font-medium text-faint")}>
                  <span className="font-mono font-[650] tracking-[-0.02em]">{clause.slug}</span>
                  {clause.pieces.map((piece, k) => (
                    // A clause's pieces never reorder, so the index is a stable key.
                    <span key={k} className={piece.tone && toneText(piece.tone)}>
                      {piece.text}
                    </span>
                  ))}
                </span>
              </Fragment>
            );
          })}
        </h1>
        <p className="mt-3.5 text-base text-slate">
          <Run text={subline(projects)} />
        </p>
      </header>
      <Group title={CHART} id="chart" aside={CHART_ASIDE} className="mt-10">
        {/* overflow-visible over .paper's hidden, so a dot's tooltip can stand above the card. */}
        <div className="paper overflow-visible">
          <Chart lanes={lanes} now={now} />
        </div>
      </Group>
      {lanes.map((lane) => (
        <ProjectSection key={lane.project.slug} lane={lane} pulseMax={pulseMax} now={now} />
      ))}
    </article>
  );
}

/** One project's block on Projects: its `cn project list` lines, then its pulse and where its work is. */
function ProjectSection({ lane, pulseMax, now }: { lane: Lane; pulseMax: number; now: number }) {
  const { project, issues: live, marks } = lane;
  const { rows }: HealthParts = projectParts(project, now);
  const open = live.filter((i) => i.status === "open").length;
  const inProgress = live.filter((i) => i.status === "in_progress").length;
  return (
    <section className="mt-[34px]">
      <ProjectHead project={project} now={now} />
      <About project={project} />
      {project.filed > 0 && (
        <div className="paper divide-y divide-hair">
          {rows.length > 0 && <HealthRows rows={rows} className="divide-y divide-hair" />}
          <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-x-[26px] gap-y-[18px] px-4 pt-3.5 pb-[15px] narrow:grid-cols-1">
            <div>
              <div className="mb-[7px] text-meta text-slate">
                <Run
                  text={`${open} open · ${inProgress} in progress · ${sum(project.pulse ?? NO_PULSE, "closes")} closed in 4 weeks`}
                />
              </div>
              <Pulse
                pulse={project.pulse ?? NO_PULSE}
                height={30}
                max={pulseMax}
                caps={["4 weeks ago", "today"]}
              />
            </div>
            {live.length > 0 && (
              <div>
                <div className="mb-[7px] text-meta text-slate">Where the work is</div>
                <Strips issues={live} marks={marks} />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** A project's head line, as `cn project list` prints it: the slug and name in the reference form, then its counts. */
export function ProjectHead({ project, now }: { project: ProjectView; now: number }) {
  const { epic, counts } = projectParts(project, now);
  return (
    <div className="mx-0.5 mb-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <h2 className="inline-flex items-baseline gap-2.5 text-title font-[620] tracking-[-0.012em]">
        <Dot tone={toneOf(projectWord(project))} className="translate-y-[-1px]" />
        <Ref item={epic} href={`/projects/${project.slug}`} />
      </h2>{" "}
      <Run text={counts} className="ml-auto text-small text-slate narrow:ml-0" />
    </div>
  );
}

/** A project's description and links, where it has them. */
function About({ project }: { project: ProjectView }) {
  return (
    <>
      {project.description && (
        <div className="mx-0.5 mb-2.5">
          <Prose text={project.description} className="text-small text-slate" />
        </div>
      )}
      <Chips links={project.links} />
    </>
  );
}

const CHIP =
  "inline-flex h-[26px] items-center gap-1.5 rounded-lg bg-lift/90 pr-2.5 pl-2 text-meta text-slate shadow-ring hover:text-ink";

/** A project's links, a chip each: the label, then the URL without its scheme. Only http and https open. */
function Chips({ links }: { links: ProjectView["links"] }) {
  if (links === undefined || links.length === 0) return null;
  return (
    <div className="mx-0.5 mb-2.5 flex flex-wrap gap-1.5">
      {links.map(({ url, label }) => {
        const body = (
          <>
            <Link className="size-[13px]" />
            {label && <>{label} </>}
            <b className="font-mono font-medium text-ink">{shown(url)}</b>
          </>
        );
        return OPENABLE.test(url) ? (
          <a key={url} href={url} target="_blank" rel="noreferrer" className={CHIP}>
            {body}
          </a>
        ) : (
          <span key={url} className={CHIP}>
            {body}
          </span>
        );
      })}
    </div>
  );
}

/** A live issue as `cn list --silent 0d` lists it: silent since it last moved. */
const silent = (issue: Listed): ListLineView => ({ ...issue, silentSince: issue.lastActivity });

/** The order an id holds in a list the deployment answered, anything it does not name last. */
const inOrder =
  (ids: { id: string }[]) =>
  (a: Listed, b: Listed): number => {
    const at = (i: Listed) => {
      const k = ids.findIndex((x) => x.id === i.id);
      return k === -1 ? ids.length : k;
    };
    return at(a) - at(b);
  };

export function ProjectPage({ slug, projects, issues, blockers, now }: Reads & { slug: string }) {
  if (projects === undefined || issues === undefined || blockers === undefined)
    return <Pending>Reading the projects…</Pending>;
  const project = projects.find((p) => p.slug === slug);
  if (!project) return <Lost what={`/projects/${slug}`} />;
  const held = heldBy(blockers);
  const lane = laneOf(project, issues, held);
  const { issues: live, marks } = lane;
  const closed = closedIn(issues, slug, now);
  const marked = (mark: Mark) => live.filter((i) => marks.get(i.id) === mark);
  const epics = new Set(live.map((i) => i.epic.id)).size;
  const lists: { title: string; rows: Listed[]; tone: Tone }[] = [
    {
      title: "Moving",
      rows: marked("moving").sort(inOrder(project.health.moving)),
      tone: "moving",
    },
    { title: "Waiting on you", rows: marked("waiting"), tone: "waiting" },
    { title: "Stuck", rows: marked("stuck").sort(inOrder(project.health.stuck)), tone: "stuck" },
    {
      title: "Open",
      rows: marked("open").sort(
        (a, b) => a.priority - b.priority || a.lastActivity - b.lastActivity,
      ),
      tone: "still",
    },
  ];
  return (
    <article>
      <p className="text-small text-slate">
        <a href="/projects" className="hover:text-ink">
          Projects
        </a>{" "}
        <span className="text-mark">/</span>
      </p>
      <div className="mt-1.5 mb-1 flex flex-wrap items-baseline gap-x-[18px] gap-y-1.5">
        <Title className="font-mono">{slug}</Title>
        <StateWord word={projectWord(project)} className="ml-auto text-row narrow:ml-0" />
      </div>
      <p className="mb-3 text-base text-slate">{project.name}</p>
      <About project={project} />
      <p className="mt-[22px] text-[1.3125rem] leading-[1.3] font-[620] tracking-[-0.015em] text-balance">
        {stateLine(project).map((piece, k) => (
          // The line's pieces never reorder, so the index is a stable key.
          <span
            key={k}
            className={
              piece.tone === undefined
                ? undefined
                : piece.tone === "still"
                  ? "font-medium text-faint"
                  : toneText(piece.tone)
            }
          >
            {piece.text}
          </span>
        ))}
      </p>
      <p className="mt-1.5 text-small text-slate">
        {project.filed > 0 ? <Run text={countsLine(live, closed)} /> : NOTHING_FILED}
      </p>
      <Group title={CHART} id="chart" aside={CHART_ASIDE} className="mt-10">
        <div className="paper overflow-visible">
          <Chart lanes={[lane]} now={now} solo />
        </div>
      </Group>
      {project.filed > 0 && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-6 narrow:grid-cols-1">
            <Group
              title="The last four weeks"
              aside={
                <Run
                  text={`${sum(project.pulse ?? NO_PULSE, "events")} events · ${sum(project.pulse ?? NO_PULSE, "closes")} closed`}
                />
              }
              className="mt-0"
            >
              <div className="paper px-4 pt-3.5 pb-3">
                <Pulse
                  pulse={project.pulse ?? NO_PULSE}
                  height={64}
                  max={most(project.pulse ?? NO_PULSE)}
                  caps={["4 weeks ago", "2 weeks", "today"]}
                />
              </div>
            </Group>
            <Group
              title="Where the work is"
              aside={`${epics} ${epics === 1 ? "epic" : "epics"}`}
              className="mt-0"
            >
              <div className="paper px-4 pt-3.5 pb-3">
                {live.length > 0 ? (
                  <Strips issues={live} marks={marks} wide />
                ) : (
                  <p className="text-small text-faint">nothing live</p>
                )}
              </div>
            </Group>
          </div>
          {lists.map(
            ({ title, rows, tone }) =>
              rows.length > 0 && (
                <Group key={title} title={title} count={rows.length}>
                  <IssueRows issues={rows.map(silent)} now={now} meter={tone} />
                </Group>
              ),
          )}
          {closed.length > 0 && (
            <Group title="Closed in the last 4 weeks" count={closed.length} folded>
              <IssueRows issues={closed} />
            </Group>
          )}
        </>
      )}
    </article>
  );
}
