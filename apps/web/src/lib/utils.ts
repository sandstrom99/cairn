// utils.ts: `cn`, the class-name merge every shadcn component calls: clsx for the
// conditionals, tailwind-merge so a later utility beats an earlier one it conflicts with.
//
// tailwind-merge ships knowing Tailwind's own font sizes (`text-sm`) and files any
// `text-` class it does not know under colour. This page sets type in seven sizes of its
// own (`--text-micro` to `--text-brief` in index.css), so without the extension
// `cn("text-small text-slate")` read as two colours and kept the later one, and every row
// that named a size beside a colour rendered at the inherited body size. The seven are
// told to the font-size group here, so a size and a colour never conflict, and two sizes do.
//
// shadcn's current registry generates `import { cn } from "cn"`, an npm package of that
// name. It is not used here on purpose: it ships a binary called `cn`, and in this repo
// `cn` is the cairn CLI. After `vp dlx shadcn@latest add <component>`, point the new
// file's import back here.
import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** The page's type scale, as the names index.css gives `--text-*`. */
export const TEXT_SIZES = ["micro", "meta", "small", "row", "body", "title", "brief"] as const;

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: [...TEXT_SIZES] }] } },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
