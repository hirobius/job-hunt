// Screen fixtures for the Figma sync (figma/README.md). Each entry is one named app state:
// fixed data, a fixed clock and no network. extract.mjs renders each state at 390 and 1440, light
// and dark. A frame in Figma ("roleflame — app states") is `<name> — <theme>` on the page of its
// width. Port of the 2026-11-10 live capture that the Figma frames were checked against.

/** Tuesday, Nov 10, 2026, 17:00 UTC: every date, "10d ago" and token expiry reads from it. */
export const NOW = Date.parse('2026-11-10T17:00:00Z');
export const WIDTHS = {
  390: { height: 844, page: 'Phone 390' },
  1440: { height: 900, page: 'Desktop 1440' },
};
export const THEMES = ['light', 'dark'];

const PROJECT = 'nelrcmbkimjjmfmgnixj';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const EXP = Math.floor(NOW / 1000) + 3600;
const tokenFor = (email, sub = 'x') =>
  `${b64({ alg: 'HS256' })}.${b64({ sub, email, exp: EXP })}.sig`;
const MAGIC = `/#access_token=${tokenFor('someone@example.com')}&refresh_token=r&token_type=bearer&type=magiclink`;
const BOARD_JOB = 'https://boards.greenhouse.io/acme/jobs/77';
const AT = new Date(NOW).toISOString();

const ROLES = [
  'Design Systems Engineer',
  'Design Systems Designer',
  'Design Systems Lead',
  'UX Engineer, Design System',
  'Staff Design Technologist',
  'Design Systems Manager',
];
const COS = ['Orbit', 'Lumen', 'Kite', 'Atlas', 'Juniper', 'Quartz'];
const POSTS = {
  many: Array.from({ length: 12 }, (_, i) => [
    String(i + 1),
    `${COS[i % 6]} | ${ROLES[i % 6]}${i > 5 ? ' II' : ''} | Remote<p>Own our design system, design tokens and Figma library. Work with React and Storybook every day.</p>`,
  ]),
  one: [
    [
      '1',
      'Orbit | Design Systems Engineer | Remote<p>Own our design system and design tokens.</p>',
    ],
  ],
  long: [
    [
      '1',
      'Orbit Interplanetary Logistics and Freight Holdings | Senior Staff Principal Design Systems Engineer, Tokens, Theming and Accessibility Platform (Web, iOS, Android) | Remote<p>Own our design system and design tokens across every platform.</p>',
    ],
    [
      '2',
      'Design Systems Designer | Remote<p>Figma library and design tokens. No company named.</p>',
    ],
    ['3', 'Kite | UX Engineer | Remote<p>Work on our design system.</p>'],
  ],
  none: [],
};

