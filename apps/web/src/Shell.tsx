// Shell.tsx: the frame every page sits in. The ground, the rail, main with the page in it,
// the column on the right where the page has one, and the jump bar. The rail, the ground
// and the jump bar stay across pages; what changes between routes is main's child and what
// the column lists. The column is one `Column` the shell mounts once, in one place, and the
// route says what it lists through `listing`; the log has none, and takes the width.
import type { EpicLineView } from "@cairn/cli/views";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Column, type Listing } from "./Feed.tsx";
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
  listing,
  now,
  destinations,
  onForget,
  children,
}: {
  host: string;
  epics: EpicLineView[] | undefined;
  current: string;
  epicId: string | undefined;
  waiting: boolean;
  /** What the column on the right lists, or nothing where the route has no column. */
  listing?: Listing;
  now: number;
  destinations: Destination[];
  onForget: () => void;
  children: ReactNode;
}) {
  // Whether a column stands on the right, which main and the jump bar keep clear of.
  const side = listing !== undefined;
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
      {listing && <Column listing={listing} now={now} />}
      <JumpBar destinations={destinations} side={side} />
    </>
  );
}
