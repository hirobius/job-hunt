import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  InputBase,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useActivePillar, usePillars } from './pillarStore';

interface Snippet {
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
    pillars: ['it'],
    label: 'Quick outreach note',
    body: 'U.S. Air Force veteran in Spokane, WA, available immediately. Current Reserve member holding a DoD Secret clearance (Tier 3, in-scope through 2029, inactive but reactivation-eligible). Six years Air National Guard plus ten-plus years of enterprise experience at Microsoft and T-Mobile. Pursuing CompTIA Security+ and ISC2 Certified in Cybersecurity. Resume attached, happy to talk.\n\n— add your name + phone + email here —',
  },
  {
    id: 'seed-cover',
    pillars: ['it'],
    label: 'Formal cover letter',
    body: "Dear Hiring Team,\n\nI'm writing to express my interest in your open position. I'm a U.S. Air Force veteran based in Spokane, WA and available immediately. I currently serve as a Reserve member and hold a DoD Secret clearance (Tier 3, in-scope through 2029 — inactive but reactivation-eligible). My background includes six years in the Air National Guard and more than ten years of enterprise experience at Microsoft and T-Mobile, and I'm currently pursuing CompTIA Security+ and the ISC2 Certified in Cybersecurity credential.\n\nI'd welcome the chance to discuss how my experience and clearance can contribute to your team. My resume is attached, and I'm happy to talk.\n\nThank you,\n\n— add your name + phone + email here —",
  },
  {
    id: 'seed-culture',
    label: 'Culture / company fit',
    body: "I'll be honest about what pulls me toward this role: I really like helping and being the person who gets someone unstuck. After ten-plus years as a designer and documentation specialist, the work I enjoyed most was never the polished final file, it was the teaching and leading and watching something click for a person who'd been frustrated five minutes earlier. That's the part I'd choose every time.\n\nHere's why I think my skillset carries over, beyond the obvious. Spending years explaining design to people who don't think visually builds patience and a kind of translation instinct. You learn to meet someone in their confusion instead of talking past it. A non-designer staring at a blank canvas isn't a problem to me; it's a familiar moment, and I know how to walk them out of it without making them feel behind.\n\nI also just like this kind of work. I'm happiest when heads-down, working through a stream of small puzzles while figuring out what a problem or person actually needs. I strive to find the cleanest path, and explain things so they stick.",
  },
];

const DESIGN_AI: Snippet = {
  id: 'seed-designai',
  pillars: ['design'],
  label: 'Design Tech / AI — outreach',
  body: "I'm a design technologist who ships. 10+ years across product and visual design, design systems, and front-end (React) — and the last couple of years building AI-assisted workflows end to end. Where I'm most useful is the seam between design and engineering: turning rough ideas into working, well-documented prototypes, building and maintaining design systems in code, and wiring LLM features (prompting, tool-use, retrieval) into real product interfaces.\n\nRecent work: rebuilt a React/Vite design system, and designed + shipped an AI-driven application-tracking app (React, MUI, Supabase). I move fast, document clearly, and like owning the messy middle between design and code.\n\nPortfolio + resume attached — happy to talk.\n\n— add your name + portfolio links here —",
};

const STUDY_8020: Snippet = {
  id: 'seed-study8020',
  label: 'Study plan — 80/20',
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
  return arr;
}

