// Copy Deck store — outreach/cover snippets, tagged to pillars, pinnable. Seeds are
// TEMPLATES (labeled "Example —", contact details as placeholders) so a new user's deck
// starts useful but impersonal — issue #14. A small
// external store (mirrors store.ts / pillarStore.ts) so the deck can sync to the cloud
// even when the Copy Deck tab has never been opened. Self-initializes from localStorage
// with the seeded defaults.
import { createStore } from './createStore';
import { mergeByKey } from './mergeByKey';

export interface Snippet {
  id: string;
  label: string;
  body: string;
  open?: boolean;
  pillars?: string[]; // pillar ids this snippet is tagged to; empty/undefined = global
  pinned?: boolean;
}

const KEY = 'rjb_copydeck_v1';

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

const DEFAULTS: Snippet[] = [
  {
    id: 'seed-outreach',
    label: 'Example — quick outreach note',
    body: 'U.S. Air Force veteran in Spokane, WA, available immediately. Current Reserve member holding a DoD Secret clearance (Tier 3, in-scope through 2029, inactive but reactivation-eligible). Six years Air National Guard plus ten-plus years of enterprise experience at Microsoft and T-Mobile. Pursuing CompTIA Security+ and ISC2 Certified in Cybersecurity. Resume attached, happy to talk.\n\n— add your name + phone + email here —',
  },
  {
    id: 'seed-cover',
    label: 'Example — formal cover letter',
    body: "Dear Hiring Team,\n\nI'm writing to express my interest in your open position. I'm a U.S. Air Force veteran based in Spokane, WA and available immediately. I currently serve as a Reserve member and hold a DoD Secret clearance (Tier 3, in-scope through 2029 — inactive but reactivation-eligible). My background includes six years in the Air National Guard and more than ten years of enterprise experience at Microsoft and T-Mobile, and I'm currently pursuing CompTIA Security+ and the ISC2 Certified in Cybersecurity credential.\n\nI'd welcome the chance to discuss how my experience and clearance can contribute to your team. My resume is attached, and I'm happy to talk.\n\nThank you,\n\n— add your name + phone + email here —",
  },
  {
    id: 'seed-culture',
    label: 'Example — culture / company fit',
    body: "I'll be honest about what pulls me toward this role: I really like helping and being the person who gets someone unstuck. After ten-plus years as a designer and documentation specialist, the work I enjoyed most was never the polished final file, it was the teaching and leading and watching something click for a person who'd been frustrated five minutes earlier. That's the part I'd choose every time.\n\nHere's why I think my skillset carries over, beyond the obvious. Spending years explaining design to people who don't think visually builds patience and a kind of translation instinct. You learn to meet someone in their confusion instead of talking past it. A non-designer staring at a blank canvas isn't a problem to me; it's a familiar moment, and I know how to walk them out of it without making them feel behind.\n\nI also just like this kind of work. I'm happiest when heads-down, working through a stream of small puzzles while figuring out what a problem or person actually needs. I strive to find the cleanest path, and explain things so they stick.",
  },
];

const DESIGN_AI: Snippet = {
  id: 'seed-designai',
  pillars: ['design'],
  label: 'Example — design tech / AI outreach',
  body: "I'm a design technologist who ships. 10+ years across product and visual design, design systems, and front-end (React) — and the last couple of years building AI-assisted workflows end to end. Where I'm most useful is the seam between design and engineering: turning rough ideas into working, well-documented prototypes, building and maintaining design systems in code, and wiring LLM features (prompting, tool-use, retrieval) into real product interfaces.\n\nRecent work: rebuilt a React/Vite design system, and designed + shipped an AI-driven application-tracking app (React, MUI, Supabase). I move fast, document clearly, and like owning the messy middle between design and code.\n\nPortfolio + resume attached — happy to talk.\n\n— add your name + portfolio links here —",
};

