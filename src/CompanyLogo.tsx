// A company as a small round mark: its logo when we can find one, else its first letter. HDS
// `Avatar` draws both (image + initials fallback); this wrapper only decides when the image is
// worth showing. The icon is probed off-screen first (`new Image()`, no referrer, and only once
// the mark is near the viewport), and Avatar is handed the address only after it has loaded at
// least MIN_LOGO_PX square. Until then, or if it errors or is DuckDuckGo's tiny placeholder, the
// letter shows: never a broken image. Decorative: the company's name is always beside it.
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@hirobius/design-system';
import { companyDomain, logoLetter, logoUrl, MIN_LOGO_PX, verdicts } from './companyLogo';

export default function CompanyLogo({
  company,
  addresses = [],
  size = 'sm',
  className,
}: {
  company: string | undefined;
  /** Web addresses to take the domain from, in order: the company's own site first, then the
   *  posting's link (a job board's address is skipped, see companyLogo.ts). */
  addresses?: (string | undefined)[];
  size?: 'sm' | 'md' | 'lg';
  /** AvatarGroup adds its ring and overlap through this. */
  className?: string;
}) {
  const name = company?.trim() ?? '';
  const domain = name ? companyDomain(...addresses) : null;
  const url = domain ? logoUrl(domain) : null;
  const ref = useRef<HTMLSpanElement>(null);
  // Bumped when a probe lands; what to show is read from `verdicts`, never copied into state.
  const [, judged] = useState(0);
  const shown = url && verdicts.get(url) ? url : null;

  useEffect(() => {
    if (!url || verdicts.has(url)) return;
    let dead = false;
    let observer: IntersectionObserver | undefined;
    const probe = () => {
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.onload = () => {
        const ok = img.naturalWidth >= MIN_LOGO_PX && img.naturalHeight >= MIN_LOGO_PX;
        verdicts.set(url, ok);
        if (ok && !dead) judged((n) => n + 1);
      };
      img.onerror = () => verdicts.set(url, false);
      img.src = url;
    };
    const el = ref.current;
    if (el && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer?.disconnect();
        probe();
      });
      observer.observe(el);
    } else probe();
    return () => {
      dead = true;
      observer?.disconnect();
    };
  }, [url]);

  const letter = logoLetter(name);
  if (!letter) return null;
  return (
    <Avatar
      ref={ref}
      size={size}
      alt=""
      initials={letter}
      src={shown ?? undefined}
      aria-hidden
      data-rjb-logo={shown ? 'image' : 'letter'}
      className={className}
    />
  );
}
