/**
 * Role classification.
 *
 * Every posting that enters the system gets a `RoleCategory` from
 * `classifyRoleRules` — a deterministic title-and-description matcher. The
 * same function backs both entry points (manual import and re-analysis), so a
 * listing cannot be categorised one way on the way in and another way on a
 * rescore. That divergence is a real defect this codebase has already paid
 * for: `roleAlignment` holds the heaviest default weight, so two copies of the
 * rule drifting apart silently re-ranks the entire review queue.
 */
export { classifyRoleRules } from "./classify";
export { ROLE_CATEGORY_VALUES } from "./roles";
