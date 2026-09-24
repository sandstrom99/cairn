// Shell.tsx: the frame every page sits in. The ground, the rail, main with the page in it,
// the column on the right where the page has one, and the jump bar. The rail, the ground
// and the jump bar stay across pages; what changes between routes is main's child and what
// the column lists. Until cn-68, a page for one id brings its own column from inside main,
// so `side` says whether a column stands on the right and `column` is the one the shell
// itself renders.
import type { EpicLineView } from "@cairn/cli/views";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Ground } from "./Ground.tsx";
import { type Destination, JumpBar } from "./JumpBar.tsx";
import { Rail } from "./Rail.tsx";

/** The page's frame around `children`, which is the page for the route. */
export function Shell({
  host,
  epics,
  current,
  epicId,
  waiting,
  side,
  column,
  destinations,
  onForget,
  children,
}: {
  host: string;
  epics: EpicLineView[] | undefined;
  current: string;
  epicId: string | undefined;
  waiting: boolean;
  /** Whether a column stands on the right, which main and the jump bar keep clear of. */
  side: boolean;
  /** The column the shell renders there, where the page does not bring its own. */
  column?: ReactNode;
  destinations: Destination[];
  onForget: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <Ground waiting={waiting} />
      <Rail host={host} epics={epics} current={current} epicId={epicId} onForget={onForget} />
      <main
        className={cn(
          "relative z-10 ml-(--main-left) px-10 pt-16 pb-36 narrow:ml-0 narrow:px-4 narrow:pt-9",
          side && "mr-(--main-right) mid:mr-0",
        )}
      >
        <div className="mx-auto max-w-(--content-width)">{children}</div>
      </main>
      {column}
      <JumpBar destinations={destinations} side={side} />
    </>
  );
}
