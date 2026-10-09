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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

// Radix refuses an item valued "", so no filter is this; no slug, epic id or priority digit can be.
const NONE = "*";

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
      <Pick
        label="Project"
        width="w-40"
        value={filter.project}
        options={[
          { value: NONE, text: "Every project" },
          ...projects.map((p) => ({ value: p.slug, text: p.slug })),
          ...(unlistedProject ? [{ value: filter.project!, text: filter.project! }] : []),
        ]}
        onChange={(v) => change(filter, { project: v })}
      />
      <Pick
        label="Epic"
        width="w-64"
        value={filter.epic}
        options={[
          { value: NONE, text: "Every epic" },
          ...epics.map((e) => ({ value: e.id, text: ref(e) })),
          ...(unlistedEpic ? [{ value: filter.epic!, text: filter.epic! }] : []),
        ]}
        onChange={(v) => change(filter, { epic: v })}
      />
      <Pick
        label="Priority"
        width="w-36"
        value={filter.priority === undefined ? undefined : String(filter.priority)}
        options={[
          { value: NONE, text: "Any priority" },
          ...[0, 1, 2, 3, 4].map((p) => ({ value: String(p), text: `P${p}` })),
        ]}
        onChange={(v) => change(filter, { priority: v === undefined ? undefined : Number(v) })}
      />
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

/** One pick of the toolbar: its options, the one on, and what picking another does. */
function Pick({
  label,
  value,
  options,
  onChange,
  width,
}: {
  label: string;
  value: string | undefined;
  options: { value: string; text: string }[];
  onChange: (value: string | undefined) => void;
  width: string;
}) {
  const on = value ?? NONE;
  // The value is children because Radix fills it from the picked item only after mount, so a
  // render to a string, and the first paint, would show an empty trigger without them.
  return (
    <Select value={on} onValueChange={(v) => onChange(v === NONE ? undefined : v)}>
      <SelectTrigger
        aria-label={label}
        className={cn(
          "h-8 bg-lift *:data-[slot=select-value]:block *:data-[slot=select-value]:truncate",
          width,
        )}
      >
        <SelectValue>{options.find((o) => o.value === on)?.text}</SelectValue>
      </SelectTrigger>
      {/* Dropped below the trigger as the ask menu is, not laid over it as a native select is;
          an option's text is the last span, which cuts with an ellipsis instead of running
          under the check. */}
      <SelectContent
        position="popper"
        align="start"
        sideOffset={4}
        className="glass max-w-[min(28rem,calc(100vw-32px))] rounded-xl bg-transparent text-ink"
      >
        {options.map((o) => (
          <SelectItem
            key={o.value}
            value={o.value}
            className="*:[span]:last:block *:[span]:last:min-w-0 *:[span]:last:truncate"
          >
            {o.text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
