/**
 * Deterministic tokenizers.
 *
 * cogitatome ships two. The byte tokenizer is total — any string in, 256 ids
 * out — and needs no training. The alphabet tokenizer is what the constructed
 * induction model speaks: a fixed 16-symbol toy language with no ambiguity.
 * Neither touches the network or a model provider.
 */

/** Byte-level tokenizer over the whole Latin-1 range. Total and reversible. */
export const BYTE_VOCAB_SIZE = 256;

export function encodeBytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code > 255) {
      // Split non-Latin-1 into UTF-8-ish surrogate pairs so nothing is lost.
      for (const unit of new TextEncoder().encode(ch)) out.push(unit);
    } else {
      out.push(code);
    }
  }
  return out;
}

export function decodeBytes(ids: readonly number[]): string {
  const bytes = new Uint8Array(ids.filter((i) => i >= 0 && i < 256));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/** The 16 symbols of the toy induction language. Symbol 0 is reserved as the anchor. */
export const ALPHABET: readonly string[] = [
  "^", // anchor / start-of-sequence: never a query target, never a "previous token" match
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o"
];

export const ALPHABET_SIZE = ALPHABET.length;

/** The reserved first symbol of every stimulus. */
export const ANCHOR_TOKEN = 0;

/** Symbols a toy sentence may actually use (the anchor is excluded). */
export const USABLE_TOKENS: readonly number[] = Array.from(
  { length: ALPHABET_SIZE - 1 },
  (_, i) => i + 1
);

export function encodeAlphabet(text: string): number[] {
  const out: number[] = [];
  for (const ch of text.toLowerCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx >= 0) out.push(idx);
  }
  return out;
}

export function decodeAlphabet(ids: readonly number[]): string {
  return ids.map((i) => ALPHABET[i] ?? "?").join(" ");
}

/**
 * A repeated motif, the canonical stimulus for an induction head, prefixed by the
 * anchor. Token `k` of the motif reappears every `period` positions, so a model
 * that has learned induction predicts `motif[k]` after seeing `motif[k % period]`
 * again.
 */
export function makeRepeated(motif: readonly number[], periods: number): number[] {
  const out: number[] = [ANCHOR_TOKEN];
  for (let p = 0; p < periods; p += 1) out.push(...motif);
  return out;
}

/** A non-repeating control sequence: no induction signal at all. */
export function controlStimulus(length: number): number[] {
  const out: number[] = [];
  let x = 12345;
  for (let i = 0; i < length; i += 1) {
    x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
    out.push(x % ALPHABET_SIZE);
  }
  return out;
}

/** How well a model's predictions match a repeated motif (induction score). */
export function inductionAccuracy(
  predicted: readonly number[],
  motif: readonly number[],
  offset: number
): number {
  if (motif.length === 0 || predicted.length === 0) return 0;
  let hits = 0;
  for (let i = 0; i < predicted.length; i += 1) {
    const truth = motif[(offset + i) % motif.length] ?? -1;
    if (truth >= 0 && predicted[i] === truth) hits += 1;
  }
  return hits / predicted.length;
}
