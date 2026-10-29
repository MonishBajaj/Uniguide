/**
 * Part 3 community: checks that run before a post reaches the moderation queue. People meet
 * through posts, never off the platform, so contact details are refused outright (the database
 * also refuses emails and links).
 */
export type ContactKind = "email" | "link" | "phone" | "handle";

const PATTERNS: [ContactKind, RegExp][] = [
  ["email", /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[a-z0-9-]+(?:\s*(?:\.|\(dot\)|\[dot\])\s*[a-z0-9-]+)*\s*(?:\.|\(dot\)|\[dot\])\s*[a-z]{2,}/i],
  ["link", /\b(?:https?:\/\/|www\.)|\b[a-z0-9-]+\.(?:com|org|net|io|in|co|me|ly|gg|app)\b/i],
  // Seven or more digits, allowing spaces, dots, dashes and brackets between them.
  ["phone", /(?:\+?\d[\s().-]*){7,}/],
  ["handle", /(?:^|\s)@[a-z0-9_.]{2,}|\b(?:whats\s?app|telegram|wechat|insta(?:gram)?|snap(?:chat)?|signal|discord|dm me|message me on)\b/i],
];

export const CONTACT_MESSAGES: Record<ContactKind, string> = {
  email: "an email address",
  link: "a link or website",
  phone: "a phone number",
  handle: "a social media handle or messaging app",
};

/**
 * The kinds of contact detail found in any of the texts, in a fixed order. Each match is removed
 * before the next kind is checked, so an email is not also counted as a link.
 */
export function findContactDetails(...texts: (string | null | undefined)[]): ContactKind[] {
  let rest = texts.filter(Boolean).join("\n");
  const found: ContactKind[] = [];
  for (const [kind, re] of PATTERNS) {
    const all = new RegExp(re.source, `${re.flags}g`);
    if (all.test(rest)) {
      found.push(kind);
      rest = rest.replace(all, " ");
    }
  }
  return found;
}

export const MIN_REVIEWS_FOR_AVERAGE = 5;
export type Ratings = { teaching: number; support: number; value: number };

/** Averages only from five reviews up, so a single post cannot define a course. */
export function ratingSummary(ratings: Ratings[]): { count: number; averages: Ratings | null } {
  if (ratings.length < MIN_REVIEWS_FOR_AVERAGE) return { count: ratings.length, averages: null };
  const avg = (k: keyof Ratings) => Math.round((ratings.reduce((n, r) => n + r[k], 0) / ratings.length) * 10) / 10;
  return { count: ratings.length, averages: { teaching: avg("teaching"), support: avg("support"), value: avg("value") } };
}

export const REPORT_REASONS = {
  contact_details: "Shares contact details",
  abuse: "Abusive or hateful",
  misleading: "False or misleading",
  spam: "Spam or advertising",
  other: "Something else",
} as const;

export const COMMUNITY_RULES = [
  "Use a made-up name. Never share contact details, yours or anyone else's.",
  "Write about your own experience. Say what happened, not what will happen to others.",
  "No advertising, agents or paid services.",
  "Facts about courses come from official pages; check anything you read here there.",
  "Every post is read by a moderator before it appears.",
];
