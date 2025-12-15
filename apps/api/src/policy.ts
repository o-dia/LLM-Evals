export type PolicyDecision = {
  allowed: boolean;
  category?: string;
  reason?: string;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const disallowedPatterns: { category: string; regex: RegExp }[] = [
  { category: "hate", regex: /(racist|anti-\w+|slur)/i },
  { category: "self-harm", regex: /(suicide|self-harm|kill myself)/i },
  { category: "malware", regex: /(malware|ransomware|exploit)/i },
  { category: "weapons", regex: /(build a bomb|explosive)/i },
  { category: "pii", regex: /(social security number|ssn|credit card)/i }
];

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

  const regexHit = disallowedPatterns.find((p) => p.regex.test(combined));
  if (regexHit) {
    return {
      allowed: false,
      category: regexHit.category,
      reason: `Blocked by pattern: ${regexHit.regex}`
    };
  }

  const heuristicHit = classifierHeuristics(combined);
  if (heuristicHit) {
    return {
      allowed: false,
      category: heuristicHit,
      reason: "Blocked by heuristic classifier"
    };
  }

  return { allowed: true };
};
