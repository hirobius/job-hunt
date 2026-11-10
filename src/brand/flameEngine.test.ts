// The flame is a small fire simulation (Adrian 2026-11-10): a body of heat per colour layer, and
// licks that are each their own particle (position, velocity, size, life), summed into heat and
// cut into shapes. These pin the settings Adrian tuned, that the engine draws sane frames, that
// the licks really move on their own, and that flame.svg (the static mark every icon derives from)
// is the engine's still frame, so the logo and its motion never drift apart.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FLAME, createFire, endlessFrames, flameViewBox, stillFrame } from './flameEngine';

const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
const PATH = /^(M[-\d.,LQ ]+Z)+$/;

describe('the flame settings', () => {
  it('are the ones Adrian copied out of the flame tuner (change them, then run `npm run icons`)', () => {
    expect(JSON.stringify(FLAME)).toBe(
      '{"fps":10,"speed":1,"seed":11,"cx":57.5,"foot":94.5,"layers":[' +
        '{"on":true,"w":29.5,"up":37,"down":28.5,"drop":-11,"share":0.7,"hot":40,"point":0,"sway":9.5,"breathe":0,"pace":0.41,"lickW":1.22},' +
        '{"on":true,"w":22,"up":17,"down":25,"drop":-10,"share":1.11,"hot":20,"point":0.9,"sway":11.5,"breathe":0.02,"pace":0.2,"lickW":0.64},' +
        '{"on":false,"w":11,"up":24,"down":9,"drop":10.5,"share":1.86,"hot":6,"point":0,"sway":4,"breathe":0.08,"pace":0.25,"lickW":0.8}],' +
        '"fuse":0.2,"rate":5.2,"burst":0.6,"emitW":18,"emitY":16,"arc":1.15,"launchUp":[2.2,3.5],"launchOut":2.4,"launchJitter":0.75,' +
        '"size":[14,22],"life":[12,24],"stretch":2.6,"taper":1,"head":0.43,"cool":0.46,"grow":2,"buoyancy":0.81,"drag":0.855,' +
        '"swirl":1.75,"swirlSize":15.5,"swirlSpeed":0.29,"fine":0.91,"wander":0.49,"wanderRate":0.47,"gust":0.12,"pull":0.033,"lift":0.65,' +
        '"cell":2.25,"smooth":0.8,"corner":-0.32,"tOn":"letters","tShake":0,"tSkew":2.5,"tFade":0.05,"tEvery":1}',
    );
  });
});

describe('the engine', () => {
  it('draws closed paths per layer, and the same fire from the same seed', () => {
    const run = (seed: number) => {
      const next = endlessFrames(FLAME, seed);
      return Array.from({ length: 8 }, () => next());
    };
    const a = run(5);
    for (const f of a) {
      expect(f).toHaveLength(3);
      f.forEach((d, k) => {
        if (FLAME.layers[k].on) expect(d).toMatch(PATH);
        else expect(d).toBe('');
      });
    }
    expect(run(5)).toEqual(a);
    expect(run(6)).not.toEqual(a);
  });

  it('the still frame is one fixed frame (the logo never changes by itself)', () => {
    expect(stillFrame()).toEqual(stillFrame());
    expect(stillFrame()[0]).toMatch(PATH);
  });

  it('there is no fixed loop: the engine has no loop to bake or repeat', () => {
    const src = readFileSync('src/brand/flameEngine.ts', 'utf8');
    expect(src).not.toMatch(/export (function|const) (loopFrames|FLAME_FRAMES)/);
    for (const f of ['src/brandHtml.ts', 'src/brand/RoleFlame.tsx', 'src/theme/base.css'])
      expect(readFileSync(f, 'utf8')).not.toMatch(/loopFrames|rjb-boot-frame|rjb-flame-loop/);
  });

  it('a layer that is off draws nothing, and turning it on draws it', () => {
    const on = structuredClone(FLAME);
    on.layers[2].on = true;
    expect(stillFrame(on)[2]).toMatch(PATH);
    expect(stillFrame()[2]).toBe('');
  });

  it('endless never repeats and never draws a NaN', () => {
    const next = endlessFrames(FLAME, 42);
    const frames = Array.from({ length: 40 }, () => next());
    expect(new Set(frames.map((f) => f.join())).size).toBe(40);
    for (const f of frames) for (const d of f) expect(numbers(d).every(Number.isFinite)).toBe(true);
  });

  it('endless stays near the still frame (no runaway growth)', () => {
    const [x, y, w, h] = flameViewBox();
    const next = endlessFrames(FLAME, 7);
    for (let i = 0; i < 200; i++) {
      const n = numbers(next()[0]);
      const xs = n.filter((_, j) => j % 2 === 0);
      const ys = n.filter((_, j) => j % 2 === 1);
      expect(Math.min(...xs)).toBeGreaterThan(x - w);
      expect(Math.max(...xs)).toBeLessThan(x + w * 2);
      expect(Math.min(...ys)).toBeGreaterThan(y - h);
      expect(Math.max(...ys)).toBeLessThan(y + h * 1.2);
    }
  });
});

describe('each lick is alive on its own', () => {
  it('licks are born, rise, and die; no two share a path', () => {
    const fire = createFire(FLAME, 3);
    const seen = new Map<object, { x: number; y: number }[]>();
    for (let i = 0; i < 40; i++) {
      fire.step();
      for (const l of fire.licks) seen.set(l, [...(seen.get(l) ?? []), { x: l.x, y: l.y }]);
    }
    // Many licks lived and died in 40 frames, and many are alive at once.
    expect(seen.size).toBeGreaterThan(fire.licks.length + 50);
    expect(fire.licks.length).toBeGreaterThan(20);
    const tracks = [...seen.values()].filter((t) => t.length >= 8);
    // Every one of them rose (y falls as it climbs).
    for (const t of tracks) expect(t[t.length - 1].y).toBeLessThan(t[0].y);
    // And they did not move as one picture: their sideways travel differs, both ways.
    const dx = tracks.map((t) => t[t.length - 1].x - t[0].x);
    expect(Math.min(...dx)).toBeLessThan(-2);
    expect(Math.max(...dx)).toBeGreaterThan(2);
    expect(new Set(dx.map((v) => v.toFixed(1))).size).toBeGreaterThan(tracks.length / 2);
  });
});

describe('flame.svg is the still frame (else run `npm run icons`)', () => {
  const svg = readFileSync('src/brand/flame.svg', 'utf8');
  const d = (cls: string) => new RegExp(`class="${cls}"[^>]*\\sd="([^"]*)"`).exec(svg)?.[1];

  it('its three layers are the engine’s', () => {
    expect([d('flame-1'), d('flame-2'), d('flame-3')]).toEqual(stillFrame());
  });

  it('its viewBox is the still frame’s box', () => {
    expect(/viewBox="([^"]+)"/.exec(svg)?.[1]).toBe(flameViewBox().join(' '));
  });
});

describe('one engine', () => {
  it('the animated logo draws with this engine, not a copy of it', () => {
    const src = readFileSync('src/brand/RoleFlame.tsx', 'utf8');
    expect(src).toMatch(/from '\.\/flameEngine'/);
    expect(src).not.toMatch(/function (rng|toD|body|drop|contours)\b/);
  });
});
