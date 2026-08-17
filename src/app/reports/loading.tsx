import { SkeletonPage } from "@/components/register/skeleton";

/**
 * The head, the six-cell figure strip, then the dispatch ledger. Stripes sit at
 * the ledger's own row height so nothing jumps when the rows land (C10).
 */
export default function Loading() {
  return <SkeletonPage label="reports" rows={10} figures={4} />;
}
