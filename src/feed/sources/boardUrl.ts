// A company-board link → its board (kind + slug), with no other imports: the shell's store reads
// it at startup (companyFromUrl), and the rest of ats.ts (parsers, API URLs, the extra ATSs)
// stays out of the first chunk (#368 pass). ats.ts re-exports it.
export type BoardKind =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workable'
  | 'recruitee'
  | 'smartrecruiters'
  | 'teamtailor'
  | 'personio'
  | 'bamboohr'
  | 'rippling'
  | 'gem'
  | 'pinpoint'
  | 'breezy';
export interface Board {
  kind: BoardKind;
  slug: string;
  /** Lever's EU data-residency boards live on a separate host. */
  eu?: true;
}

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Recognize a company board URL; null for anything else (including searches *about* boards). */
export function parseBoardUrl(raw: string): Board | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const seg = u.pathname.split('/').filter(Boolean);
  const ok = (slug: string | undefined | null): slug is string => !!slug && SLUG.test(slug);

  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    const slug = seg[0] === 'embed' ? u.searchParams.get('for') : seg[0];
    return ok(slug) ? { kind: 'greenhouse', slug } : null;
  }
  if (host === 'boards-api.greenhouse.io') {
    const i = seg.indexOf('boards');
    return ok(seg[i + 1]) && i >= 0 ? { kind: 'greenhouse', slug: seg[i + 1] } : null;
  }
  if (host === 'jobs.lever.co') return ok(seg[0]) ? { kind: 'lever', slug: seg[0] } : null;
  if (host === 'jobs.eu.lever.co')
    return ok(seg[0]) ? { kind: 'lever', slug: seg[0], eu: true } : null;
  if (host === 'ashbyhq.com' || host.endsWith('.ashbyhq.com'))
    return ok(seg[0]) ? { kind: 'ashby', slug: seg[0] } : null;
  if (host === 'apply.workable.com')
    return ok(seg[0]) && seg[0] !== 'api' ? { kind: 'workable', slug: seg[0] } : null;
  if (host.endsWith('.recruitee.com')) {
    // One label only: `acme.recruitee.com`, not `www.`, `api.` or a deeper host.
    const sub = host.slice(0, -'.recruitee.com'.length);
    return ok(sub) && !sub.includes('.') && !['www', 'api', 'app'].includes(sub)
      ? { kind: 'recruitee', slug: sub }
      : null;
  }
  if (host === 'jobs.smartrecruiters.com' || host === 'careers.smartrecruiters.com')
    return ok(seg[0]) ? { kind: 'smartrecruiters', slug: seg[0] } : null;
  const sub = (suffix: string) => {
    if (!host.endsWith(suffix)) return null;
    const label = host.slice(0, -suffix.length);
    return ok(label) && !label.includes('.') && !['www', 'api', 'app'].includes(label)
      ? label
      : null;
  };
  const tt = sub('.teamtailor.com');
  if (tt) return { kind: 'teamtailor', slug: tt };
  const pe = sub('.jobs.personio.de') ?? sub('.jobs.personio.com');
  if (pe) return { kind: 'personio', slug: pe };
  const bamboo = sub('.bamboohr.com');
  if (bamboo) return { kind: 'bamboohr', slug: bamboo };
  const pin = sub('.pinpointhq.com');
  if (pin) return { kind: 'pinpoint', slug: pin };
  const breezy = sub('.breezy.hr');
  if (breezy && breezy !== 'marketplace') return { kind: 'breezy', slug: breezy };
  if (host === 'ats.rippling.com') {
    // A locale may lead the path: ats.rippling.com/en-GB/acme/jobs.
    const s = /^[a-z]{2}-[A-Z]{2}$/.test(seg[0] ?? '') ? seg[1] : seg[0];
    return ok(s) ? { kind: 'rippling', slug: s } : null;
  }
  if (host === 'jobs.gem.com') return ok(seg[0]) ? { kind: 'gem', slug: seg[0] } : null;
  return null;
}