const CALL_SHEET: Snippet = {
  id: 'seed-callsheet',
  pinned: true,
  label: 'Call sheet — casting, precast & fab shops',
  body: 'HOW TO WORK THIS: call Tue–Thu, 8–10am. Small shops: showing up in person beats calling. Mark each line: [x] reached · [f] follow-up · [n] no. Every call: veteran, reliable, hands-on, will start in entry labor, looking for a shop that trains.\n\nTIER 1 — CALL FIRST (best casting / mold-making fit)\n[ ] Travis Pattern & Foundry — Todd Gee (HR) · 509-466-3545 · hr@travispattern.com\n    Union foundry (USW) · entry labor / molder ~$20–26/hr · they train. Also has a machinist opening (~$29–33/hr).\n[ ] Concrete Works Statuary — ask for Curtiss Grenz · 509-922-6111\n    Hand-cast decorative concrete, ~1,000 molds · THE decorative-casting shop. Ok with seasonal/entry.\n[ ] Hern Iron Works — number via hernironworks.com\n    Cast-iron foundry (gears / grates) · ask about entry casting or labor.\n\nTIER 2 — PRECAST PRODUCTION (they train · ~$18–25/hr)\n[ ] INW Precast — Brock Materne · 509-226-5050 (Newman Lake)\n[ ] CDA Precast — ask for Todd or Craig · 208-762-0235 (CDA / Post Falls)\n[ ] White Block — Bruce Corigliano · 509-534-0651 (Spokane Valley)\n[ ] Spilker Precast — Kevin or Tim Spilker · 509-487-2261\n[ ] voestalpine Nortrak — apply online · Machine Operator I $22.50–24.70/hr + tuition assistance\n[ ] Knife River Prestress · Wilbert Precast · Central Pre-Mix — apply via careers pages\n[ ] Spokane Precast — seasonal (Apr–Oct) · visit in person\n\nTIER 3 — FAB SHOP BLANKET (entry welders in demand)\n[ ] Northwest Steel Fab — 509-276-1592 (Deer Park · known-great for brand-new welders)\n[ ] Hydrafab NW — 509-535-0075 · [ ] SteelFab — 509-747-4139 · [ ] Spokane Metals — 509-244-9476\n[ ] American Metal Fab & Welding — Aaron Meldrum · 509-362-3908\n[ ] Lake City Fence & Fab — Dominic Pesaturo · 208-771-5873 · [ ] Ground Force — 208-664-9291\n[ ] Buck Knives · Hewescraft (careers@hewescraft.com) · Colmac Coil · Rocky Mountain Construction · MetalQuest — apply online\n\nSKILL BUILDER — DO THIS WEEK, mention it on every call\n[ ] Lost & Foundry sand-casting class — $45 · Tue/Sat 10–noon · Donna · 509-487-6832\n    ("I\'m taking a sand-casting class right now" = instant credibility with foundries.)\n\nREMOTE — NO CALLS, apply online (~30 min each, paid programs)\n[ ] Creating Coding Careers (veteran/SkillBridge track) · [ ] OpenClassrooms US · [ ] Flatiron Work-Study · [ ] SkillStorm (vet track) · [ ] Apprenti WA',
};

const CALL_SCRIPT: Snippet = {
  id: 'seed-callscript',
  label: 'Cold-call + voicemail script — shops',
  body: 'LIVE CALL\n"Hi, my name\'s ___. I\'m a U.S. Air Force veteran here in Spokane. I\'m looking for entry-level work in [casting / welding / production] — I\'m new to the trade, but I\'m reliable, I show up, and I\'m looking for a shop that trains. Do you have anything open now, or could I drop off a resume for when something opens up?"\n\nIF NO OPENINGS\n"Understood — if you were me, who else in town would you call?" (Shops know shops. Write down every name they give you and add it to the board.)\n\nVOICEMAIL (keep under 20 seconds)\n"Hi, this is ___, an Air Force veteran here in Spokane looking for entry [foundry / fab / production] work — happy to start in general labor and learn the trade. You can reach me at ___. Thanks."\n\nRULES\n- Call Tue–Thu, 8–10am (owners answer early; Mondays are chaos).\n- For the micro-shops, drive out in person with a one-page resume.\n- Ask for the owner/contact BY NAME where the call sheet lists one.\n- After every call, mark the call-sheet line and set a follow-up date (+5 business days).\n\n— add your name + phone before using —',
};

