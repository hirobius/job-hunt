// Export links (2026-10-22): the saved jobs' posting links as plain text, to paste into a note,
// a message or another tool. Pure: the dialog (ExportLinksDialog.tsx) picks the jobs and the
// format, this turns them into text and says how many made it.
import { BRAND } from './brand';
import { createStore } from './createStore';
import { httpUrl } from './feed/targets';
import type { Job } from './types';

/** `links`: one URL per line. `titled`: "Title — Company", the URL under it, a blank line between. */
export type LinkFormat = 'links' | 'titled';
/** `view`: the Pipeline's Jobs panel as filtered and searched. `all`: every saved job. */
export type LinkScope = 'view' | 'all';

export interface LinkList {
  text: string;
  /** Links in the text. */
  count: number;
  /** Jobs left out for having no web link (duplicates aren't counted: their link is there). */
  skipped: number;
}

/** The jobs' links in their given order: no web link → skipped, a repeated link → once. */
export function buildLinkList(jobs: readonly Job[], format: LinkFormat): LinkList {
  const seen = new Set<string>();
  const entries: string[] = [];
  let skipped = 0;
  for (const j of jobs) {
    const url = httpUrl(j.url?.trim());
    if (!url) {
      skipped++;
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    const heading = [j.label?.trim(), j.company?.trim()].filter(Boolean).join(' — ');
    entries.push(format === 'titled' && heading ? `${heading}\n${url}` : url);
  }
  return { text: entries.join(format === 'titled' ? '\n\n' : '\n'), count: seen.size, skipped };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `<brand>-links-YYYY-MM-DD.txt`, the local date. */
export function linksFilename(now: Date): string {
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${BRAND.slug}-links-${day}.txt`;
}

// Which scope the dialog opened on, or null when closed. In memory only, like the follow-up
// flow: the dialog is mounted once (DataToolsProvider) and opened from the Pipeline or the menu.
const open = createStore<LinkScope | null>(null);
export const useExportLinksScope = open.use;
export const openExportLinks = (scope: LinkScope) => open.set(scope);
export const closeExportLinks = () => open.set(null);
