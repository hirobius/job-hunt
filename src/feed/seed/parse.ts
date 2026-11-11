// Design-system company seed (2026-10-28): the lists we mine for companies that run a design system,
// each parsed into candidates (a company name, its website when the list gives one, the slugs a job
// board might use, and where we saw it). Pure: `run.ts` does the fetching, `resolve.ts` finds and
// confirms the boards. Only facts are kept (a company name, a domain, a link to the evidence), never
// a list's prose.
//
// Sources and their terms:
// - Adele (github.com/uxpin/adele): MIT; the snapshot and its notice are src/feed/data/adele.json.
// - awesome-design-systems (github.com/alexpate/awesome-design-systems): the Unlicense (public
//   domain), read from its README on raw.githubusercontent.com.
// - designsystems.jobs: its robots.txt allows everything; we read the sitemap (company slugs, one
//   request) and the RSS feed (names), never the job pages. Its disclaimer sends applicants to the
//   company's own site, which is what a watched board is.
// - Hacker News "Who is hiring?" through the public Algolia HN API (keyless, ~10k requests an hour):
//   the company segment of top-level posts that name a design system, and any board they link.
// - GitHub REST search (keyless: 10 searches a minute): organisations owning repositories tagged
//   `design-system`. UNVERIFIED LIVE: the build container's proxy refuses GitHub search.
// Not used: component.gallery (its data is a private Airtable base with no licence) and
// designsystemsrepo / Design Systems for Figma (no licence stated; hosts unreachable from the build
// container). Add them here only once their terms allow it.
import { decodeEntities, htmlToText } from '../html';
import { slugCandidates } from '../probe';
import { parseBoardUrl, type Board } from '../sources/ats';
import { arr, obj, str } from '../sources/http';
import { normName } from '../distinctName';

export type SeedSourceId = 'adele' | 'awesome' | 'dsjobs' | 'hn' | 'github';

export interface SeedSource {
  id: SeedSourceId;
  label: string;
  url: string;
  licence: string;
}

export const SEED_SOURCES: Readonly<Record<SeedSourceId, SeedSource>> = {
  adele: {
    id: 'adele',
    label: 'Adele (UXPin)',
    url: 'https://github.com/uxpin/adele',
    licence: 'MIT, Copyright (c) 2018 Marcin Treder',
  },
  awesome: {
    id: 'awesome',
    label: 'awesome-design-systems',
    url: 'https://github.com/alexpate/awesome-design-systems',
    licence: 'Unlicense (public domain)',
  },
  dsjobs: {
    id: 'dsjobs',
    label: 'designsystems.jobs',
    url: 'https://designsystems.jobs/',
    licence: 'Facts only (company names); robots.txt allows all',
  },
  hn: {
    id: 'hn',
    label: 'Hacker News Who is hiring',
    url: 'https://hn.algolia.com/api',
    licence: 'Facts only (company names, links); public Algolia HN API',
  },
  github: {
    id: 'github',
    label: 'GitHub topic: design-system',
    url: 'https://github.com/topics/design-system',
    licence: 'Facts only (organisation names); GitHub REST API terms',
  },
};

export interface Evidence {
  source: SeedSourceId;
  /** Where the company was seen (a design system site, a job post, a repository). */
  url: string;
}

export interface Candidate {
  name: string;
  /** The company's own site (`https://<registrable domain>`), '' when unknown. */
  website: string;
  /** Slugs to try on each ATS, likeliest first. */
  slugs: string[];
  /** Boards the source itself linked (an HN post's Apply link): confirmed without a guess. */
  linked: Board[];
  /** Job titles the source saw this company post (designsystems.jobs), for a title match. */
  titles: string[];
  evidence: Evidence[];
}

// ---- domains ----

/** Second-level labels under a country code that are registries, not companies. */
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'ac', 'edu', 'or', 'ne', 'go']);

/** Hosts that serve many unrelated sites: a design system living there names no company. */
const SHARED_HOSTS = new Set([
  'github.io',
  'github.com',
  'gitlab.io',
  'gitlab.com',
  'bitbucket.org',
  'netlify.app',
  'netlify.com',
  'vercel.app',
  'now.sh',
  'herokuapp.com',
  'surge.sh',
  'firebaseapp.com',
  'web.app',
  'pages.dev',
  'gitbook.io',
  'zeroheight.com',
  'notion.site',
  'medium.com',
  'webflow.io',
  'framer.website',
  'storybook.js.org',
  'chromatic.com',
  'azurewebsites.net',
  'cloudfront.net',
  'amazonaws.com',
  'wordpress.com',
  'readthedocs.io',
  'figma.com',
  'supernova-docs.io',
  'ycombinator.com',
  'linkedin.com',
  'wellfound.com',
  'angel.co',
  'workatastartup.com',
  'google.com',
  'docs.google.com',
  'forms.gle',
  'bit.ly',
  'twitter.com',
  'x.com',
  'youtube.com',
  'npmjs.com',
]);

