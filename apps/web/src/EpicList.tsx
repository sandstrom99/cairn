// EpicList.tsx: the open epics, one line each in the reference form. It holds no state and
// asks the deployment nothing, so a test renders it to a string and reads the lines.
//
// `ref` is imported from @cairn/cli rather than copied: the reference form is spelled in
// one place (packages/cli/src/lib/ref.mts), and a page that spelled it a second way would
// drift from every line cn prints.
import { type Referable, ref } from "@cairn/cli/src/lib/ref.mts";

export function EpicList({ epics }: { epics: Referable[] }) {
  if (epics.length === 0) return <p>no open epics</p>;
  return (
    <ul>
      {epics.map((epic) => (
        <li key={epic.id}>{ref(epic)}</li>
      ))}
    </ul>
  );
}
