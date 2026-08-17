import { SkeletonPage } from "@/components/register/skeleton";

/**
 * Settings has no figure strip — it opens straight into the first worksheet
 * section, so the skeleton is head + ruled rows at the real 34px pitch (C10).
 */
export default function Loading() {
  return <SkeletonPage label="settings" rows={12} />;
}
