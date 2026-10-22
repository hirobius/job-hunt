// The cobalt flame left of the wordmark (Adrian 2026-10-22). Decorative: the wordmark beside it
// carries the name. Geometry, colours and motion live in flameMark.ts (shared with the icons); this
// renders them and pauses the flicker while the tab is hidden or the mark is scrolled away.
import { useEffect, useId, useRef } from 'react';
import { FLAME, FLAME_NOISE, flameClass, flameCss } from './flameMark';

const CSS = flameCss();

/** `size` is the rendered height in px; the width follows the flame's 4:5 box. */
export function BrandMark({ size = 24 }: { size?: number }) {
  const uid = useId().replace(/:/g, '');
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    let offscreen = false;
    const sync = () => svg.toggleAttribute('data-paused', document.hidden || offscreen);
    document.addEventListener('visibilitychange', sync);
    const io =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver(([entry]) => {
            offscreen = !entry.isIntersecting;
            sync();
          });
    io?.observe(svg);
    sync();
    return () => {
      document.removeEventListener('visibilitychange', sync);
      io?.disconnect();
    };
  }, []);

  const id = (name: string) => `${uid}-${name}`;
  const g = FLAME.glow;
  return (
    <svg
      ref={ref}
      className={flameClass.root}
      viewBox={FLAME.viewBox}
      height={size}
      width={(size * FLAME.width) / FLAME.height}
      aria-hidden="true"
      focusable="false"
    >
      <style>{CSS}</style>
      <defs>
        {FLAME.tongues.map((t, i) => (
          <linearGradient key={i} id={id(`t${i}`)} x1="0" y1="0" x2="0" y2="1">
            {t.stops.map(([offset], s) => (
              <stop key={s} offset={offset} className={flameClass.stop(i, s)} />
            ))}
          </linearGradient>
        ))}
        <radialGradient id={id('glow')}>
          <stop offset="0" className={flameClass.glowStop(0)} />
          <stop offset="1" className={flameClass.glowStop(1)} />
        </radialGradient>
        <filter
          id={id('lick')}
          filterUnits="userSpaceOnUse"
          x={FLAME_NOISE.region.x}
          y={FLAME_NOISE.region.y}
          width={FLAME_NOISE.region.width}
          height={FLAME_NOISE.region.height}
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency={FLAME_NOISE.baseFrequency}
            numOctaves={FLAME_NOISE.numOctaves}
            seed={FLAME_NOISE.seed}
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale={FLAME_NOISE.scale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
      <ellipse
        className={flameClass.glow}
        cx={g.cx}
        cy={g.cy}
        rx={g.rx}
        ry={g.ry}
        fill={`url(#${id('glow')})`}
      />
      {/* The filter sits on this still group, so the noise stays put as the tongues move. */}
      <g filter={`url(#${id('lick')})`}>
        {FLAME.tongues.map((t, i) => (
          <path
            key={i}
            className={flameClass.tongue(i)}
            d={t.frames[0]}
            fill={`url(#${id(`t${i}`)})`}
          />
        ))}
      </g>
      {FLAME.embers.map((e, i) => (
        <circle key={i} className={flameClass.ember(i)} cx={e.cx} cy={e.cy} r={e.r} />
      ))}
    </svg>
  );
}
