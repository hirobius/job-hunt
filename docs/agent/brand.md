# Brand, logo and wordmark

The product name, the flame logo, its motion, the boot splash and the sign-in screen brand.

## What this is

**roleflame**, all lowercase since 2026-11-08 (renamed Roleflame 2026-11-02, Adrian, hirobius/ops#1092 / #55; before that **hiraga**, lowercase, 2026-10-30, Adrian: hire + Firaga, and _hi_ 火 is Japanese for fire; formerly Stoke, RoleForge, Apply Board) — a job-application tracker + discovery board, live at
**https://roleflame.vercel.app** (since 2026-11-05; repo `hirobius/job-hunt`; the old
`roleforge-app.vercel.app` and `job-hunt-jade.vercel.app` still serve and are accepted sign-in origins until they redirect). Rebuilt from a
single static `index.html` into a React app (the old file is in git history at
commit `f15fd52`).

**Product name = `src/brand.ts` only (#55).** Header wordmark, `<title>`/meta (index.html
`%BRAND_*%` placeholders via the `brand-html` Vite plugin), toasts and download filenames read it;
`src/brand.test.ts` fails on a hard-coded name. Stored identifiers stay fixed on purpose: the backup
format id `app: 'apply-board'` and calendar UIDs `@apply-board`.

