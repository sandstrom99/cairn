// The two list pages. On an empty deployment cn prints nothing, so each page names the
// command that fills it instead of an empty box. With issues, the Issues page lists what
// its filter matches, the filter read from the query string and every control a link to
// the next one.
import { HOUR, ago, epic, now, project } from "@cairn/cli/testing";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT, type Filter, parseFilter } from "./issues.ts";
import { IssuesPage, LogPage } from "./ListPages.tsx";
import { plain } from "./plain.ts";
import type { Listed } from "./rows.tsx";

/** An issue as a list carries it: open, P2, in app under ep-1, an hour quiet. */
const listed = (over: Partial<Listed> = {}): Listed => ({
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

const live = listed({ id: "app-1", title: "the invite flow" });
const finished = listed({
  id: "app-2",
  title: "the skeleton",
  status: "closed",
  closedAt: ago(HOUR),
});

const page = (issues: Listed[], filter: Filter = DEFAULT) =>
  renderToStaticMarkup(
    <IssuesPage issues={issues} filter={filter} epics={[]} projects={[]} blockers={[]} now={now} />,
  );

/** The markup of the chip whose title is given. */
const chip = (markup: string, title: string) =>
  markup.match(
    new RegExp(`<a [^>]*aria-pressed[^>]*>(?:(?!</a>).)*${title}(?:(?!</a>).)*</a>`),
  )?.[0];

/** The rows of the list: every `li`, the track's cells being links and the pager holding none. */
const rowCount = (markup: string) => markup.match(/<li/g)?.length ?? 0;

describe("IssuesPage", () => {
  it("names the command that makes the first issue", () => {
    const markup = page([]);
    const text = plain(markup);
    expect(text).toContain("None yet.");
    expect(text).toContain("cn create --project <slug> --epic <ep-id> --title");
    expect(markup).not.toContain('aria-label="States"');
  });

  it("lists what is live by default, and counts what is closed on its chip", () => {
    const markup = page([live, finished]);
    expect(markup).toContain('href="/app-1"');
    expect(plain(markup)).not.toContain("the skeleton");
    const closed = chip(markup, "Closed");
    expect(closed).toContain('href="/issues?status=in_progress,open,follow-up,closed"');
    expect(closed).toContain('aria-pressed="false"');
    expect(plain(closed!)).toBe("Closed1");
    expect(markup).not.toContain(">Reset<");
  });

  it("lists the closed rows with the closed state alone on", () => {
    const markup = page([live, finished], parseFilter("status=closed"));
    expect(plain(markup)).toContain("the skeleton");
    expect(plain(markup)).not.toContain("the invite flow");
    expect(chip(markup, "Open")).toContain('aria-pressed="false"');
    expect(chip(markup, "Closed")).toContain('aria-pressed="true"');
    expect(markup).toContain(">Reset<");
  });

  it("says when nothing matches, and when no state is on", () => {
    expect(plain(page([live, finished], parseFilter("project=nope")))).toContain(
      "Nothing matches. Reset the filters.",
    );
    expect(plain(page([live, finished], parseFilter("status=none")))).toContain(
      "No state picked. Turn one on above.",
    );
  });

  it("names the project, epic and priority it is filtered on in the toolbar", () => {
    const markup = renderToStaticMarkup(
      <IssuesPage
        issues={[live]}
        filter={parseFilter("project=app&epic=ep-1&priority=1")}
        epics={[epic({ id: "ep-1", title: "Ship invite links" })]}
        projects={[project({ slug: "app" })]}
        blockers={[]}
        now={now}
      />,
    );
    for (const label of ["Project", "Epic", "Priority"])
      expect(markup).toContain(`aria-label="${label}"`);
    const text = plain(markup);
    expect(text).toContain("app");
    expect(text).toContain('ep-1 "Ship invite links"');
    expect(text).toContain("P1");
    // Radix keeps a native select beside each trigger for forms, hidden and empty; none shows.
    expect(markup).not.toMatch(/<select(?![^>]*aria-hidden="true")/);
    expect(markup).not.toContain("<option");
  });

  it("lists 25 rows a page, with a pager to the rest", () => {
    const many = Array.from({ length: 60 }, (_, k) => listed({ id: `app-${k + 1}` }));
    const markup = page(many);
    expect(rowCount(markup)).toBe(25);
    const pager = markup.slice(markup.indexOf('aria-label="Pages"'));
    expect(pager).toContain('href="/issues?page=2"');
    expect(pager).toContain('href="/issues?page=3"');
    expect(plain(pager)).toContain("1–25 of 60");
    expect(plain(markup)).toContain("60 of 60, by priority then age");
  });

  it("names a group's rows on this page when the group runs on", () => {
    const many = Array.from({ length: 60 }, (_, k) => listed({ id: `app-${k + 1}` }));
    const markup = page(many, parseFilter("page=2"));
    expect(rowCount(markup)).toBe(25);
    expect(markup).toMatch(/Open <span[^>]*>60<\/span><span[^>]*>26–50 of 60<\/span>/);
    expect(markup).toContain('aria-current="page"');
  });
});

describe("LogPage", () => {
  it("names the first write instead of an empty list", () => {
    const markup = renderToStaticMarkup(<LogPage events={[]} now={now} />);
    expect(plain(markup)).toContain("Nothing yet.");
    expect(plain(markup)).toContain("cn epic new");
    expect(markup).not.toContain("<ul");
  });
});
