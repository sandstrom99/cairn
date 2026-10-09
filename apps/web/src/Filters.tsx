// Filters.tsx: the Issues page's controls, a toolbar over the list and a pager under it.
// Everything they hold is the query string (issues.ts), so a chip, a page number and Reset
// are plain links like every other on the page; only the text field and the selects, which
// a link cannot be, call `navigate`, and with `replace`, so typing does not pile up history.
// A chip carries its state's dot and how many rows turning it on shows.
import type { EpicLineView, ProjectView } from "@cairn/cli/views";
import { ref } from "@cairn/cli/ref";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  type Filter,
  type PageOf,
  type StateKey,
  STATES,
  hrefOf,
  isDefault,
  pageLinks,
  toggleState,
  withFilter,
} from "./issues.ts";
import { navigate } from "./location.ts";
import { StatusDot } from "./rows.tsx";

const SELECT =
  "h-8 rounded-lg border border-input bg-lift px-2 text-sm text-ink outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** The status word whose dot a state's chip carries; a follow-up is open, and hollow. */
const STATUS: Record<StateKey, string> = {
  in_progress: "in_progress",
  open: "open",
  "follow-up": "open",
  closed: "closed",
  dropped: "dropped",
};

const change = (filter: Filter, to: Parameters<typeof withFilter>[1]) =>
  navigate(hrefOf(withFilter(filter, to)), true);

export function Toolbar({
  filter,
  counts,
  epics,
  projects,
}: {
  filter: Filter;
  counts: Record<StateKey, number>;
  epics: EpicLineView[];
  projects: ProjectView[];
}) {
  // The epics list holds open epics, and either list is empty until it answers; a link into
  // a project or an epic that is not among them still selects it.
  const unlistedProject =
    filter.project !== undefined && !projects.some((p) => p.slug === filter.project);
  const unlistedEpic = filter.epic !== undefined && !epics.some((e) => e.id === filter.epic);
  return (
    <div className="paper mt-6 flex flex-wrap items-center gap-2 px-3 py-2.5">
      <Input
        type="search"
        aria-label="Filter by title or id"
        placeholder="Title or id"
        className="h-8 w-56 bg-lift"
        value={filter.q}
        onChange={(e) => change(filter, { q: e.target.value })}
      />
      <select
        aria-label="Project"
        className={SELECT}
        value={filter.project ?? ""}
        onChange={(e) => change(filter, { project: e.target.value || undefined })}
      >
        <option value="">Every project</option>
        {projects.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.slug}
          </option>
        ))}
        {unlistedProject && <option value={filter.project}>{filter.project}</option>}
      </select>
      <select
        aria-label="Epic"
        className={SELECT}
        value={filter.epic ?? ""}
        onChange={(e) => change(filter, { epic: e.target.value || undefined })}
      >
        <option value="">Every epic</option>
        {epics.map((e) => (
          <option key={e.id} value={e.id}>
            {ref(e)}
          </option>
        ))}
        {unlistedEpic && <option value={filter.epic}>{filter.epic}</option>}
      </select>
      <select
        aria-label="Priority"
        className={SELECT}
        value={filter.priority ?? ""}
        onChange={(e) =>
          change(filter, { priority: e.target.value === "" ? undefined : Number(e.target.value) })
        }
      >
        <option value="">Any priority</option>
        {[0, 1, 2, 3, 4].map((p) => (
          <option key={p} value={String(p)}>
            P{p}
          </option>
        ))}
      </select>
      <div className="flex basis-full items-center gap-2">
        <StateChips filter={filter} counts={counts} />
        {!isDefault(filter) && (
          <a href="/issues" className="ml-auto text-meta text-slate hover:text-ink">
            Reset
          </a>
        )}
      </div>
    </div>
  );
}

/** A chip per state, a link that turns it on or off, with the count it would show. */
export function StateChips({
  filter,
  counts,
}: {
  filter: Filter;
  counts: Record<StateKey, number>;
}) {
  return (
    <nav aria-label="States" className="flex flex-wrap items-center gap-1.5">
      {STATES.map(({ key, title }) => {
        const on = filter.states.includes(key);
        return (
          <a
            key={key}
            href={hrefOf(toggleState(filter, key))}
            aria-pressed={on ? "true" : "false"}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-meta font-medium",
              on ? "bg-lift text-ink shadow-ring" : "text-slate hover:text-ink",
            )}
          >
            <StatusDot status={STATUS[key]} title={title} />
            {title}
            <span className="font-mono text-faint">{counts[key]}</span>
          </a>
        );
      })}
    </nav>
  );
}

const PAGE_LINK =
  "inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-2 font-mono text-slate hover:bg-ink/[0.04] hover:text-ink aria-[current=page]:bg-lift aria-[current=page]:text-ink aria-[current=page]:shadow-ring";

/** Which rows of how many these are, and a link to each page near this one; nothing for one page. */
export function Pager({ filter, page }: { filter: Filter; page: PageOf }) {
  if (page.pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center gap-1 text-meta">
      <span className="mr-auto text-slate">
        {page.from}–{page.to} of {page.total}
      </span>
      {page.page > 1 && (
        <a href={hrefOf({ ...filter, page: page.page - 1 })} rel="prev" className={PAGE_LINK}>
          Previous
        </a>
      )}
      {pageLinks(page.page, page.pages).map((n, k) =>
        n === "…" ? (
          <span key={k} className="px-1 text-faint">
            …
          </span>
        ) : (
          <a
            key={k}
            href={hrefOf({ ...filter, page: n })}
            aria-current={n === page.page ? "page" : undefined}
            className={PAGE_LINK}
          >
            {n}
          </a>
        ),
      )}
      {page.page < page.pages && (
        <a href={hrefOf({ ...filter, page: page.page + 1 })} rel="next" className={PAGE_LINK}>
          Next
        </a>
      )}
    </nav>
  );
}