**Flame logo: one source, `src/brand/flame.svg`; one engine, a small fire simulation (Adrian 2026-11-10; it replaced Version E).**
`src/brand/flameEngine.ts`: three colour layers, each its own heat field (a body ellipse with width, height up / down,
drop, pointed top, sway, pulse; a share of the licks' heat); **licks are particles** (position, velocity, size, life:
buoyancy, swirling air, wander, drag, cooling), each drawn as a tongue along its own velocity; heat is summed on a grid
and cut at 1 (marching squares, curves with sharp corners). Layers stack, none is clipped; a layer can be off (the core
is). `FLAME` = the settings Adrian copied out of the **flame tuner** (a private artifact page of sliders; tune only
there, then `npm run icons`). `RoleFlame.tsx` draws with the same engine (`flameEngine.test.ts` fails on a copy). About
4 ms a frame in Node at 10 fps.
**The still mark is hand-drawn (Adrian 2026-11-14): `src/brand/flame.svg` is R5, the asymmetric
two-tongue flame (HDS blue-500 outer, cobalt-400 core, an empty `flame-3`), picked from the flame contact sheet; it
is no longer the engine's frame.** It sits in the engine's coordinates (centred on `FLAME.cx`, its foot on the
still fire's foot, the same height), so the live fire takes over in the same box. `npm run icons` reads it (it no
longer writes it) for favicon.svg, the PNG icons, favicon.ico and the og-image. `flameEngine.test.ts` pins it as the
hand-drawn mark (two layers and an empty core, not the engine's frame, its viewBox holds every point, it stands on
the engine's foot and centre line); `flame.test.tsx` keeps the HDS fills, no copy elsewhere and a fresh favicon.
The engine stays for the live logo; `stillFrame()` / `STILL_SEED` are only the tuner's still for custom settings;
`RoleFlame`'s still (reduced motion, Pause animations) is `flameSvg.ts` `STILL_MARK`, and the boot splash
(`brandHtml.ts`) is flame.svg's paths and viewBox. Everything static derives
from flame.svg: the wordmark in the header and on sign-in (`src/brand/Flame.tsx` inlines it, ids made
unique per instance) and the icons. `src/brand/flame.test.tsx` fails on any other `.svg`, any copy of its
path data, a stale `public/favicon.svg`, or non-HDS fills.
**Motion:** `flameMotion.ts` `animateFlame(svg, letters)` rewrites the three paths' `d` every 1/fps (the
box never changes) and can shimmer the wordmark letters (`FLAME.tOn`; off, Adrian 2026-11-10: it bent the f and l, so the letters stand still);
the header/sign-in `Wordmark` and `Flame` reach it only through `startFlame.ts` (a lazy chunk, `entryChunk.test.ts`: the
entry is under its 255 kB budget (252.6 kB); the still mark shows until it lands);
it animates continuously (Adrian 2026-10-30: never settles);
still under prefers-reduced-motion (also when turned on mid-run), paused while the tab is hidden, off
where matchMedia is missing (jsdom). The header/sign-in `Wordmark` and `BootHold` (`<Flame animate />`)
animate. **Boot splash: the live fire, no fixed loop (Adrian 2026-11-10).** `%BRAND_FLAME%` in index.html's `#root` is
the still mark (`brandHtml.ts`); `src/brand/bootFlame.ts`, its own small chunk put in the head ahead of the entry by the
`boot-flame` plugin in vite.config.ts (it shares the engine's chunk with the lazy logo, and is not part of the entry's
budget), runs the simulation on those paths until React replaces the splash; reduced motion / no script shows the still
mark. No flame anywhere repeats: `loopFrames`, the baked frames and the `rjb-boot-frame` CSS are gone
(`flameEngine.test.ts` fails if a loop comes back). The splash still fades in after a short beat.
**Wordmark: the flame, then the name, "Roleflame" (Adrian 2026-10-30, name 2026-11-02; was St(flame)ke):** `src/brand/Wordmark.tsx` (header, an `role="img"` named by BRAND, never a heading, #363, inside the home link to Review, #620;
sign-in) and the og-image share one markup builder, `wordmarkMarkup.ts` (`BRAND.wordmark = { flame: 'before' }`):
`.rjb-wordmark-flame` then `.rjb-wordmark-text` (`{ letters: true }` in the app wraps each letter in
`.rjb-wordmark-l` for the flicker; the og-image keeps a plain run). `wordmark.css` sets them on one baseline, the
flame `1.35cap` tall with its extra height taken back by a negative top margin, so the line is plain text's height
and the name's run is plain text's width (`e2e/brand.spec.ts` checks within 1px while the letters flicker); named
by `aria-label`, its parts aria-hidden. **BootHold:** App's main, only while a signed-in device with no data waits for its cloud
copy, max 4 s.
**Animated logo (Adrian 2026-11-06): `src/brand/RoleFlame.tsx`** (flameEngine's flame + the flickering name, kept as
code, never an SVG/image) is the **app bar** (`BrandLogo` → `LazyRoleFlameLogo`, fontSize 19; a lazy chunk behind the still
`Wordmark still`, so the entry stays under budget) and the **sign-in screen** (`layout="stacked"`, centred; two sizes, 40px with the keyboard closed and 20px open
(`data-keyboard`, visible height < 80% of innerHeight), one eased transform transition started only on a state change; the panel is fixed, inset 0 and opaque, and only its inner box follows the visual viewport, 2026-11-09 #523; **mass-centred, #556:** the stacked flame moves right by `STACKED_FLAME_NUDGE_EM`, the name's ink offset (`NAME_INK_OFFSET_EM`, measured again in `e2e/brand.spec.ts`) less the flame's mean mass offset (`FLAME_MASS`, measured again over 300 frames in `flameEngine.test.ts`, which fails on a tuning that moves it); the app bar row drops by `INLINE_FLAME_NUDGE_EM` (0.123em, #639; was 0.152em on the x-height centre, which read low, Adrian 2026-11-13) so the flame's mass sits on the word's optical centre, the ink centroid of "roleflame" in Sora 800 (`WORD_INK_CENTRE_EM` 0.031em: the x-height band, the f and l ascenders counting by their area; `X_HEIGHT_CENTRE_EM` 0.06 stays as the lower bound; both measured again in `e2e/brand.spec.ts`), within 0.5px at 19px (`flameEngine.test.ts`); both are transforms, so no box moves). **Sign-in copy (redesign §5.8, #555):** under the wordmark, the benefit: "Sign in to sync your jobs across devices." (body, primary) (one line with the Account menu's label, `SIGN_IN_BENEFIT`, Adrian 2026-11-15), which describes the form step; "We email you a sign-in link. No password needed." is the Email field's HDS `helperText` (caption, secondary, its description; Adrian 2026-11-12) (`account/signInCopy.ts`); Continue with Google / LinkedIn are HDS secondary `shadow="none"` (HDS 0.41 names it `shadow`, not `depth`) so Send link leads; the Account menu's signed-out group is shorter (Adrian's phone test, 2026-11-12): the label "On this device only. Sign in to sync your jobs across devices." then the grey key "Sign in" (`SIGN_IN_LABEL`, `SIGN_IN_ITEM`); the top right control is Pause animations with its icon; Continue without an account stays the underlined exit. **One legal line at the foot** (Adrian 2026-11-13, after Tailscale's login page): "By signing in, you agree to <BRAND>’s Terms of use and Privacy policy.", a caption whose two HDS InlineLinks are the page's hash with `?legal=terms|privacy` (`route.legalHash`), so Privacy and terms opens on its tab over the screen and Escape / Back return to it; the screen's only legal links (`SIGN_IN_AGREE`, pinned in `SignInDialog.test.tsx`, `e2e/sign-in.spec.ts`). Colours are HDS primitives on `.rjb-rf` in base.css (light/dark), the name is
`BRAND.name` in **Sora 800** (Adrian 2026-11-10; `src/brand/fonts/sora-800.woff2` + its OFL licence, the logo's one font of its own: the HDS variable Sora covers 400–700 and the logo keeps its own Sora 800; `roleFlameType.test.ts`), its dynamic styles come from helpers (no
inline-style literals); reduced motion at load shows the still frame, and **Pause animations (or reduced motion turned on) mid-run freezes it on the frame on screen**, Play going on from there (Adrian 2026-11-13; `useFlame` in `RoleFlame.tsx`). It pauses while the tab is hidden and **never stops on its own**, app bar and sign-in alike (Adrian 2026-11-09: the 5 s
limit is gone), still under reduced motion and under the Account menu's **Pause animations** toggle (WCAG 2.2.2;
`src/motionPref.ts`, `rjb_ui_pause_motion` per device, default = reduced motion; `roleFlameMotion.test.tsx`). The boot splash, icons, og-image and BootHold still use
flame.svg / flameEngine. Pinned in `shell.test.tsx`, `SignInDialog.test.tsx`, `e2e/brand.spec.ts`.
