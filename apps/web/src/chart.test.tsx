// The drawings: a dot per live issue in its mark, a zone per priority with a limit, the
// empty lane's words, the legend; the pulse's bars and their titles; the strips' order and
// dots; the meter's fill and tick. None of them is a row, so none holds an `li`. Rendered to
// a string rather than to a DOM, like everything in this suite.
import { DAY, HOUR, agent, ago, now, project } from "@cairn/cli/testing";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Chart, Meter, Pulse, Strips, Track } from "./Chart.tsx";
import { plain } from "./plain.ts";
import { type Cell, type Mark, STUCK_RULE } from "./projects.ts";
import type { Listed } from "./rows.tsx";

const listed = (over: Partial<Listed>): Listed => ({
  id: "app-1",
  title: "the app",
  status: "open",
  priority: 2,
  claimedBy: undefined,
  epic: { id: "ep-1", title: "Ship invite links" },
  type: "task",
  project: "app",
  lastActivity: ago(HOUR),
  ...over,
});

const four = [
  listed({ id: "app-1", status: "in_progress", claimedBy: agent }),
  listed({ id: "app-2", lastActivity: ago(2 * DAY) }),
  listed({ id: "app-3", priority: 1, lastActivity: ago(5 * DAY) }),
  listed({ id: "app-4", priority: 3, epic: { id: "ep-2", title: "Scouts stop tripping" } }),
];
const marks = new Map<string, Mark>([
  ["app-1", "moving"],
  ["app-2", "waiting"],
  ["app-3", "stuck"],
  ["app-4", "open"],
]);
const held = new Map([["app-2", { id: "bl-1", title: "PostHog project settings" }]]);
const app = project({
  filed: 4,
  counts: {
    open: 3,
    inProgress: 1,
    closed: 0,
    dropped: 0,
    followUps: 0,
    recent: { days: 28, filed: 0, done: 0 },
  },
  health: {
    moving: [{ id: "app-1", title: "the app", claimedBy: agent, claimedAt: ago(HOUR) }],
    stuck: [{ id: "app-3", title: "the app", lastActivity: ago(5 * DAY) }],
    waiting: [{ id: "bl-1", title: "PostHog project settings", owner: "harbor" }],
  },
});
const admin = project({ slug: "admin", name: "Driftwood admin, the harbour office app" });

const lanes = [
  { project: app, issues: four, marks, held },
  { project: admin, issues: [], marks: new Map<string, Mark>(), held: new Map() },
];

const count = (markup: string, what: string) => markup.split(what).length - 1;

describe("Chart", () => {
  const markup = renderToStaticMarkup(<Chart lanes={lanes} now={now} />);

  it("draws each live issue a dot in its mark, a link to its page", () => {
    expect(markup.match(/<a [^>]*class="pt[ "]/g)).toHaveLength(4);
    for (const issue of four) expect(markup).toContain(`href="/${issue.id}"`);
    for (const cls of ['class="pt moving"', 'class="pt waiting"', 'class="pt stuck"', 'class="pt"'])
      expect(markup).toContain(cls);
    expect(markup).toContain('data-tip="app-2 &quot;the app&quot; · P2 · ep-1 · waiting on bl-1');
    // A dot near the left edge hangs its tooltip from its side, so the rail never covers it.
    expect(count(markup, 'data-edge="start"')).toBe(2);
  });

  it("draws a zone for each priority with a limit, in every lane", () => {
    expect(count(markup, "absolute right-0")).toBe(6);
    const solo = renderToStaticMarkup(<Chart lanes={lanes.slice(0, 1)} now={now} solo />);
    expect(count(solo, "absolute right-0")).toBe(3);
  });

  it("says what an empty lane is, and names each lane with a link to its project", () => {
    const text = plain(markup);
    expect(text).toContain("nothing filed yet");
    expect(text).not.toContain("nothing live");
    expect(markup).toContain('<a href="/projects/app"');
    expect(markup).toContain('<a href="/projects/admin"');
    for (const word of ["moving", "waiting on you", "stuck", "open", STUCK_RULE])
      expect(text).toContain(word);
  });

  it("labels no lane on a project's own page", () => {
    const solo = renderToStaticMarkup(<Chart lanes={lanes.slice(0, 1)} now={now} solo />);
    expect(solo).not.toContain('href="/projects/');
    expect(plain(solo)).not.toContain("4 live");
  });

  it("holds no row", () => {
    expect(markup).not.toContain("<li");
  });
});

