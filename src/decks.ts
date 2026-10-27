// Decks per job (#287): links to the decks sent for a role (Google Slides, Figma, Pitch, …), each
// with an optional label and the day it was sent. Links only: a deck lives where it was made, so
// it rides on the Job in the synced blob (no storage change). Pure and DOM-free.
import { httpUrl } from './httpUrl';
import type { Deck } from './types';

export type { Deck };

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype'];

/** What the deck form edits. `url` is raw input; empty label / sentOn mean none. */
export interface DeckInput {
  url: string;
  label?: string;
  sentOn?: string;
}

/** A deck from the form's fields, or null when the link is not an http(s) URL. */
function build(id: string, input: DeckInput): Deck | null {
  const url = httpUrl(input.url.trim());
  if (!url) return null;
  const deck: Deck = { id, url };
  const label = input.label?.trim();
  if (label) deck.label = label;
  if (input.sentOn && YMD.test(input.sentOn)) deck.sentOn = input.sentOn;
  return deck;
}

/** Append a deck; null when the link is not http(s) (the list is left as it was). */
export function addDeck(
  decks: readonly Deck[] | undefined,
  input: DeckInput,
  genId: () => string = () => crypto.randomUUID(),
): Deck[] | null {
  const deck = build(genId(), input);
  return deck ? [...(decks ?? []), deck] : null;
}

/** Replace the deck with `id` in place; null when the new link is not http(s). */
export function updateDeck(
  decks: readonly Deck[] | undefined,
  id: string,
  input: DeckInput,
): Deck[] | null {
  const deck = build(id, input);
  return deck ? (decks ?? []).map((d) => (d.id === id ? deck : d)) : null;
}

export function removeDeck(decks: readonly Deck[] | undefined, id: string): Deck[] {
  return (decks ?? []).filter((d) => d.id !== id);
}

/** Put a removed deck back at `at` (its old place), for Undo. One still listed is not added twice. */
export function restoreDeck(decks: readonly Deck[] | undefined, deck: Deck, at: number): Deck[] {
  const list = (decks ?? []).slice();
  if (list.some((d) => d.id === deck.id)) return list;
  list.splice(Math.max(0, Math.min(at, list.length)), 0, deck);
  return list;
}

/** Keep only well-formed decks from storage, the cloud or a backup: an id, an http(s) link (a
 *  `javascript:` deck never becomes an href), a string label and a YYYY-MM-DD sent day. */
export function sanitizeDecks(raw: unknown): Deck[] {
  if (!Array.isArray(raw)) return [];
  const out: Deck[] = [];
  const seen = new Set<string>();
  for (const d of raw) {
    if (!d || typeof d !== 'object') continue;
    const r = d as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id || UNSAFE_KEYS.includes(r.id) || seen.has(r.id)) continue;
    if (typeof r.url !== 'string') continue;
    const deck = build(r.id, {
      url: r.url,
      label: typeof r.label === 'string' ? r.label : undefined,
      sentOn: typeof r.sentOn === 'string' ? r.sentOn : undefined,
    });
    if (!deck) continue;
    seen.add(r.id);
    out.push(deck);
  }
  return out;
}

/** The CSV export's one Decks cell: "label url sent YYYY-MM-DD", decks split by " | ". */
export function decksCell(decks: readonly Deck[] | undefined): string {
  return (decks ?? [])
    .map((d) => [d.label, d.url, d.sentOn && `sent ${d.sentOn}`].filter(Boolean).join(' '))
    .join(' | ');
}
