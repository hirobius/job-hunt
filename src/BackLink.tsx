// The one Back (return paths, Adrian 2026-10-22): "← <the page this was opened from>". It reads the
// origin the route carries (`from`, route.ts) and names it ("← Senior UX Designer", "← Apply mode
// (2 of 3)", "← Companies"); with no origin it is the page's usual Back ("← Pipeline"). It goes back
// with goBackTo: a pop when that page is just behind in history (so the browser's Back doesn't
// bounce), else a replace; the page comes back at the scroll it had.
import { ArrowLeft } from 'lucide-react';
import { Box, Button, Icon } from '@hirobius/design-system';
import type { Route } from './route';
import { backClick, useBack, type Back } from './back';

export default function BackLink({
  fallback,
  fallbackLabel,
  as = 'link',
  className = 'rjb-back-link',
  text,
  ariaLabel,
  sameAs,
}: {
  /** The page's usual Back, used when no origin was recorded. */
  fallback: Route;
  fallbackLabel: string;
  /** A link (it navigates) or, where the page has always had one, a button. */
  as?: 'link' | 'button';
  className?: string;
  /** Visible words instead of the name (`Back to companies`). */
  text?: (back: Back) => string;
  /** The accessible name; `Back to <name>` by default, `null` to let the visible words name it. */
  ariaLabel?: (back: Back) => string | null;
  /** Pages that show the same view as the fallback (see useBack). */
  sameAs?: Route[];
}) {
  const back = useBack(fallback, fallbackLabel, sameAs);
  const words = text ? text(back) : back.label;
  const aria = ariaLabel ? ariaLabel(back) : `Back to ${back.label}`;
  // A recorded origin can be a long job title: it ellipsizes rather than wrap the header.
  const content = back.recorded ? <span className="rjb-back-label">{words}</span> : words;
  if (as === 'button')
    return (
      // No inline-start padding, so the arrow sits on the page gutter like the title (rev-3).
      <Box>
        <Button
          className={className}
          variant="tertiary"
          size="md"
          iconLeft={<Icon icon={ArrowLeft} />}
          aria-label={aria ?? undefined}
          onClick={back.go}
        >
          {content}
        </Button>
      </Box>
    );
  return (
    <Box>
      {/* HDS Button asChild drops iconLeft, so the arrow is the link's own child. */}
      <Button asChild className={className} variant="tertiary" size="md">
        <a href={back.href} aria-label={aria ?? undefined} onClick={backClick(back)}>
          <Icon icon={ArrowLeft} />
          {content}
        </a>
      </Button>
    </Box>
  );
}
