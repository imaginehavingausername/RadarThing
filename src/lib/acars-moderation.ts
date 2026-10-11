// Keep this list deliberately small and reviewable. Match whole words so flight
// terms such as "cockpit", "class", and "pass" are not blocked accidentally.
const blockedWords = {
  profanity: new Set([
    "ass",
    "asshole",
    "assholes",
    "bastard",
    "bastards",
    "bitch",
    "bitches",
    "bullshit",
    "cunt",
    "cunts",
    "dick",
    "dickhead",
    "dicks",
    "dumbass",
    "fuck",
    "fucked",
    "fucker",
    "fucking",
    "motherfucker",
    "prick",
    "pussy",
    "shit",
    "shitty",
    "slut",
    "whore",
    "wtf",
  ]),
  hate: new Set([
    "chink",
    "fag",
    "faggot",
    "faggots",
    "kike",
    "nigga",
    "nigger",
    "spic",
  ]),
};

const substitutions: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
  "!": "i",
};

function variants(word: string) {
  return [
    word,
    word.replace(/([a-z])\1{2,}/g, "$1"),
    word.replace(/([a-z])\1{2,}/g, "$1$1"),
  ];
}

export function screenAcars(body: string): {
  flagged: boolean;
  categories: string[];
} {
  const normalized = body
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLowerCase()
    .replace(
      /[013457@$!]/g,
      (character) => substitutions[character] ?? character,
    );
  const categories = new Set<string>();
  const candidates = new Set<string>();

  for (const token of normalized.match(/[a-z]+(?:[.*_-]+[a-z]+)*/g) ?? []) {
    const parts = token.split(/[.*_-]+/);
    for (const part of parts) candidates.add(part);
    if (parts.length > 1) candidates.add(parts.join(""));
  }
  for (const spaced of normalized.match(/\b[a-z](?:[\s.*_-]+[a-z]){2,}\b/g) ??
    []) {
    candidates.add(spaced.replace(/[^a-z]/g, ""));
  }

  for (const candidate of candidates) {
    for (const spelling of variants(candidate)) {
      for (const [category, words] of Object.entries(blockedWords)) {
        if (words.has(spelling)) categories.add(category);
      }
    }
  }

  return { flagged: categories.size > 0, categories: [...categories] };
}
