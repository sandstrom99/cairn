// The two Projects pages: what stands while they read, what each says with nothing in it,
// and a project's own page grouping its live issues by what each is and folding its closes.
// Rendered to a string rather than to a DOM, like everything in this suite.
import { DAY, HOUR, agent, ago, now, project } from "@cairn/cli/testing";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WaitingBlocker } from "./Overview.tsx";
import { ProjectPage, ProjectsPage } from "./ProjectPages.tsx";
import { plain } from "./plain.ts";
import { NOTHING_FILED } from "./projects.ts";
import { typesetting } from "./Prose.tsx";
import type { Listed } from "./rows.tsx";
import { text } from "./testing.tsx";

// The page's passages are set once Markdown.tsx is in (Prose.tsx).
await typesetting;

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

const issues = [
  listed({ id: "app-1", title: "the invite flow", status: "in_progress", claimedBy: agent }),
  listed({ id: "app-2", title: "PostHog masks IPs" }),
  listed({ id: "app-3", title: "the settings page", priority: 1, lastActivity: ago(5 * DAY) }),
  listed({ id: "app-4", title: "the profile", priority: 3 }),
  listed({ id: "app-5", title: "the gallery", priority: 4 }),
  listed({ id: "app-6", title: "the support URL", status: "closed", closedAt: ago(3 * DAY) }),
];

const blockers: WaitingBlocker[] = [
  {
    id: "bl-1",
    title: "PostHog project settings",
    blockerKind: "decision",
    owner: "harbor",
    status: "raised",
    raisedAt: ago(HOUR),
    raisedBy: agent,
    issues: [{ id: "app-2", title: "PostHog masks IPs" }],
  },
];

const app = project({
  slug: "app",
  name: "Driftwood: the app",
  filed: 6,
  counts: {
    open: 4,
    inProgress: 1,
    closed: 1,
    dropped: 0,
    followUps: 0,
    recent: { days: 28, filed: 0, done: 0 },
  },
  health: {
    moving: [{ id: "app-1", title: "the invite flow", claimedBy: agent, claimedAt: ago(HOUR) }],
    stuck: [{ id: "app-3", title: "the settings page", lastActivity: ago(5 * DAY) }],
    waiting: [{ id: "bl-1", title: "PostHog project settings", owner: "harbor" }],
  },
});

/** The titles of the page's sections, each with its count. */
const titles = (markup: string) =>
  [...markup.matchAll(/<(?:h2|summary)[^>]*>(.*?)<\/(?:h2|summary)>/g)].map((m) => plain(m[1]!));

describe("ProjectsPage", () => {
  it("says there are none, with no chart, where no project is set up", () => {
    const markup = renderToStaticMarkup(
      <ProjectsPage projects={[]} issues={[]} blockers={[]} now={now} />,
    );
    expect(plain(markup)).toContain("None yet.");
    expect(markup).not.toMatch(/class="pt[ "]/);
  });

  it("opens on a clause per project, most pressing first", () => {
    const admin = project({ slug: "admin", name: "Driftwood admin, the harbour office app" });
    expect(
      text(<ProjectsPage projects={[admin, app]} issues={issues} blockers={blockers} now={now} />),
    ).toMatch(/^app waits on you\. admin has nothing filed\. 5 live issues in 2 projects/);
  });
});

describe("ProjectPage", () => {
  it("says nothing is called a slug no project has", () => {
    expect(
      text(
        <ProjectPage slug="nope" projects={[app]} issues={issues} blockers={blockers} now={now} />,
      ),
    ).toContain("Nothing here is called /projects/nope");
  });

  it("says nothing is filed, and lists nothing, under a project nothing is filed under", () => {
    const admin = project({ slug: "admin", name: "Driftwood admin" });
    const markup = renderToStaticMarkup(
      <ProjectPage slug="admin" projects={[admin]} issues={[]} blockers={[]} now={now} />,
    );
    expect(plain(markup)).toContain("Nothing filed yet.");
    expect(plain(markup)).toContain(NOTHING_FILED);
    expect(titles(markup)).not.toContain("Moving 1");
    expect(titles(markup).some((t) => t.startsWith("Moving"))).toBe(false);
  });

  it("groups the live issues by what each is, and folds the closes", () => {
    const markup = renderToStaticMarkup(
      <ProjectPage slug="app" projects={[app]} issues={issues} blockers={blockers} now={now} />,
    );
    expect(
      titles(markup).filter((t) => /^(Moving|Waiting on you|Stuck|Open|Closed)/.test(t)),
    ).toEqual([
      "Moving 1",
      "Waiting on you 1",
      "Stuck 1",
      "Open 2",
      "Closed in the last 4 weeks 1",
    ]);
    const folded = markup.slice(markup.indexOf("<details"));
    expect(folded).toContain('href="/app-6"');
    expect(markup.slice(0, markup.indexOf("<details"))).not.toContain('href="/app-6"');
    expect(markup.indexOf('href="/app-4"')).toBeLessThan(markup.indexOf('href="/app-5"'));
    expect(plain(markup)).toContain("1 moving, 1 stuck, 1 waiting on you.");
    expect(plain(markup)).toContain(
      "4 open · 1 in progress · 1 closed in the last 4 weeks · across 1 epic",
    );
  });
});

describe("while the deployment reads", () => {
  it("says so on either page", () => {
    for (const element of [
      <ProjectsPage projects={undefined} issues={[]} blockers={[]} now={now} />,
      <ProjectPage slug="app" projects={undefined} issues={[]} blockers={[]} now={now} />,
      <ProjectsPage projects={[app]} issues={undefined} blockers={[]} now={now} />,
    ])
      expect(text(element)).toBe("Reading the projects…");
  });
});