/** The registrable domain of a URL or bare host ("spectrum.adobe.com" → "adobe.com",
 *  "www.bbc.co.uk" → "bbc.co.uk"); '' for junk. */
export function registrableDomain(raw: string): string {
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return '';
  }
  if (!host.includes('.') || /^\d+(\.\d+){3}$/.test(host)) return '';
  const labels = host.replace(/\.$/, '').split('.');
  const n =
    labels.length >= 3 &&
    labels[labels.length - 1].length === 2 &&
    SECOND_LEVEL.has(labels[labels.length - 2])
      ? 3
      : 2;
  return labels.slice(-n).join('.');
}

const PUBLIC_TLD = /\.(gov|mil|edu|int)(\.[a-z]{2})?$|\.(gov|gouv|govt|gob|gc|ac|edu)\.[a-z]{2}$/;
const PUBLIC_DOMAINS = new Set(['europa.eu', 'gc.ca', 'canada.ca', 'nhs.uk', 'nhs.net', 'gov.uk']);
const ATS_DOMAINS = new Set([
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'workable.com',
  'recruitee.com',
  'smartrecruiters.com',
  'teamtailor.com',
  'personio.de',
  'personio.com',
  'myworkdayjobs.com',
  'bamboohr.com',
  'breezy.hr',
  'jobvite.com',
  'icims.com',
  'avature.net',
  'rippling.com',
  'homerun.co',
  'pinpointhq.com',
  'designsystems.jobs',
]);

/** True for a domain that belongs to a public body or a school: they hire through civil-service
 *  portals, never one of the ATS boards we read. */
export const isPublicDomain = (d: string) =>
  PUBLIC_TLD.test(d) ||
  PUBLIC_DOMAINS.has(d) ||
  [...PUBLIC_DOMAINS].some((p) => d.endsWith(`.${p}`));

/** The company website a link points at, or '' when the link is a shared host, an ATS, a job board
 *  or a public body. */
