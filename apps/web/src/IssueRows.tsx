// IssueRows.tsx: a list of issues, a row each. The row is `issueLine` typeset: the
// reference, the priority, the status, the epic where the list spans epics, and who holds
// it. cn's order is kept in the text; on the page the status leads, because down a column
// of rows it is the word the eye sorts by.
import { issueParts } from "@cairn/cli/parts";
import type { IssueLineView } from "@cairn/cli/views";
import { cn } from "@/lib/utils";
import { Ref } from "./Ref.tsx";

const WORD: Record<string, string> = {
  in_progress: "text-moving-ink",
  open: "text-ink",
  closed: "text-slate",
  dropped: "text-faint",
};

export function IssueRows({ issues }: { issues: IssueLineView[] }) {
  return (
    <ul className="paper divide-y divide-hair">
      {issues.map((issue) => (
        <IssueRow key={issue.id} issue={issue} />
      ))}
    </ul>
  );
}

function IssueRow({ issue }: { issue: IssueLineView }) {
  const { target, priority, status, epic, claimedBy } = issueParts(issue);
  return (
    <li>
      <a
        href={`/${target.id}`}
        className="grid grid-cols-[112px_minmax(0,1fr)_auto_auto] items-baseline gap-x-3 gap-y-0.5 px-4 py-[13px] hover:bg-ink/[0.022] max-[720px]:grid-cols-[112px_minmax(0,1fr)] hover:[&_.ref-title]:underline"
      >
        <Ref
          item={target}
          plain
          className={cn(
            "col-start-2 row-start-1 decoration-faint underline-offset-[3px]",
            (status === "closed" || status === "dropped") && "text-slate",
          )}
        />{" "}
        <span className="col-start-3 row-start-1 font-mono text-meta text-slate max-[720px]:col-start-2 max-[720px]:row-start-3">
          {priority}
        </span>{" "}
        <span
          className={cn(
            "col-start-1 row-start-1 inline-flex items-center gap-2 text-small font-[550]",
            WORD[status],
          )}
        >
          {status === "in_progress" && <i className="size-2 shrink-0 rounded-full bg-moving" />}
          {status}
        </span>
        {epic && (
          <>
            {" "}
            <Ref item={epic} plain clip className="col-start-2 row-start-2 text-small text-slate" />
          </>
        )}
        {claimedBy && (
          <span className="col-start-4 row-start-1 text-small text-slate max-[720px]:col-start-2 max-[720px]:row-start-4">
            <span className="unseen"> · </span>
            {claimedBy}
          </span>
        )}
      </a>
    </li>
  );
}
