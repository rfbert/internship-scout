/**
 * The role taxonomy the scorer ranks against.
 *
 * Order is meaningful to readers, not to code: the list runs from the roles
 * this tool is built to surface (AI product and engineering) down to the
 * catch-alls. `roleAlignment` carries the heaviest default weight in
 * `DEFAULT_WEIGHTS`, so which bucket a posting lands in moves its score more
 * than any other single signal.
 *
 * Kept in sync by hand with the `RoleCategory` enum in `prisma/schema.prisma`;
 * the settings validator builds its zod enum from this array so a category
 * added in one place fails loudly in the other.
 */
export const ROLE_CATEGORY_VALUES = [
  "AI_PRODUCT_MANAGEMENT",
  "PM_FOR_AI_PRODUCTS",
  "TECHNICAL_PM",
  "AI_ENGINEERING",
  "APPLIED_AI",
  "ML_ENGINEERING",
  "APM_PROGRAM",
  "PRODUCT_ROTATIONAL",
  "OTHER_EXCEPTIONAL",
  "DATA_SCIENCE",
  "RESEARCH",
  "SOFTWARE_ENGINEERING",
  "OTHER",
] as const;
