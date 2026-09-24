// page.tsx: the primitives every page is set with. Its title, a titled section, which is
// folded away where what it holds is finished, and the line that stands while a
// subscription answers.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The page's one h1. */
export function Title({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h1 className={cn("text-[1.875rem] leading-[1.18] font-bold tracking-[-0.024em]", className)}>
      {children}
    </h1>
  );
}

const TITLE = "ml-0.5 text-small font-semibold text-slate";

/** A titled section: the title small and grey with its count, or folded under a `details` where what it holds is finished. */
export function Group({
  title,
  count,
  folded = false,
  id,
  className,
  children,
}: {
  title: string;
  count?: number;
  folded?: boolean;
  /** Names the section to assistive tech, `aria-labelledby` on the section and `id` on the title. */
  id?: string;
  /** The margin above; `mt-8` unless given. */
  className?: string;
  children: ReactNode;
}) {
  const head = (
    <>
      {title}{" "}
      {count !== undefined && (
        <span className="ml-1 font-mono font-normal text-faint">{count}</span>
      )}
    </>
  );
  if (folded)
    return (
      <details className={cn("group", className ?? "mt-8")}>
        <summary className={cn(TITLE, "cursor-pointer hover:text-ink")}>{head}</summary>
        <div className="mt-2.5">{children}</div>
      </details>
    );
  return (
    <section aria-labelledby={id} className={className ?? "mt-8"}>
      <h2 id={id} className={cn(TITLE, "mb-2.5")}>
        {head}
      </h2>
      {children}
    </section>
  );
}

/** What stands where a subscription has not answered yet. */
export function Pending({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("text-slate", className)}>{children}</p>;
}