export default function CopyDeckView() {
  const [items, setItems] = useState<Snippet[]>(load);
  const [copied, setCopied] = useState<string | null>(null);
  const [scope, setScope] = useState<'pillar' | 'all'>('pillar');
  const pillar = useActivePillar();
  const pillars = usePillars();

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items]);

  const patch = (id: string, p: Partial<Snippet>) =>
    setItems((prev) => prev.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const addSnippet = () =>
    setItems((prev) => [
      ...prev,
      { id: newId(), label: 'New snippet', body: '', open: true, pillars: [pillar.id] },
    ]);
  const del = (id: string) => {
    const s = items.find((x) => x.id === id);
    if (window.confirm(`Delete “${s?.label || 'this snippet'}”? This can't be undone.`))
      setItems((prev) => prev.filter((x) => x.id !== id));
  };
  const duplicate = (id: string) =>
    setItems((prev) => {
      const i = prev.findIndex((x) => x.id === id);
      if (i < 0) return prev;
      const clone: Snippet = {
        ...prev[i],
        id: newId(),
        label: `${prev[i].label} (copy)`,
        open: true,
        pinned: false,
      };
      const next = [...prev];
      next.splice(i + 1, 0, clone);
      return next;
    });
  const togglePin = (id: string) =>
    setItems((prev) => prev.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)));
  const toggleTag = (id: string, pid: string) =>
    setItems((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const tags = new Set(s.pillars ?? []);
        if (tags.has(pid)) tags.delete(pid);
        else tags.add(pid);
        return { ...s, pillars: [...tags] };
      }),
    );
  const copy = (id: string) => {
    const s = items.find((x) => x.id === id);
    if (!s) return;
    const done = () => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    };
    if (navigator.clipboard?.writeText)
      navigator.clipboard.writeText(s.body).then(done, () => patch(id, { open: true }));
    else patch(id, { open: true });
  };

  const isGlobal = (s: Snippet) => !s.pillars || s.pillars.length === 0;
  const visible = items
    .filter((s) => scope === 'all' || isGlobal(s) || s.pillars!.includes(pillar.id))
    .sort((a, b) => (a.pinned ? 0 : 1) - (b.pinned ? 0 : 1));

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button variant="outlined" onClick={addSnippet}>
          New snippet
        </Button>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={scope}
          onChange={(_, v) => v && setScope(v)}
          sx={{ ml: 'auto' }}
        >
          <ToggleButton value="pillar">{pillar.label}</ToggleButton>
          <ToggleButton value="all">All</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {visible.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4 }}>
          No snippets tagged for “{pillar.label}”. Add one, or switch to All.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {visible.map((s) => (
            <Card key={s.id} variant="outlined">
              <CardContent>
                <InputBase
                  value={s.label}
                  placeholder="Label"
                  onChange={(e) => patch(s.id, { label: e.target.value })}
                  sx={{
                    width: '100%',
                    fontFamily: '"Clash Display", sans-serif',
                    fontWeight: 600,
                    fontSize: '1.1rem',
                    mb: 0.5,
                  }}
                />
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                  {pillars.map((p) => {
                    const on = (s.pillars ?? []).includes(p.id);
                    return (
                      <Chip
                        key={p.id}
                        label={p.label}
                        size="small"
                        color={on ? 'primary' : 'default'}
                        variant={on ? 'filled' : 'outlined'}
                        onClick={() => toggleTag(s.id, p.id)}
                      />
                    );
                  })}
                  {isGlobal(s) && <Chip label="Global" size="small" variant="outlined" />}
                </Box>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                  <Button size="small" onClick={() => patch(s.id, { open: !s.open })}>
                    {s.open ? 'Hide' : 'Show'}
                  </Button>
                  <Button size="small" color="success" onClick={() => copy(s.id)}>
                    {copied === s.id ? 'Copied' : 'Copy'}
                  </Button>
                  <Button size="small" onClick={() => togglePin(s.id)}>
                    {s.pinned ? 'Pinned ★' : 'Pin'}
                  </Button>
                  <Button size="small" onClick={() => duplicate(s.id)}>
                    Duplicate
                  </Button>
                  <Button size="small" color="error" onClick={() => del(s.id)}>
                    Delete
                  </Button>
                </Stack>
                <Collapse in={!!s.open}>
                  <TextField
                    fullWidth
                    multiline
                    minRows={4}
                    value={s.body}
                    placeholder="Paste or write your snippet…"
                    onChange={(e) => patch(s.id, { body: e.target.value })}
                    sx={{ mt: 1 }}
                  />
                </Collapse>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </Box>
  );
}