const STUDY_8020: Snippet = {
  id: 'seed-study8020',
  label: 'Example — study plan (80/20)',
  body: 'North star: the portfolio is the hiring currency. If I do only three things:\n\n1) Write up Apply Board this week (portfolio Piece 1).\n2) Ship one applied-AI product (Piece 3) — LLM + RAG + tool-use + evals; then harden it toward FastAPI + a task queue + AWS + observability.\n3) Pass Azure AI-102 (or AWS AI Practitioner if targeting AWS shops like Klaviyo).\n\nNear-term roles to search now: Design Engineer, Front-End Engineer (React/TS), Applied AI Engineer, AI Product Engineer, Forward-Deployed Engineer.\n\nFull plan (Design Technologist competency map + Klaviyo AI-eng track): see the “Portfolio + Learning Plan” Google Doc in Drive.',
};

function load(): Snippet[] {
  let arr: Snippet[] = DEFAULTS;
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (Array.isArray(r) && r.length) arr = r.map((s: Snippet) => ({ ...s, id: s.id || newId() }));
  } catch {
    /* ignore */
  }
  // One-time: seed the Design/AI outreach snippet for existing decks (respects later deletion).
  try {
    if (!localStorage.getItem('rjb_deck_designai')) {
      if (!arr.some((s) => /design tech|ai engineer|design \/ ai/i.test(s.label || '')))
        arr = [...arr, DESIGN_AI];
      localStorage.setItem('rjb_deck_designai', '1');
    }
  } catch {
    /* ignore */
  }
  // One-time: seed the study-plan 80/20 quick reference.
  try {
    if (!localStorage.getItem('rjb_deck_study8020')) {
      if (!arr.some((s) => /80\/20|study plan/i.test(s.label || ''))) arr = [...arr, STUDY_8020];
      localStorage.setItem('rjb_deck_study8020', '1');
    }
  } catch {
    /* ignore */
  }
  // One-time: seed the trades call sheet + cold-call script (respects later deletion).
  try {
    if (!localStorage.getItem('rjb_deck_callsheet')) {
      if (!arr.some((s) => /call sheet/i.test(s.label || ''))) arr = [...arr, CALL_SHEET];
      if (!arr.some((s) => /cold-call|voicemail/i.test(s.label || ''))) arr = [...arr, CALL_SCRIPT];
      localStorage.setItem('rjb_deck_callsheet', '1');
    }
  } catch {
    /* ignore */
  }
  return arr;
}

const store = createStore<Snippet[]>(load(), {
  onSet: (next) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  },
});
const set = store.set;

// ---- mutators ----
export function addSnippet(tagPillar?: string) {
  set([
    ...store.get(),
    {
      id: newId(),
      label: 'New snippet',
      body: '',
      open: true,
      pillars: tagPillar ? [tagPillar] : [],
    },
  ]);
}
export function updateSnippet(id: string, patch: Partial<Snippet>) {
  set(store.get().map((s) => (s.id === id ? { ...s, ...patch } : s)));
}
export function removeSnippet(id: string) {
  set(store.get().filter((s) => s.id !== id));
}
export function duplicateSnippet(id: string) {
  const snippets = store.get();
  const i = snippets.findIndex((s) => s.id === id);
  if (i < 0) return;
  const clone: Snippet = {
    ...snippets[i],
    id: newId(),
    label: `${snippets[i].label} (copy)`,
    open: true,
    pinned: false,
  };
  const next = [...snippets];
  next.splice(i + 1, 0, clone);
  set(next);
}
export function toggleSnippetPin(id: string) {
  set(store.get().map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)));
}
export function toggleSnippetTag(id: string, pid: string) {
  set(
    store.get().map((s) => {
      if (s.id !== id) return s;
      const tags = new Set(s.pillars ?? []);
      if (tags.has(pid)) tags.delete(pid);
      else tags.add(pid);
      return { ...s, pillars: [...tags] };
    }),
  );
}

// ---- reads + sync ----
export function useSnippets(): Snippet[] {
  return store.use();
}
export function getSnippets(): Snippet[] {
  return store.get();
}
/** Replace the whole deck (cloud sync). Backfills ids defensively. */
export function replaceSnippets(list: Snippet[]) {
  set((Array.isArray(list) ? list : []).map((s) => ({ ...s, id: s.id || newId() })));
}
/** Merge cloud + local snippets by id (local order kept, cloud wins). For the sync layer. */
export const mergeSnippets = (cloud: Snippet[] | null, local: Snippet[]): Snippet[] =>
  mergeByKey((s) => s.id, cloud, local);
