/**
 * Heuristic profile extraction from chat messages.
 * Scans text for age, city, country, job, language, budget mentions.
 *
 * Contract: returns only fields that were detected (partial object).
 * Caller deep-merges into existing profile — no destructive overwrites.
 *
 * Replace with LLM-based extraction for better accuracy.
 */
export interface ExtractedProfile {
  age?: number;
  city?: string;
  country?: string;
  job?: string;
  langue?: string;
  budget_range?: string;
  relationship_status?: string;
  interests?: string[];
}

interface Message {
  text: string | null;
  direction: string;
}

const AGE_PATTERNS = [
  /j'?ai\s+(\d{1,2})\s*ans/i,
  /(\d{1,2})\s*ans/i,
  /(\d{1,2})\s*(?:yo|y\.o|years?\s*old)/i,
  /age\s*[:=]?\s*(\d{1,2})/i,
  /i'?m\s+(\d{1,2})/i,
];

const CITY_PATTERNS = [
  /(?:je\s+(?:suis|vis|habite)\s+(?:à|a|de|en))\s+([A-ZÀ-Ü][a-zà-ü]{2,}(?:\s+[A-ZÀ-Ü][a-zà-ü]{2,})?)/,
  /(?:i\s+(?:live|am)\s+(?:in|from|at))\s+([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)/i,
  /(?:basé|based)\s+(?:à|a|in)\s+([A-ZÀ-Ü][a-zà-ü]{2,})/i,
];

const KNOWN_CITIES = new Set([
  'paris', 'lyon', 'marseille', 'toulouse', 'nice', 'bordeaux', 'lille',
  'zurich', 'geneve', 'genève', 'berne', 'lausanne', 'bâle', 'basel',
  'london', 'berlin', 'munich', 'dubai', 'monaco', 'bruxelles', 'brussels',
]);

const COUNTRY_PATTERNS = [
  /(?:je\s+(?:suis|vis|habite)\s+(?:en|au|aux))\s+([A-ZÀ-Ü][a-zà-ü]{3,})/,
  /(?:i'?m?\s+from)\s+([A-Z][a-z]{3,})/i,
];

const JOB_PATTERNS = [
  /(?:je\s+(?:suis|travaille\s+comme|bosse\s+comme))\s+([a-zà-ü\s]{3,30})/i,
  /(?:i(?:'m|\s+am)\s+(?:a|an)\s+)([a-z\s]{3,30})/i,
  /(?:métier|job|travail|profession)\s*[:=]?\s*([a-zà-ü\s]{3,30})/i,
];

const BUDGET_PATTERNS = [
  /(\d{2,6})\s*(?:€|eur|chf|usd|\$)/i,
  /(?:budget|dépense|spend)\s*[:=]?\s*(\d{2,6})/i,
];

const RELATIONSHIP_KEYWORDS: Record<string, string> = {
  'célibataire': 'single', 'single': 'single',
  'marié': 'married', 'married': 'married', 'mariée': 'married',
  'divorcé': 'divorced', 'divorced': 'divorced', 'divorcée': 'divorced',
  'en couple': 'in_relationship', 'in a relationship': 'in_relationship',
};

const LANG_KEYWORDS: Record<string, string> = {
  'français': 'FR', 'french': 'FR', 'fr': 'FR',
  'anglais': 'EN', 'english': 'EN', 'en': 'EN',
  'allemand': 'DE', 'german': 'DE', 'de': 'DE',
  'italien': 'IT', 'italian': 'IT', 'it': 'IT',
  'espagnol': 'ES', 'spanish': 'ES', 'es': 'ES',
  'arabe': 'AR', 'arabic': 'AR',
};

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

export function extractProfile(messages: Message[]): ExtractedProfile {
  const inbound = messages
    .filter((m) => m.direction === 'in' && m.text)
    .map((m) => m.text!);

  if (inbound.length === 0) return {};

  const corpus = inbound.join('\n');
  const result: ExtractedProfile = {};

  // Age
  const ageStr = firstMatch(corpus, AGE_PATTERNS);
  if (ageStr) {
    const age = parseInt(ageStr, 10);
    if (age >= 16 && age <= 99) result.age = age;
  }

  // City
  const cityMatch = firstMatch(corpus, CITY_PATTERNS);
  if (cityMatch) {
    result.city = cityMatch;
  } else {
    const lower = corpus.toLowerCase();
    for (const city of KNOWN_CITIES) {
      if (lower.includes(city)) {
        result.city = city.charAt(0).toUpperCase() + city.slice(1);
        break;
      }
    }
  }

  // Country
  const country = firstMatch(corpus, COUNTRY_PATTERNS);
  if (country) result.country = country;

  // Job
  const job = firstMatch(corpus, JOB_PATTERNS);
  if (job && job.length > 2) result.job = job;

  // Budget
  const budget = firstMatch(corpus, BUDGET_PATTERNS);
  if (budget) {
    const val = parseInt(budget, 10);
    if (val < 100) result.budget_range = 'low';
    else if (val < 500) result.budget_range = 'medium';
    else if (val < 2000) result.budget_range = 'high';
    else result.budget_range = 'whale';
  }

  // Relationship status
  const corpusLower = corpus.toLowerCase();
  for (const [kw, status] of Object.entries(RELATIONSHIP_KEYWORDS)) {
    if (corpusLower.includes(kw)) {
      result.relationship_status = status;
      break;
    }
  }

  // Language
  for (const [kw, lang] of Object.entries(LANG_KEYWORDS)) {
    if (corpusLower.includes(kw)) {
      result.langue = lang;
      break;
    }
  }

  return result;
}
