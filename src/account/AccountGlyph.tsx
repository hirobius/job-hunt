import { useId } from 'react';

/**
 * The app bar's Account glyph (filled, Adrian 2026-11-13): a solid content-primary circle with a
 * person (signed out) or your initial (signed in) knocked out of it by an SVG mask, so the hole shows
 * the bar behind it in either theme. Inline (no .svg file: brand/flame.test allows only the flame and
 * the two sign-in marks; plain shapes, no long path), 28px like the ThemeToggle's sun/moon. Decorative: the Button is named "Account".
 */
export function AccountGlyph({ initial }: { initial?: string }) {
  const mask = `rjb-account-mask-${useId().replace(/:/g, '')}`;
  return (
    <svg
      className="rjb-account-glyph"
      data-glyph={initial ? 'initial' : 'person'}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <mask id={mask}>
        <rect width="24" height="24" fill="white" />
        {initial ? (
          <text
            className="rjb-account-initial"
            x="12"
            y="12"
            textAnchor="middle"
            dominantBaseline="central"
            fill="black"
          >
            {initial}
          </text>
        ) : (
          <g fill="black">
            <circle cx="12" cy="9.25" r="3.75" />
            <ellipse cx="12" cy="20.5" rx="6.75" ry="5" />
          </g>
        )}
      </mask>
      <circle cx="12" cy="12" r="12" fill="currentColor" mask={`url(#${mask})`} />
    </svg>
  );
}