export function companySite(link: string): string {
  const d = registrableDomain(link);
  if (!d || SHARED_HOSTS.has(d) || ATS_DOMAINS.has(d) || isPublicDomain(d)) return '';
  const host = (() => {
    try {
      return new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`).hostname.toLowerCase();
    } catch {
      return '';
    }
  })();
  if ([...SHARED_HOSTS].some((s) => host === s || host.endsWith(`.${s}`))) return '';
  return `https://${d}`;
}

/** "https://adobe.com" → "adobe". */
export const domainLabel = (website: string) => registrableDomain(website).split('.')[0] ?? '';

// ---- names ----

const PUBLIC_NAME =
  /\b(government|ministry|council|university|universit[ée]|college|city of|state of|county|department of|agency|federal|national health|parliament|police)\b/i;
const DS_WORDS =
  /\s*[-–—:]?\s*\b(design systems?|design language( system)?|style ?guide|pattern library|component library|ui kit|ui library|brand guidelines?|guidelines|components|ui)\s*$/i;

/** The company in a design system's listed name: the parenthetical when there is one
 *  ("Backpack (Skyscanner)" → "Skyscanner"), else the name without its trailing "Design System"
 *  ("Atlassian Design System" → "Atlassian"). */
export function companyFromListing(listed: string): string {
  const text = decodeEntities(listed).replace(/\s+/g, ' ').trim();
  const paren = text.match(/\(([^)]+)\)\s*$/);
  if (paren && !/^(beta|alpha|v\d|legacy|old|new)$/i.test(paren[1].trim())) return paren[1].trim();
  let name = text.replace(/\([^)]*\)/g, '').trim();
  for (let prev = ''; prev !== name;) {
    prev = name;
    name = name.replace(DS_WORDS, '').trim();
  }
  return name || text;
}

/** A name we can use: has letters, not a sentence, not a public body. */
export const usableName = (name: string) =>
  /[a-z]/i.test(name) &&
  name.length <= 60 &&
  name.split(/\s+/).length <= 6 &&
  !PUBLIC_NAME.test(name);

/** Slugs to try, likeliest first, at most 3: the website's own label, then the name's. */
export function slugsFor(name: string, website: string, extra: string[] = []): string[] {
  const label = website ? domainLabel(website) : '';
  return [...new Set([...extra, label, ...slugCandidates(name)].filter(Boolean))].slice(0, 3);
}

const uniqueBoards = (list: Board[]) =>
  list.filter(
    (b, i) =>
      list.findIndex((x) => x.kind === b.kind && x.slug.toLowerCase() === b.slug.toLowerCase()) ===
      i,
  );

const candidate = (
  name: string,
  website: string,
  evidence: Evidence,
  more: Partial<Pick<Candidate, 'linked' | 'titles' | 'slugs'>> = {},
): Candidate => ({
  name,
  website,
  slugs: slugsFor(name, website, more.slugs),
  linked: uniqueBoards(more.linked ?? []),
  titles: more.titles ?? [],
  evidence: [evidence],
});

// ---- Adele ----

export function parseAdele(data: { companies: { name: string; site: string }[] }): Candidate[] {
  return data.companies.flatMap((c) => {
    const name = c.name.trim();
    const site = c.site ? companySite(c.site) : '';
    if (!usableName(name) || (c.site && isPublicDomain(registrableDomain(c.site)))) return [];
    return [candidate(name, site, { source: 'adele', url: c.site || SEED_SOURCES.adele.url })];
  });
}

// ---- awesome-design-systems ----

/** The README's table: one row per design system, `| [Name](site) | … |`. */
export function parseAwesome(markdown: string): Candidate[] {
  const out: Candidate[] = [];
  for (const line of markdown.split('\n')) {
    const m = line.match(/^\|\s*\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*\|/);
    if (!m) continue;
    const [, listed, url] = m;
    if (isPublicDomain(registrableDomain(url))) continue;
    const name = companyFromListing(listed);
    if (!usableName(name)) continue;
    out.push(candidate(name, companySite(url), { source: 'awesome', url }));
  }
  return out;
}

// ---- designsystems.jobs ----

const DSJ = 'https://designsystems.jobs/companies/';

/** The sitemap: every company page (`/companies/<slug>`) and the job pages under it, whose last
 *  segment is the job title as a slug. */
export function parseDsjSitemap(xml: string): Candidate[] {
  const bySlug = new Map<string, string[]>();
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const loc = m[1];
    if (!loc.startsWith(DSJ)) continue;
    const [slug, job] = loc.slice(DSJ.length).split('/');
    if (!slug || !/^[a-z0-9][a-z0-9-]*$/i.test(slug)) continue;
    const titles = bySlug.get(slug) ?? [];
    if (job && /^[a-z0-9-]+$/i.test(job)) titles.push(job.replace(/-/g, ' '));
    bySlug.set(slug, titles);
  }
  return [...bySlug].map(([slug, titles]) => {
    const name = slug
      .split('-')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
    return candidate(
      name,
      '',
      { source: 'dsjobs', url: `${DSJ}${slug}` },
      {
        titles,
        slugs: [slug.toLowerCase(), slug.replace(/-/g, '').toLowerCase()],
      },
    );
  });
}

const tagText = (block: string, tag: string) =>
  decodeEntities(
    (block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? '')
      .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
      .trim(),
  );

/** The RSS feed: "Role at Company" per item, so the real spelling of recent companies' names. */
export function parseDsjFeed(xml: string): Candidate[] {
  const out: Candidate[] = [];
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const title = tagText(m[1], 'title');
    const at = title.lastIndexOf(' at ');
    if (at <= 0) continue;
    const name = title.slice(at + 4).trim();
    if (!usableName(name)) continue;
    const link = tagText(m[1], 'link');
    const slug = link.startsWith(DSJ) ? link.slice(DSJ.length).split('/')[0] : '';
    out.push(
      candidate(
        name,
        '',
        { source: 'dsjobs', url: link || SEED_SOURCES.dsjobs.url },
        {
          titles: [title.slice(0, at).trim()],
          slugs: slug ? [slug.toLowerCase()] : [],
        },
      ),
    );
  }
  return out;
}

// ---- Hacker News ----

export const HN_API = 'https://hn.algolia.com/api/v1';
export const DESIGN_SYSTEM_RE = /\bdesign[\s-]+systems?\b/i;

/** "Ask HN: Who is hiring?" story ids, newest first, at most `n`. */
export function hnThreads(listing: unknown, n: number): string[] {
  return arr(obj(listing).hits)
    .map(obj)
    .filter((h) => /^ask hn: who is hiring\?/i.test(str(h.title)))
    .sort((a, b) => str(b.created_at).localeCompare(str(a.created_at)))
    .slice(0, n)
    .map((h) => str(h.objectID));
}

