import { SkeletonPage } from "@/components/register/skeleton";

/**
 * The docket's own shape while it loads: page head, the seven-cell figure
 * strip, then ledger rows at the real 34px height, so nothing resizes when the
 * data lands. `SkeletonPage` carries the `role="status"` live region and the
 * pulse is zeroed by the global `prefers-reduced-motion` block (D2).
 */
export default function Loading() {
  return <SkeletonPage label="the dashboard" figures={7} rows={7} />;
}
