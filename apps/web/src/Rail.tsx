// Rail.tsx: the left column, glass. Which deployment this is, where the page can go, and
// every open epic with the one dot that says how it is doing. Below it, the fact a reader
// should not have to guess: this window reads, and what it reads with is a shared secret
// kept in this browser. The switch between light and dark sits in the head, so it is there in
// the narrow layout too, where the footer is not.
import type { EpicLineView } from "@cairn/cli/views";
import { Clock3, LayoutDashboard, List, Lock, Moon, Sun } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { Ref } from "./Ref.tsx";
import type { Theme } from "./theme.ts";
import { Dot, epicWord, toneOf } from "./tone.tsx";

function Glyph() {
  return (
    <svg
      viewBox="0 0 30 30"
      aria-hidden="true"
      className="size-[30px] shrink-0 rounded-[9px] bg-ink text-mist"
    >
      <ellipse cx="15" cy="21.4" rx="8.6" ry="3.3" fill="currentColor" />
      <ellipse
        cx="15.6"
        cy="14.8"
        rx="6"
        ry="2.7"
        fill="currentColor"
        transform="rotate(-4 15.6 14.8)"
      />
      <ellipse
        cx="14.5"
        cy="9.3"
        rx="3.6"
        ry="2.1"
        fill="currentColor"
        transform="rotate(5 14.5 9.3)"
      />
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
  theme,
  onToggleTheme,
  onForget,
}: {
  host: string;
  epics: EpicLineView[] | undefined;
  current?: string;
  /** The epic on screen, or the one the issue on screen belongs to. */
  epicId?: string;
  /** Light or dark, and the switch between them in the head. */
  theme: Theme;
  onToggleTheme: () => void;
  /** Forgets the secret this browser keeps; the button shows only where it is given. */
  onForget?: () => void;
}) {
  const open = epics?.reduce(
    (sum, { counts }) => sum + counts.open + counts.inProgress + counts.followUps,
    0,
  );
  return (
    <aside
      aria-label="Deployment and pages"
      className={cn(
        "glass fixed top-(--gutter) bottom-(--gutter) left-(--gutter) z-20 flex w-(--rail-width) flex-col rounded-3xl p-3.5",
        "narrow:sticky narrow:top-2 narrow:bottom-auto narrow:left-auto narrow:m-2 narrow:w-auto narrow:flex-row narrow:items-center narrow:gap-1.5 narrow:rounded-[18px] narrow:p-2",
      )}
    >
      <div className="flex items-center gap-2.5 py-1.5 pr-2 pl-1.5">
        <Glyph />
        <div className="min-w-0">
          <div className="text-[0.96875rem] leading-tight font-[650] tracking-[-0.01em]">cairn</div>
          <div className="truncate font-mono text-micro text-slate narrow:hidden">{host}</div>
        </div>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          className="ml-auto grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg text-slate hover:bg-lift hover:text-ink hover:shadow-ring"
        >
          {theme === "dark" ? <Sun className="size-[15px]" /> : <Moon className="size-[15px]" />}
        </button>
      </div>

      <nav
        aria-label="Pages"
        className="mt-[18px] grid gap-0.5 narrow:mt-0 narrow:ml-auto narrow:flex"
      >
        {PAGES.map(({ href, label, icon: Icon }) => (
          <a
            key={href}
            href={href}
            aria-current={href === current ? "page" : undefined}
            aria-label={label}
            className={cn(
              "flex h-9 items-center gap-[11px] rounded-[10px] px-2.5 font-medium text-slate hover:bg-lift/50 hover:text-ink",
              "aria-[current=page]:bg-lift aria-[current=page]:text-ink aria-[current=page]:shadow-lift",
            )}
          >
            <Icon className="size-[17px] shrink-0" />
            <span className="narrow:hidden">{label}</span>
            {href === "/issues" && open !== undefined && open > 0 && (
              <span className="ml-auto font-mono text-meta text-slate narrow:hidden">{open}</span>
            )}
          </a>
        ))}
      </nav>

      <p className="mx-2.5 mt-[26px] mb-2 text-meta font-semibold text-slate narrow:hidden">
        Epics
      </p>
      <ul className="min-h-0 overflow-y-auto [scrollbar-width:thin] narrow:hidden">
        {epics?.map((epic) => (
          <li key={epic.id}>
            <a
              href={`/${epic.id}`}
              title={epic.title}
              aria-current={epic.id === epicId ? "true" : undefined}
              className="flex h-8 items-center gap-[9px] rounded-[9px] px-2.5 text-row hover:bg-lift/50 aria-[current=true]:bg-lift aria-[current=true]:shadow-lift"
            >
              <Dot tone={toneOf(epicWord(epic))} />
              <Ref item={epic} plain clip className="min-w-0" />
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-start gap-2.5 p-2.5 text-meta text-slate narrow:hidden">
        <Lock className="mt-px size-[17px] shrink-0" />
        <span>
          <strong className="block font-semibold text-ink">Read-only window</strong>
          Shared secret, kept in this browser
          {onForget && (
            <>
              {" "}
              <button
                type="button"
                onClick={onForget}
                className="cursor-pointer text-ink underline decoration-faint underline-offset-[3px] hover:decoration-ink"
              >
                Forget it
              </button>
            </>
          )}
        </span>
      </div>
    </aside>
  );
}
