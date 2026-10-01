// Band.tsx: the band of projects on the Overview, between the headline and what waits. One
// tile per project, most pressing first as orderProjects ranks them: its dot and slug, its
// word as projectWord says it, its 28-day pulse drawn as the Projects page draws it with
// every bar against the most events any project had in a day, and what it has live with its
// closes in four weeks. Each tile is a link to the project's own page.
//
// It decides nothing: every fact is one `projects.list` answered, and the words are the
// page's own, the ones Projects already uses, so the band prints no cn line.
import type { ProjectView } from "@cairn/cli/views";
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { Pulse } from "./Chart.tsx";
import { Group } from "./page.tsx";
import { NO_PULSE, liveOf, orderProjects, pulseMost, pulseTotal } from "./projects.ts";
import { Dot, projectWord, toneOf, toneText } from "./tone.tsx";

export function Band({ projects }: { projects: ProjectView[] | undefined }) {
  if (projects === undefined || projects.length === 0) return null;
  const ordered = orderProjects(projects);
  const max = Math.max(0, ...ordered.map((p) => pulseMost(p.pulse ?? NO_PULSE)));
  return (
    <Group
      title="Across the projects"
      id="across-the-projects"
      aside="28 days · closes in ink · most pressing first"
      className="mt-8"
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2 narrow:grid-cols-2">
        {ordered.map((p) => {
          const word = projectWord(p);
          const pulse = p.pulse ?? NO_PULSE;
          return (
            <Fragment key={p.slug}>
              <a
                href={`/projects/${p.slug}`}
                className="group paper flex flex-col gap-2.5 px-3.5 pt-3 pb-[11px]"
              >
                <span className="flex items-baseline gap-2">
                  <Dot tone={toneOf(word)} className="translate-y-[-1px]" />
                  <b className="font-mono font-[650] tracking-[-0.01em] decoration-faint underline-offset-[3px] group-hover:underline">
                    {p.slug}
                  </b>{" "}
                  <span
                    className={cn(
                      "ml-auto text-meta font-medium whitespace-nowrap",
                      toneText(toneOf(word)),
                    )}
                  >
                    {word}
                  </span>
                </span>
                <Pulse pulse={pulse} height={30} max={max} />
                {/* The head word already says "nothing filed", so a project with nothing has no foot. */}
                {p.filed > 0 && (
                  <span className="flex justify-between text-meta text-slate whitespace-nowrap">
                    <span>{`${liveOf(p.counts)} live`}</span>{" "}
                    <span>{`${pulseTotal(pulse, "closes")} closed`}</span>
                  </span>
                )}
              </a>{" "}
            </Fragment>
          );
        })}
      </div>
    </Group>
  );
}