const hrefs = (html: string) =>
  [...html.matchAll(/href="([^"]+)"/gi)].map((m) => decodeEntities(m[1]));

/** Top-level posts of one thread that name a design system: the company is the first pipe
 *  segment ("Acme (acme.com) | Design Systems Engineer | Remote"), its site the first link that is
 *  neither a job board nor an ATS, and any ATS board it links is taken as is. */
export function parseHnHits(body: unknown, storyId: string): Candidate[] {
  const out: Candidate[] = [];
  for (const h of arr(obj(body).hits).map(obj)) {
    const html = str(h.comment_text);
    if (String(h.parent_id) !== storyId || !html) continue;
    const text = htmlToText(html);
    if (!DESIGN_SYSTEM_RE.test(text)) continue;
    const first = text.split('\n')[0];
    if (!first.includes('|')) continue;
    const head = first.split('|')[0].trim();
    const inline =
      head.match(/\(?\b((?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+)\b\)?/i)?.[1] ?? '';
    const name = head
      .replace(/\([^)]*\)/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(
        /\b[a-z0-9-]+\.(com|io|ai|co|dev|app|org|net|so|xyz|tech|inc)\b/gi,
        (d) => d.split('.')[0],
      )
      .replace(/[\s[\](){}:;,.\-–—/]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!usableName(name)) continue;
    const links = hrefs(html);
    const linked = links.map(parseBoardUrl).filter((b): b is Board => !!b);
    // A post links its careers host, its ATS, a shortener: only a domain that looks like the
    // company's own name is its website.
    const own = (link: string) => {
      const site = companySite(link);
      const label = normName(domainLabel(site));
      const n = normName(name);
      return site && label.length >= 3 && (label.includes(n) || n.includes(label)) ? site : '';
    };
    const site = (inline && own(inline)) || links.map(own).find(Boolean) || '';
    out.push(
      candidate(
        name,
        site,
        {
          source: 'hn',
          url: `https://news.ycombinator.com/item?id=${str(h.objectID)}`,
        },
        { linked },
      ),
    );
  }
  return out;
}

// ---- GitHub ----

/** Organisations owning repositories in a topic search page (users are people, not employers). */
export function parseGithubSearch(body: unknown): Candidate[] {
  return arr(obj(body).items)
    .map(obj)
    .flatMap((repo) => {
      const owner = obj(repo.owner);
      const login = str(owner.login);
      if (str(owner.type) !== 'Organization' || !login) return [];
      const homepage = str(repo.homepage);
      return [
        candidate(
          login,
          homepage ? companySite(homepage) : '',
          {
            source: 'github',
            url: str(repo.html_url) || `https://github.com/${login}`,
          },
          { slugs: [login.toLowerCase()] },
        ),
      ];
    });
}

// ---- merging ----

export { normName };

/** One candidate per company: same website, or same name when either has no website. The first
 *  seen keeps its name; slugs, boards, titles and evidence are pooled. */
export function mergeCandidates(list: Candidate[]): Candidate[] {
  const out: Candidate[] = [];
  const byDomain = new Map<string, Candidate>();
  const byName = new Map<string, Candidate>();
  for (const c of list) {
    const d = c.website && registrableDomain(c.website);
    const n = normName(c.name);
    if (!n) continue;
    const hit = (d && byDomain.get(d)) || byName.get(n);
    if (hit && (!d || !hit.website || domainLabel(hit.website) === domainLabel(c.website))) {
      if (!hit.website && c.website) hit.website = c.website;
      hit.slugs = [...new Set([...hit.slugs, ...c.slugs])];
      for (const b of c.linked)
        if (
          !hit.linked.some(
            (x) => x.kind === b.kind && x.slug.toLowerCase() === b.slug.toLowerCase(),
          )
        )
          hit.linked.push(b);
      hit.titles = [...new Set([...hit.titles, ...c.titles])];
      for (const e of c.evidence)
        if (!hit.evidence.some((x) => x.source === e.source && x.url === e.url))
          hit.evidence.push(e);
      if (hit.website) byDomain.set(registrableDomain(hit.website), hit);
      byName.set(n, hit);
      continue;
    }
    const copy = {
      ...c,
      slugs: [...c.slugs],
      linked: [...c.linked],
      titles: [...c.titles],
      evidence: [...c.evidence],
    };
    out.push(copy);
    if (d) byDomain.set(d, copy);
    byName.set(n, copy);
  }
  return out;
}