const json = (r, body, status = 200) =>
  r.fulfill({
    status,
    headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** Job sources answer from POSTS[kind]; 'hang' never answers (scan stays running), 'fail' is a 500. */
async function feed(ctx, kind = 'many', mode = 'ok') {
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, async (r) => {
    const url = r.request().url();
    if (url.includes(PROJECT)) return r.fallback();
    if (mode === 'fail') return r.fulfill({ status: 500, body: 'err' });
    if (url.startsWith('https://remotive.com/') || url.startsWith('https://jobicy.com/'))
      return json(r, { jobs: [] });
    if (url.startsWith('https://api.lever.co/')) return json(r, []);
    if (/^https:\/\/(boards-api\.greenhouse\.io|api\.ashbyhq\.com)\//.test(url))
      return json(r, { jobs: [] });
    if (!url.startsWith('https://hn.algolia.com/')) return r.abort();
    if (url.includes('search_by_date'))
      return json(r, {
        hits: [
          {
            objectID: '9',
            title: 'Ask HN: Who is hiring? (November 2026)',
            created_at: '2026-11-01',
          },
        ],
      });
    if (mode === 'hang') return;
    return json(r, {
      hits: POSTS[kind].map(([id, text]) => ({
        objectID: `p-${id}`,
        story_id: 9,
        parent_id: 9,
        created_at: AT,
        comment_text: text,
      })),
    });
  });
}
async function supa(ctx, { refuse = false } = {}) {
  await ctx.route(`https://${PROJECT}.supabase.co/**`, (r) => {
    const url = r.request().url();
    if (url.includes('/auth/v1/otp')) return json(r, {});
    if (url.includes('/auth/v1/user'))
      return refuse
        ? json(r, { message: 'bad jwt' }, 401)
        : json(r, {
            id: '00000000-0000-4000-8000-000000000001',
            aud: 'authenticated',
            email: 'someone@example.com',
          });
    if (url.includes('/rest/v1/sync_log'))
      return json(r, [{ created_at: new Date(NOW - 4 * 60000).toISOString() }]);
    return json(r, []);
  });
}
async function signedIn(ctx) {
  const USER = { id: '00000000-0000-4000-8000-000000000001', email: 'find@example.com' };
  const token = `${b64({ alg: 'HS256' })}.${b64({ sub: USER.id, email: USER.email, exp: EXP })}.sig`;
  const session = JSON.stringify({
    access_token: token,
    refresh_token: 'r',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: EXP,
    user: { ...USER, aud: 'authenticated', role: 'authenticated' },
  });
  await ctx.addInitScript(
    ([k, s]) => {
      if (!localStorage.getItem(k)) localStorage.setItem(k, s);
    },
    [`sb-${PROJECT}-auth-token`, session],
  );
}

const go = async (p, h) => {
  await p.evaluate((x) => (location.hash = x), h);
  await p.waitForTimeout(700);
};
const isPhone = (p) => p.viewportSize().width < 1024;
async function sample(p, B) {
  await p.goto(B + '/#/apply');
  await p.getByRole('button', { name: 'Try with sample data' }).click();
  await p.getByRole('status', { name: 'Sample data' }).waitFor();
  await p.waitForTimeout(800);
}
async function starters(p) {
  await go(p, '#/find?documents=');
  const d = p.getByRole('dialog', { name: 'Documents' });
  await d.getByRole('button', { name: 'Add starter messages' }).click();
  await d.getByRole('region', { name: 'Outreach messages' }).waitFor();
  await d.getByRole('button', { name: 'Close' }).click();
  await d.waitFor({ state: 'hidden' });
}
/** Scan now, then wait for its postings (the clock is fixed, so scan times cannot tell runs apart). */
async function scan(p, B) {
  await p.goto(B + '/#/find');
  await p.getByRole('button', { name: 'Browse', exact: true }).waitFor({ timeout: 15000 });
  await p.getByRole('button', { name: 'Scan now' }).click();
  await p.getByRole('list', { name: 'New postings' }).waitFor({ timeout: 60000 });
  await p.waitForFunction(() => !document.body.innerText.includes('Reading your sources'), null, {
    timeout: 60000,
  });
  await p.waitForTimeout(800);
}
async function openSignIn(p, B) {
  await p.goto(B + '/#/apply');
  await p.getByRole('button', { name: /^Account/ }).click();
  await p.getByRole('menuitem', { name: /^Sign in/ }).click();
  const d = p.getByRole('dialog', { name: 'Sign in' });
  await d.waitFor();
  return d;
}
async function allJobs(p) {
  if (!isPhone(p)) return;
  await p.getByRole('button', { name: 'All jobs' }).click();
  await p.getByRole('dialog', { name: 'All jobs' }).waitFor();
}
async function openJob(p) {
  await go(p, '#/apply');
  let scope;
  if (isPhone(p)) {
    await allJobs(p);
    scope = p.getByRole('dialog', { name: 'All jobs' }).getByRole('region', { name: /^Jobs/ });
  } else scope = p.getByRole('navigation', { name: 'Jobs' });
  await scope.locator('a[href^="#/apply/"]:not([href^="#/apply/company/"])').first().click();
  await p.waitForTimeout(700);
}
async function addOneJob(p, B) {
  await p.goto(B + '/#/apply');
  await p.waitForTimeout(800);
  const add = p.getByRole('dialog', { name: 'Add a job' });
  if (!(await add.isVisible())) await p.getByRole('button', { name: 'Add job' }).first().click();
  await add.getByLabel('Job link').fill(BOARD_JOB);
  await add.getByRole('button', { name: 'Add job' }).click();
  await p.waitForTimeout(1500);
}
/** The "Signed in" screen hands over after SIGNED_IN_HOLD_MS (600 ms): drop that one timer, so it stays. */
async function holdSignedIn(p) {
  await p.addInitScript(() => {
    const st = window.setTimeout;
    window.setTimeout = (fn, ms, ...rest) => (ms === 600 ? 0 : st(fn, ms, ...rest));
  });
}
async function openTemplates(p) {
  const t = p.getByRole('button', { name: /^Templates \(/ });
  if ((await t.getAttribute('aria-expanded')) !== 'true') await t.click();
  await p.waitForTimeout(400);
}

/**
 * The states. `name` is the Figma frame name without the theme. `widths` defaults to both.
 * `autoscan: true` lets the scan that runs on open start (the first run); every other state opens
 * with a scan finished at NOW, so nothing reads sources behind the screen.
 * `gap` marks a frame whose Figma copy holds a local `GAP: …` frame for a missing HDS part:
 * the drift check expects it and does not count it.
 */
export const STATES = [
  {
    name: 'Sign-in / Email',
    run: async (p, B) => {
      await supa(p.context());
      await openSignIn(p, B);
      await p.mouse.click(1, 1).catch(() => {});
    },
  },
  {
    name: 'Sign-in / Keyboard open',
    widths: [390],
    height: 400,
    run: async (p, B) => {
      await openSignIn(p, B);
    },
  },
  {
    name: 'Sign-in / Check email',
    run: async (p, B) => {
      await supa(p.context());
      await openSignIn(p, B);
      await p.getByRole('textbox', { name: 'Email' }).fill('me@example.com');
      await p.getByRole('button', { name: 'Send link' }).click();
      await p.getByRole('heading', { name: 'Check your email' }).waitFor();
    },
  },
  {
    name: 'Sign-in / Confirm link',
    run: async (p, B) => {
      await supa(p.context());
      await p.goto(B + MAGIC);
      await p.getByRole('heading', { name: 'Sign in as someone@example.com?' }).waitFor();
    },
  },
  {
    name: 'Sign-in / Error (refused link)',
    run: async (p, B) => {
      await supa(p.context(), { refuse: true });
      await p.goto(B + MAGIC);
      const a = p.getByRole('dialog', { name: 'Sign in as someone@example.com?' });
      await a.getByRole('button', { name: 'Sign in' }).click();
      await a.getByRole('alert').waitFor();
      await p.waitForFunction(
        () => ![...document.querySelectorAll('[role=dialog] button')].some((b) => b.disabled),
        null,
        { timeout: 10000 },
      );
    },
  },
  {
    name: 'Sign-in / Signed in',
    run: async (p, B) => {
      await holdSignedIn(p);
      await supa(p.context());
      await p.goto(B + MAGIC);
      await p.getByRole('button', { name: 'Sign in' }).click();
      await p.getByRole('heading', { name: 'Signed in' }).waitFor();
    },
  },
  {
    name: 'Find / Signed out / 0 jobs (first run)',
    autoscan: true,
    run: async (p, B) => {
      await feed(p.context(), 'none', 'hang');
      await p.goto(B + '/#/find');
      await p.getByRole('button', { name: 'Browse', exact: true }).waitFor();
    },
  },
  {
    name: 'Find / Loading (scan running)',
    run: async (p, B) => {
      await feed(p.context(), 'many', 'hang');
      await p.goto(B + '/#/find');
      await p.getByRole('button', { name: 'Browse', exact: true }).waitFor();
      await p.getByRole('button', { name: 'Scan now' }).click();
      await p.waitForTimeout(1500);
    },
  },
  {
    name: 'Find / Browse / many jobs',
    run: async (p, B) => {
      await feed(p.context(), 'many');
      await scan(p, B);
    },
  },
  {
    name: 'Find / Browse / long title + no company',
    run: async (p, B) => {
      await feed(p.context(), 'long');
      await scan(p, B);
    },
  },
  {
    name: 'Find / Deck',
    run: async (p, B) => {
      await feed(p.context(), 'many');
      await scan(p, B);
      const deck = p.getByRole('button', { name: 'Deck', exact: true });
      await deck.click();
      await p.waitForFunction(
        (el) => el.getAttribute('aria-pressed') === 'true',
        await deck.elementHandle(),
        { timeout: 10000 },
      );
    },
  },
  {
    name: 'Find / Card description open',
    run: async (p, B) => {
      await feed(p.context(), 'many');
      await scan(p, B);
      const list = p.getByRole('list', { name: 'New postings' });
      if (isPhone(p)) await list.getByRole('button', { name: 'Show description' }).first().click();
      else
        await list
          .getByRole('link', { name: 'Design Systems Designer', exact: true })
          .first()
          .click();
      await p.waitForTimeout(700);
    },
  },
  {
    name: 'Find / More menu open',
    run: async (p, B) => {
      await feed(p.context(), 'many');
      await scan(p, B);
      await p
        .getByRole('list', { name: 'New postings' })
        .getByRole('button', { name: /^More/ })
        .first()
        .click();
      await p.waitForTimeout(600);
    },
  },
  {
    name: 'Find / New companies / List',
    run: async (p, B) => {
      await feed(p.context(), 'many');
      await scan(p, B);
      await p.evaluate((now) => {
        const s = JSON.parse(localStorage.getItem('rjb_autoscan'));
        s.found = [
          {
            key: 'acme',
            name: 'Acme Metals',
            boardUrl: 'https://boards.greenhouse.io/acmemetals',
            website: 'https://acmemetals.example.com',
            about: 'Steel for spacecraft, sold by subscription.',
            via: 'yc',
            confirmed: true,
            status: 'new',
            jobs: 2,
            at: now,
          },
          {
            key: 'zephyr',
            name: 'Zephyr Labs',
            boardUrl: 'https://jobs.lever.co/zephyr',
            via: 'yc',
            confirmed: false,
            status: 'new',
            jobs: 1,
            at: now,
          },
          {
            key: 'quiet',
            name: 'Quiet Co',
            boardUrl: 'https://jobs.ashbyhq.com/quiet',
            via: 'yc',
            confirmed: true,
            status: 'new',
            jobs: 0,
            at: now,
          },
        ];
        localStorage.setItem('rjb_autoscan', JSON.stringify(s));
      }, NOW);
      await p.reload();
      await p.getByRole('region', { name: 'New companies' }).waitFor();
    },
  },
  {
    name: 'Apply / 0 jobs (empty)',
    run: async (p, B) => {
      await feed(p.context(), 'none');
      await p.goto(B + '/#/apply');
      await p.getByRole('button', { name: 'Try with sample data' }).waitFor();
    },
  },
  {
    name: 'Apply / 1 job',
    run: async (p, B) => {
      await feed(p.context(), 'none');
      await addOneJob(p, B);
    },
  },
  {
    name: 'Apply / Many jobs (sample, pager)',
    run: async (p, B) => {
      await feed(p.context(), 'none');
      await sample(p, B);
      await go(p, '#/apply');
    },
  },
  {
    name: 'Apply / All jobs sheet',
    widths: [390],
    run: async (p, B) => {
      await feed(p.context(), 'none');
      await sample(p, B);
      await go(p, '#/apply');
      await allJobs(p);
    },
  },
  {
    name: 'Apply / Filters open',
    widths: [390],
    run: async (p, B) => {
      await feed(p.context(), 'none');
      await sample(p, B);
      await go(p, '#/apply');
      await p.getByRole('button', { name: 'Filters' }).click();
      await p.waitForTimeout(500);
    },
  },
  {
    name: 'Apply / Templates open',
    run: async (p, B) => {
      await feed(p.context(), 'none');
      await sample(p, B);
      await starters(p);
      await go(p, '#/apply');
      await openTemplates(p);
    },
  },
  {
    name: 'Apply / Template dialog',
    run: async (p, B) => {
      await feed(p.context(), 'none');
      await sample(p, B);
      await starters(p);
      await go(p, '#/apply');
      await openTemplates(p);
      await p.getByRole('region', { name: 'Templates' }).getByRole('button').nth(1).click();
      await p.getByRole('dialog').last().waitFor();
      await p.waitForTimeout(500);
    },
  },
  {
    name: 'Job / Job page / Default',
    run: async (p, B) => {
      await feed(p.context(), 'none');
      await sample(p, B);
      await openJob(p);
    },
  },
  {
    name: 'Job / Company page / Larkspur Analytics',
    run: async (p, B) => {
      await feed(p.context(), 'none');
      await sample(p, B);
      await go(p, '#/apply/company/larkspur-analytics');
    },
  },
  {
    name: 'Job / Not found / Unknown route',
    gap: ['hds#1425: SegmentedControl has no "none selected" state'],
    run: async (p, B) => {
      await p.goto(B + '/#/nope');
      await p.waitForTimeout(800);
    },
  },
  {
    name: 'Dialogs / Documents / Empty',
    run: async (p, B) => {
      await feed(p.context(), 'none');
      await p.goto(B + '/#/find?documents=');
      await p.getByRole('dialog', { name: 'Documents' }).waitFor();
    },
  },
  {
    name: 'Dialogs / Documents / With starters',
    run: async (p, B) => {
      await feed(p.context(), 'none');
      await sample(p, B);
      await starters(p);
      await go(p, '#/find?documents=');
    },
  },
  {
    name: 'Dialogs / Documents / Template open',
    gap: ['hds#1426: no template editor with inline variable chips'],
    run: async (p, B) => {
      await feed(p.context(), 'none');
      await sample(p, B);
      await starters(p);
      await go(p, '#/find?documents=tpl-outreach');
    },
  },
  {
    name: 'Dialogs / Legal / Privacy',
    run: async (p, B) => {
      await p.goto(B + '/#/find?legal=privacy');
      await p.waitForTimeout(900);
    },
  },
  {
    name: 'Dialogs / Add job',
    run: async (p, B) => {
      await feed(p.context(), 'none');
      await sample(p, B);
      await p.getByRole('button', { name: 'Add job' }).first().click();
      await p.getByRole('dialog', { name: 'Add a job' }).waitFor();
    },
  },
  {
    name: 'Menus / Account menu / Signed out',
    run: async (p, B) => {
      await p.goto(B + '/#/find');
      await p.waitForTimeout(800);
      await p.getByRole('button', { name: /^Account/ }).click();
      await p.waitForTimeout(500);
    },
  },
  {
    name: 'Menus / Account menu / Signed in',
    run: async (p, B) => {
      await signedIn(p.context());
      await supa(p.context());
      await feed(p.context(), 'none');
      await p.goto(B + '/#/find');
      await p.waitForTimeout(2500);
      await p.getByRole('button', { name: /^Account/ }).click();
      await p.waitForTimeout(500);
    },
  },
  {
    name: 'Menus / Scan details / After scan',
    run: async (p, B) => {
      await feed(p.context(), 'many');
      await scan(p, B);
      await p.getByRole('button', { name: /^Account/ }).click();
      await p.getByRole('menuitem', { name: 'Scan details' }).click();
      await p.getByRole('dialog', { name: 'Scan details' }).waitFor();
      await p.waitForTimeout(400);
    },
  },
  {
    name: 'Feedback / Toast / Skip with Undo',
    run: async (p, B) => {
      await feed(p.context(), 'many');
      await scan(p, B);
      await p
        .getByRole('list', { name: 'New postings' })
        .getByRole('button', { name: /^Skip / })
        .first()
        .click();
      await p.waitForTimeout(700);
    },
  },
  {
    name: 'Feedback / Merge prompt / Device data on sign-in',
    run: async (p, B) => {
      await supa(p.context());
      await feed(p.context(), 'none');
      await addOneJob(p, B);
      await p.goto('about:blank');
      await p.goto(B + MAGIC);
      await p.getByRole('button', { name: 'Sign in' }).click();
      await p.getByRole('alertdialog').waitFor({ timeout: 10000 });
      await p.waitForTimeout(500);
    },
  },
];

/** Every frame: one per state, width and theme (130). */
export function frames() {
  const out = [];
  for (const s of STATES)
    for (const width of s.widths ?? [390, 1440])
      for (const theme of THEMES)
        out.push({
          key: `${width}/${s.name} — ${theme}`,
          name: `${s.name} — ${theme}`,
          page: WIDTHS[width].page,
          width,
          height: s.height ?? WIDTHS[width].height,
          theme,
          state: s,
        });
  return out;
}
