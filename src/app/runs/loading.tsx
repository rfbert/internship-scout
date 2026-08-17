import { SkeletonPage } from "@/components/register/skeleton";

/** C10 — 34px stripes at the ledger's own row height, six figure cells. */
export default function Loading() {
  return <SkeletonPage label="runs" rows={10} figures={6} />;
}