describe("Pulse", () => {
  const pulse = Array.from({ length: 28 }, (_, k) =>
    k === 27 ? { events: 3, closes: 1 } : { events: 0, closes: 0 },
  );

  it("draws a bar a day, the closes in ink at the foot of the events", () => {
    const markup = renderToStaticMarkup(
      <Pulse pulse={pulse} height={30} max={3} caps={["4 weeks ago", "today"]} />,
    );
    expect(count(markup, "<i ")).toBe(28);
    expect(markup).toContain('title="today: 3 events, 1 closed"');
    expect(markup).toContain('title="1d ago: 0 events"');
    expect(markup).toContain("bg-ink/20");
    expect(markup).toMatch(/class="block rounded-\[1.5px\] bg-ink"/);
    expect(count(markup, "bg-ink/8")).toBe(27);
    expect(markup).not.toContain("<li");
  });

  it("draws only hairlines where nothing on the page happened", () => {
    const markup = renderToStaticMarkup(<Pulse pulse={pulse} height={30} max={0} caps={[]} />);
    expect(count(markup, "bg-ink/8")).toBe(28);
    expect(markup).not.toContain("bg-ink/20");
  });
});

describe("Strips", () => {
  it("lists the epic with the most live issues first, a dot each titled its reference", () => {
    const markup = renderToStaticMarkup(<Strips issues={four} marks={marks} />);
    expect(markup.indexOf('href="/ep-1"')).toBeLessThan(markup.indexOf('href="/ep-2"'));
    expect(count(markup, 'title="app-')).toBe(4);
    expect(markup).toContain('title="app-4 &quot;the app&quot;"');
    expect(markup).not.toContain("<li");
  });
});

describe("Meter", () => {
  it("fills to the silence on the chart's scale and ticks the limit", () => {
    const markup = renderToStaticMarkup(
      <Meter silentMs={3 * DAY} limit={7 * DAY} tone="stuck" title="silent 3d" />,
    );
    expect(markup).toMatch(/width:4\d\.\d+%/);
    expect(markup).toContain("left:");
    expect(markup).toContain("bg-stuck");
    expect(markup).toContain('title="silent 3d"');
  });

  it("ticks nothing where the priority has no limit", () => {
    const markup = renderToStaticMarkup(
      <Meter silentMs={3 * DAY} limit={undefined} tone="still" />,
    );
    expect(markup).not.toContain("<i");
    expect(markup).not.toContain("<li");
  });
});

describe("Track", () => {
  const quiet = Array.from({ length: 28 }, () => ({ events: 0, closes: 0 }));
  const cells: Cell[] = [
    { issue: listed({ id: "app-2", status: "closed" }), mark: "done", followUp: false },
    { issue: listed({ id: "app-1", status: "in_progress" }), mark: "moving", followUp: false },
    { issue: listed({ id: "app-3" }), mark: "stuck", followUp: false },
    { issue: listed({ id: "app-4" }), mark: "open", followUp: false },
    { issue: listed({ id: "app-5", type: "follow-up" }), mark: "open", followUp: true },
  ];

  it("draws a cell per issue, each a link with its reference and mark as its tooltip", () => {
    const markup = renderToStaticMarkup(<Track cells={cells} closes={quiet} />);
    expect(count(markup, 'class="cell ')).toBe(5);
    expect(markup.indexOf('href="/app-2"')).toBeLessThan(markup.indexOf('href="/app-1"'));
    expect(markup).toContain('data-tip="app-1 &quot;the app&quot; · moving"');
    expect(markup).toContain('data-tip="app-5 &quot;the app&quot; · follow-up, open"');
    expect(markup).toMatch(/class="cell [^"]*hatch"/);
    expect(markup).not.toContain("<li");
  });

  it("names what each fill means and how many closed in four weeks", () => {
    const closes = quiet.map((d, k) => (k === 27 ? { events: 2, closes: 2 } : d));
    expect(plain(renderToStaticMarkup(<Track cells={cells} closes={closes} />))).toBe(
      "1 done 1 moving 1 stuck 1 open 1 follow-up 2 closed in 4 weeks 4 weeks ago today",
    );
    expect(plain(renderToStaticMarkup(<Track cells={cells} closes={quiet} />))).toContain(
      "no closes in 4 weeks",
    );
  });

  it("draws nothing for an epic with no issue", () => {
    expect(renderToStaticMarkup(<Track cells={[]} closes={quiet} />)).toBe("");
  });
});
