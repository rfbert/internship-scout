import { SkeletonPage } from "@/components/register/skeleton";

/**
 * The correspondents register while it loads: page head, the five-cell figure
 * strip, then ledger rows at the real 34px height so nothing resizes when the
 * data lands. `SkeletonPage` carries the `role="status"` live region, and the
 * pulse is zeroed by the global `prefers-reduced-motion` block (D2).
 */
export default function Loading() {
  return <SkeletonPage label="companies" figures={5} rows={10} />;
}
