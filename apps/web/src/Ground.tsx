// Ground.tsx: what is behind the page. Light through a window, falling across a wall, in
// greys: it is there so the glass has something to stand over, and it says nothing.
// The one thing it does say is in violet, behind the headline, and only while something
// waits on the reader (index.css, "chroma means state").
const SHAFTS: { left: string; width: string; shade?: boolean }[] = [
  { left: "4%", width: "9%", shade: true },
  { left: "15%", width: "5%" },
  { left: "27%", width: "15%", shade: true },
  { left: "47%", width: "8%" },
  { left: "60%", width: "7%", shade: true },
  { left: "72%", width: "14%", shade: true },
  { left: "88%", width: "6%" },
];

export function Ground({ waiting }: { waiting: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="ground-waiting" data-on={waiting} />
      <div className="ground-light">
        <div className="ground-shafts">
          {SHAFTS.map(({ left, width, shade }) => (
            <i key={left} className={shade ? "shade" : undefined} style={{ left, width }} />
          ))}
        </div>
      </div>
    </div>
  );
}
