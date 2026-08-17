import type { RoleCategory } from "@prisma/client";

const AI_SIGNAL = /\b(ai|artificial intelligence|ml|machine learning|llm|genai|generative ai|agentic|deep learning|computer vision|nlp)\b/i;

/**
 * Business-function words that mean the role USES AI tools rather than builds
 * them ("AI Marketing Intern", "Account Management AI Intern"). Validation
 * against live postings showed the bare "AI ... Intern" rule was tagging these
 * as AI_ENGINEERING — top-tier alignment — and floating marketing/ops roles
 * above real engineering ones. "operations" is included, but "ML/AI Ops" as an
 * engineering discipline is spelled mlops/aiops and is matched separately.
 */
const NON_ENGINEERING_FUNCTION =
  /\b(marketing|content|social\s+media|brand|communications?|sales|business\s+development|account\s+manage(?:ment|r)|customer\s+success|customer\s+support|recruit(?:ing|ment)|talent|people\s+ops|human\s+resources|\bhr\b|finance|financial|accounting|legal|paralegal|education|teaching|instructor|curriculum|community|operations?|bizops|administrative)\b/i;

/**
 * Deterministic keyword cascade (first match wins), title weighted over
 * description. Used standalone when no AI provider is configured and as the
 * fallback when the provider errors.
 *
 * Mapping choice: a plain "Product Manager Intern" with no AI signal anywhere
 * classifies as TECHNICAL_PM ("PM for technical products") rather than
 * PM_FOR_AI_PRODUCTS, which is reserved for PM roles with AI context.
 */
export function classifyRoleRules(title: string, description?: string): RoleCategory {
  const t = title.toLowerCase();
  const d = (description ?? "").toLowerCase();

  const pmTitle = /(product\s+manag|product\s+intern|\bpm\b(?!\s*morning))/i.test(t);
  const aiInTitle = AI_SIGNAL.test(t);
  const aiInDesc = AI_SIGNAL.test(d);

  // AI PM: AI term adjacent to PM in the title.
  if (
    /(ai|ml|machine learning|llm|genai)[\s-]*(product\s+manager|product\s+management|pm\b)/i.test(t) ||
    (pmTitle && aiInTitle)
  ) {
    return "AI_PRODUCT_MANAGEMENT";
  }
  if (/\bapm\b|associate\s+product\s+manager/i.test(t)) return "APM_PROGRAM";
  if (/product/.test(t) && /rotation(al)?\s*(program)?/i.test(t)) return "PRODUCT_ROTATIONAL";
  if (/technical\s+(program|product)\s+manager|\btpm\b/i.test(t)) return "TECHNICAL_PM";
  if (pmTitle && aiInDesc) return "PM_FOR_AI_PRODUCTS";
  if (pmTitle) return "TECHNICAL_PM";

  // Quant-finance roles are outside the target categories even when their
  // titles contain "research" — classify before the research fallback.
  if (/quant(itative)?\s*(trad|research|dev|analyst|strateg)|\bquant\b/i.test(t)) return "OTHER";

  if (/applied\s+(ai|scien)/i.test(t)) return "APPLIED_AI";
  if (
    /ai\s+engineer|agentic|forward[\s-]deployed|(solutions?\s+engineer).*\bai\b|\bai\b.*(solutions?\s+engineer)|\bai[\s-]first\s+engineer|\bai\s*\/\s*swe\b|\bmlops\b|\baiops\b/i.test(t) ||
    // Bare "AI ... Intern" only counts as engineering when the title carries no
    // business-function word — "AI Marketing Intern" uses AI, it doesn't build it.
    (/\bai\b.*intern/i.test(t.replace(/product|manag\w*/g, "")) && !NON_ENGINEERING_FUNCTION.test(t))
  ) {
    // "AI ... Intern" titles without engineering/PM/DS/research qualifiers land here.
    if (!/machine\s+learning|ml\s+engineer|deep\s+learning|computer\s+vision|nlp|research|data\s+scien|scientist/i.test(t)) {
      return "AI_ENGINEERING";
    }
  }
  if (/machine\s+learning|ml\s+engineer|deep\s+learning|computer\s+vision|nlp\s+engineer|\bmle\b/i.test(t)) {
    return "ML_ENGINEERING";
  }
  if (/data\s+scien/i.test(t)) return "DATA_SCIENCE";
  if (/research/i.test(t)) return "RESEARCH";
  if (/software\s+(engineer|developer)|swe\b|full[\s-]stack|backend|frontend/i.test(t)) {
    return "SOFTWARE_ENGINEERING";
  }
  return "OTHER";
}
