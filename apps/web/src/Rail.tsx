// Rail.tsx: the left column, glass. Which deployment this is, where the page can go, and
// every open epic with the one dot that says how it is doing. Below it, the fact a reader
// should not have to guess: this window reads, and what it reads with is a shared secret
// kept in this browser.
import type { EpicLineView } from "@cairn/cli/views";
import { Clock3, LayoutDashboard, List, Lock } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

/** The most pressing thing true of an epic: a person is needed, then silence, then motion. */
export function toneOf(epic: EpicLineView): "waiting" | "stuck" | "moving" | "still" {
  if (epic.health.waiting.length > 0) return "waiting";
  if (epic.health.stuck) return "stuck";
  if (epic.health.moving.length > 0) return "moving";
  return "still";
}

const DOT = {
  waiting: "bg-waiting",
  stuck: "bg-stuck",
  moving: "bg-moving",
  still: "shadow-[inset_0_0_0_1.5px_var(--color-mark)]",
};

function Glyph() {
  return (
    <svg
      viewBox="0 0 30 30"
      aria-hidden="true"
      className="size-[30px] shrink-0 rounded-[9px] bg-ink"
    >
      <ellipse cx="15" cy="21.4" rx="8.6" ry="3.3" fill="#fff" />
      <ellipse cx="15.6" cy="14.8" rx="6" ry="2.7" fill="#fff" transform="rotate(-4 15.6 14.8)" />
      <ellipse cx="14.5" cy="9.3" rx="3.6" ry="2.1" fill="#fff" transform="rotate(5 14.5 9.3)" />
    </svg>
  );
}

type Page = { href: string; label: string; icon: ComponentType<{ className?: string }> };

const PAGES: Page[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/issues", label: "Issues", icon: List },
  { href: "/log", label: "Log", icon: Clock3 },
];

export function Rail({
  host,
  epics,
  current = "/",
  epicId,
}: {
  host: string;
  epics: EpicLineView[] | undefined;
  current?: string;
  /** The epic on screen, or the one the issue on screen belongs to. */
  epicId?: string;
}) {
  const open = epics?.reduce(
    (sum, { counts }) => sum + counts.open + counts.inProgress + counts.followUps,
    0,
  );
  return (
    <aside
      aria-label="Deployment and pages"
      className={cn(
        "glass fixed top-3 bottom-3 left-3 z-20 flex w-[264px] flex-col rounded-3xl p-3.5",
        "max-[720px]:sticky max-[720px]:top-2 max-[720px]:bottom-auto max-[720px]:left-auto max-[720px]:m-2 max-[720px]:w-auto max-[720px]:flex-row max-[720px]:items-center max-[720px]:gap-1.5 max-[720px]:rounded-[18px] max-[720px]:p-2",
      )}
    >
      <div className="flex items-center gap-2.5 py-1.5 pr-2 pl-1.5">
        <Glyph />
        <div className="min-w-0">
          <div className="text-[0.96875rem] leading-tight font-[650] tracking-[-0.01em]">cairn</div>
          <div className="truncate font-mono text-micro text-slate max-[720px]:hidden">{host}</div>
        </div>
      </div>

      <nav
        aria-label="Pages"
        className="mt-[18px] grid gap-0.5 max-[720px]:mt-0 max-[720px]:ml-auto max-[720px]:flex"
      >
        {PAGES.map(({ href, label, icon: Icon }) => (
          <a
            key={href}
            href={href}
            aria-current={href === current ? "page" : undefined}
            aria-label={label}
            className={cn(
              "flex h-9 items-center gap-[11px] rounded-[10px] px-2.5 font-medium text-slate hover:bg-white/40 hover:text-ink",
              "aria-[current=page]:bg-white/70 aria-[current=page]:text-ink aria-[current=page]:shadow-[0_0_0_1px_rgb(21_24_30/0.05),0_1px_2px_rgb(21_24_30/0.06)]",
            )}
          >
            <Icon className="size-[17px] shrink-0" />
            <span className="max-[720px]:hidden">{label}</span>
            {href === "/issues" && open !== undefined && open > 0 && (
              <span className="ml-auto font-mono text-meta text-slate max-[720px]:hidden">
                {open}
              </span>
            )}
          </a>
        ))}
      </nav>

      <p className="mx-2.5 mt-[26px] mb-2 text-meta font-semibold text-slate max-[720px]:hidden">
        Epics
      </p>
      <ul className="min-h-0 overflow-y-auto [scrollbar-width:thin] max-[720px]:hidden">
        {epics?.map((epic) => (
          <li key={epic.id}>
            <a
              href={`/${epic.id}`}
              title={epic.title}
              aria-current={epic.id === epicId ? "true" : undefined}
              className="flex h-8 items-center gap-[9px] rounded-[9px] px-2.5 text-row hover:bg-white/40 aria-[current=true]:bg-white/70 aria-[current=true]:shadow-[0_0_0_1px_rgb(21_24_30/0.05),0_1px_2px_rgb(21_24_30/0.06)]"
            >
              <i className={cn("size-2 shrink-0 rounded-full", DOT[toneOf(epic)])} />
              <span className="shrink-0 font-mono text-meta text-slate">{epic.id}</span>
              <span className="truncate">{epic.title}</span>
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-start gap-2.5 p-2.5 text-meta text-slate max-[720px]:hidden">
        <Lock className="mt-px size-[17px] shrink-0" />
        <span>
          <strong className="block font-semibold text-ink">Read-only window</strong>
          Shared secret, kept in this browser
        </span>
      </div>
    </aside>
  );
}
