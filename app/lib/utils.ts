import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * `cn` — the shadcn class-merge helper.
 *
 * Combines clsx (conditional classNames) with tailwind-merge (dedupes
 * conflicting Tailwind utilities, keeping the last one). Every shadcn-style
 * component in `app/components/ui/` uses this so variants compose cleanly.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
