// TypeScript Concept: Interface
// Structure representing an individual sensitive PII entity match
export interface PiiEntityMatch {
  type: string;
  count: number;
}

// TypeScript Concept: Interface
// Result structure returned after scanning and masking sensitive data
export interface PiiRedactionResult {
  sanitizedText: string;
  hasPii: boolean;
  entities: PiiEntityMatch[];
}

// TypeScript Concept: Interface
// Threat assessment result returned by the prompt injection detector
export interface PromptInjectionResult {
  isMalicious: boolean;
  threatCategory: string | null;
  matchedPattern: string | null;
  reason: string | null;
}

// TypeScript Concept: Combined Interface
// Overall result consolidating input prompt injection check and PII sanitization
export interface GuardrailEvaluationResult {
  allowed: boolean;
  sanitizedQuery: string;
  injectionCheck: PromptInjectionResult;
  piiCheck: PiiRedactionResult;
}

// Prompt injection heuristic signatures organized by attack vector
const PROMPT_INJECTION_SIGNATURES: Array<{ category: string; regex: RegExp; reason: string }> = [
  {
    category: 'INSTRUCTION_OVERRIDE',
    regex: /(ignore|disregard|forget|override|bypass)\s+(all\s+)?(previous|prior|above|system)\s+(instructions|prompts|rules|directives)/i,
    reason: 'Attempted to override system instructions and safety constraints',
  },
  {
    category: 'SYSTEM_PROMPT_LEAK',
    regex: /(reveal|output|display|show|leak|print|repeat)\s+(your\s+)?(system\s+prompt|initial\s+instructions|base\s+prompt|developer\s+prompt)/i,
    reason: 'Attempted to extract internal system prompt or confidential configuration',
  },
  {
    category: 'JAILBREAK_PERSONA',
    regex: /\b(act\s+as\s+dan|dan\s+mode|do\s+anything\s+now|jailbreak\s+mode|developer\s+mode\s+enabled|unfiltered\s+assistant|evil\s+twin)\b/i,
    reason: 'Attempted to force model into an adversarial unaligned persona',
  },
  {
    category: 'DELIMITER_HIJACKING',
    regex: /(---\s*(end|start)\s*of\s*(system|instruction|context)|<\/?system>|\[INST\]|\[\/INST\]|```system)/i,
    reason: 'Attempted to inject fake delimiter tokens to break prompt sandbox',
  },
  {
    category: 'MULTILINGUAL_INSTRUCTION_OVERRIDE',
    regex: /(apne\s+sabhi\s+rules\s+bhul\s+jao|purane\s+nirdesh\s+ignore\s+karo|system\s+prompt\s+dikhao|mujhe\s+apna\s+prompt\s+batao|nirdeshon\s+ko\s+ansuna\s+karo)/i,
    reason: 'Attempted prompt injection using Hindi/Hinglish instructions',
  },
];

// Regular expressions for detecting standard Global and Indian PII patterns
const PII_PATTERNS: Array<{ type: string; placeholder: string; regex: RegExp; isContact?: boolean }> = [
  {
    type: 'CREDIT_CARD',
    placeholder: '[REDACTED_CREDIT_CARD]',
    regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b|\b3[47]\d{2}[-\s]?\d{6}[-\s]?\d{5}\b/g,
  },
  {
    type: 'INDIAN_PAN',
    placeholder: '[REDACTED_PAN]',
    regex: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g,
  },
  {
    type: 'INDIAN_AADHAAR',
    placeholder: '[REDACTED_AADHAAR]',
    regex: /\b[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/g,
  },
  {
    type: 'SOCIAL_SECURITY_NUMBER',
    placeholder: '[REDACTED_SSN]',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    type: 'API_SECRET_KEY',
    placeholder: '[REDACTED_API_KEY]',
    regex: /\b(?:sk-[a-zA-Z0-9\-_]{20,}|ghp_[a-zA-Z0-9]{20,}|Bearer\s+[a-zA-Z0-9\-._~+/]+=*)\b/g,
  },
  {
    type: 'IP_ADDRESS',
    placeholder: '[REDACTED_IP]',
    regex: /\b(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
  },
  {
    type: 'EMAIL_ADDRESS',
    placeholder: '[REDACTED_EMAIL]',
    regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    isContact: true,
  },
  {
    type: 'PHONE_NUMBER',
    placeholder: '[REDACTED_PHONE]',
    regex: /(?:\+?91[\s-]?)?[6-9]\d{9}\b|(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    isContact: true,
  },
];

// Scans an incoming query against prompt injection and jailbreak signatures
// returns: PromptInjectionResult
export function scanPromptInjection(query: string): PromptInjectionResult {
  if (!query || query.trim().length === 0) {
    return {
      isMalicious: false,
      threatCategory: null,
      matchedPattern: null,
      reason: null,
    };
  }

  const normalizedQuery = query.toLowerCase().replace(/\s+/g, ' ');

  for (let i = 0; i < PROMPT_INJECTION_SIGNATURES.length; i++) {
    const signature = PROMPT_INJECTION_SIGNATURES[i];
    const match = signature.regex.exec(normalizedQuery);
    if (match) {
      return {
        isMalicious: true,
        threatCategory: signature.category,
        matchedPattern: match[0],
        reason: signature.reason,
      };
    }
  }

  // Safe input passing all injection heuristic checks
  return {
    isMalicious: false,
    threatCategory: null,
    matchedPattern: null,
    reason: null,
  };
}

// Scans and sanitizes text by replacing sensitive PII entities with redaction placeholders
// returns: PiiRedactionResult
export function redactPii(
  text: string,
  options: { preserveContacts?: boolean } = {}
): PiiRedactionResult {
  if (!text || text.length === 0) {
    return {
      sanitizedText: text,
      hasPii: false,
      entities: [],
    };
  }

  let sanitized = text;
  const detectedMap = new Map<string, number>();

  for (let i = 0; i < PII_PATTERNS.length; i++) {
    const pattern = PII_PATTERNS[i];

    // If preserveContacts is enabled (e.g. for evidence context), skip email and phone
    if (options.preserveContacts && pattern.isContact) {
      continue;
    }

    let matchCount = 0;

    sanitized = sanitized.replace(pattern.regex, () => {
      matchCount++;
      return pattern.placeholder;
    });

    if (matchCount > 0) {
      detectedMap.set(pattern.type, matchCount);
    }
  }

  // entities is an Array of Objects containing entity type and occurrence count
  const entities: PiiEntityMatch[] = [];
  for (const [type, count] of detectedMap.entries()) {
    entities.push({ type, count });
  }

  // returns: PiiRedactionResult
  return {
    sanitizedText: sanitized,
    hasPii: entities.length > 0,
    entities,
  };
}

// Comprehensive guardrail evaluator executing prompt injection scan and PII redaction
// returns: GuardrailEvaluationResult
export function evaluateInputGuardrails(query: string): GuardrailEvaluationResult {
  const injectionCheck = scanPromptInjection(query);
  const piiCheck = redactPii(query);

  const allowed = !injectionCheck.isMalicious;

  return {
    allowed,
    sanitizedQuery: piiCheck.sanitizedText,
    injectionCheck,
    piiCheck,
  };
}
