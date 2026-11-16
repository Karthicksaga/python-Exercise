/**
 * Painted shop signboards for ground-floor shop fronts. Everything here is invented: the Tamil
 * lines are ordinary words for kinds of shops (grocery, eatery, pharmacy…), and the two that
 * read like names ("புது ஸ்டோர்ஸ்" = "New Stores", "நிலா டிபன் சென்டர்" = "Moon tiffin
 * centre") are generic made-up patterns, not real businesses. No brand or chain names (AGENTS.md).
 *
 * The board colours follow the bright painted signs of Chennai streets.
 */
export interface ShopSign {
  /** Tamil line, drawn large. Needs the embedded Tamil font (see `loadSignFont`). */
  readonly tamil: string;
  /** English line, drawn smaller; it is all that is drawn when the Tamil font is unavailable. */
  readonly english: string;
  /** Board, text and trim colours as CSS colours. */
  readonly board: string;
  readonly ink: string;
  readonly trim: string;
  /** Wide boards span two shop bays (about 6.4 m), narrow ones one bay (about 3.2 m). */
  readonly wide: boolean;
}

export const SHOP_SIGNS: readonly ShopSign[] = [
  { tamil: "மளிகைக் கடை", english: "GROCERY & PROVISIONS", board: "#f6c923", ink: "#b3161b", trim: "#1d5fa8", wide: true },
  { tamil: "சைவ உணவகம்", english: "VEG MEALS · TIFFIN", board: "#1f7a3a", ink: "#fff7d6", trim: "#f2c230", wide: true },
  { tamil: "துணிக்கடை", english: "TEXTILES & READYMADES", board: "#1d4fa0", ink: "#ffffff", trim: "#e83f6f", wide: true },
  { tamil: "நிலா டிபன் சென்டர்", english: "NILA TIFFIN CENTRE", board: "#c8302c", ink: "#fff2a8", trim: "#ffffff", wide: true },
  { tamil: "மருந்தகம்", english: "MEDICALS", board: "#ffffff", ink: "#0f7a3c", trim: "#0f7a3c", wide: false },
  { tamil: "தேநீர் கடை", english: "TEA · COFFEE", board: "#e8742a", ink: "#ffffff", trim: "#5a2a12", wide: false },
  { tamil: "புது ஸ்டோர்ஸ்", english: "NEW STORES", board: "#7a2f8f", ink: "#ffe36b", trim: "#ffe36b", wide: false },
  { tamil: "பூக்கடை", english: "FLOWERS", board: "#f4e6c8", ink: "#c2185b", trim: "#2e7d32", wide: false },
  { tamil: "காலணிகள்", english: "FOOTWEAR", board: "#1b1b1b", ink: "#ffd54a", trim: "#ffd54a", wide: false },
  { tamil: "கைபேசி சேவை", english: "MOBILE SERVICE", board: "#18a0c8", ink: "#ffffff", trim: "#0b3d5c", wide: false },
];

/** Generic English shop words the signs may use; checked by a unit test so no brand slips in. */
export const SIGN_WORDS: ReadonlySet<string> = new Set([
  "GROCERY", "PROVISIONS", "VEG", "MEALS", "TIFFIN", "TEXTILES", "READYMADES", "NILA", "CENTRE",
  "MEDICALS", "TEA", "COFFEE", "NEW", "STORES", "FLOWERS", "FOOTWEAR", "MOBILE", "SERVICE",
]);

export const WIDE_SIGNS: readonly number[] = SHOP_SIGNS.flatMap((s, i) => (s.wide ? [i] : []));
export const NARROW_SIGNS: readonly number[] = SHOP_SIGNS.flatMap((s, i) => (s.wide ? [] : [i]));

/** Every distinct character of the Tamil lines: the glyphs the embedded font subset must hold. */
export function signGlyphs(): string {
  return [...new Set(SHOP_SIGNS.map((s) => s.tamil).join(""))].sort().join("");
}
