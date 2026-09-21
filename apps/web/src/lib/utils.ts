// utils.ts: `cn`, the class-name merge every shadcn component calls: clsx for the
// conditionals, tailwind-merge so a later utility beats an earlier one it conflicts with.
//
// shadcn's current registry generates `import { cn } from "cn"`, an npm package of that
// name. It is not used here on purpose: it ships a binary called `cn`, and in this repo
// `cn` is the cairn CLI. After `vp dlx shadcn@latest add <component>`, point the new
// file's import back here.
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
