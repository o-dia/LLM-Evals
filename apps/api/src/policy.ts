export type PolicyViolation = {
  category: string;
  reason: string;
};

export type PolicyDecision = {
  action: "allow" | "block";
  violations: PolicyViolation[];
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/;
const US_PHONE_REGEX =
  /\b(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/;

const extractCandidateCardNumbers = (text: string): string[] => {
  // Very permissive: capture digit groups separated by space or dash, total 13-19 digits once stripped.
  const candidates = text.match(/\b(?:\d[ -]?){13,23}\b/g) ?? [];
  return candidates
    .map((s) => s.replace(/[^0-9]/g, ""))
    .filter((digits) => digits.length >= 13 && digits.length <= 19);
};

const luhnCheck = (digits: string): boolean => {
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits.charCodeAt(i) - 48;
    if (digit < 0 || digit > 9) return false;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
};

const detectPii = (text: string): PolicyViolation[] => {
  const violations: PolicyViolation[] = [];

  if (EMAIL_REGEX.test(text)) {
    violations.push({ category: "pii.email", reason: "Detected an email address pattern" });
  }
  if (US_PHONE_REGEX.test(text)) {
    violations.push({ category: "pii.phone", reason: "Detected a phone number pattern" });
  }
  if (SSN_REGEX.test(text)) {
    violations.push({ category: "pii.ssn", reason: "Detected a US SSN pattern" });
  }

  const cardCandidates = extractCandidateCardNumbers(text);
  if (cardCandidates.some(luhnCheck)) {
    violations.push({ category: "pii.credit_card", reason: "Detected a credit card number (Luhn-valid)" });
  }

  return violations;
};

const classifierHeuristics = (text: string): string | undefined => {
  const lower = text.toLowerCase();
  if (lower.includes("jailbreak") || lower.includes("ignore previous")) {
    return "prompt-injection";
  }
  if (lower.includes("system prompt") || lower.includes("reveal your instructions")) {
    return "prompt-leakage";
  }
  if (lower.includes("harm") && lower.includes("yourself")) {
    return "self-harm";
  }
  return undefined;
};

export const evaluatePrompt = (messages: ChatMessage[]): PolicyDecision => {
  const combined = messages.map((m) => m.content).join("\n\n");

  const piiViolations = detectPii(combined);
  if (piiViolations.length > 0) {
    return { action: "block", violations: piiViolations };
  }

  const heuristicHit = classifierHeuristics(combined);
  if (heuristicHit) {
    return {
      action: "block",
      violations: [{ category: heuristicHit, reason: "Blocked by heuristic classifier" }]
    };
  }

  return { action: "allow", violations: [] };
};

export const evaluateOutputText = (text: string): PolicyDecision => {
  const piiViolations = detectPii(text);
  if (piiViolations.length > 0) {
    return {
      action: "block",
      violations: piiViolations.map((v) => ({
        category: v.category.replace(/^pii\./, "pii_output."),
        reason: v.reason
      }))
    };
  }
  return { action: "allow", violations: [] };
};
