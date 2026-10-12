// Sample pipeline for "Try with sample data" (#107) — what a portfolio visitor sees when they
// click through an empty Tracker. Pure and DOM-free: `now` is injected, every date is relative
// to it (so follow-ups are always due and interviews always upcoming), and every company and
// URL is fictional on a reserved domain (RFC 2606 example.com), so nothing names a real employer.
// Each record carries `demo: true`; that tag is the ONLY thing clearSample() uses to tell sample
// records from the user's own (src/demo/loadSample.ts).
import type { Job, Status } from '../types';

// `history` / `events` mirror the shape jh-tracker-pro adds to Job (StatusChange / JobEvent, on
// its branch, not yet main). Structural copies keep this compiling today; once that lands these
// become plain Job fields and the local types can go (follow-up noted in #107).
export interface SampleStatusChange {
  status: Status;
  at: string; // YYYY-MM-DD
}
export interface SampleEvent {
  id: string;
  kind: 'interview' | 'call' | 'other';
  date: string; // YYYY-MM-DD (local)
  time?: string; // HH:MM (local)
  durationMin?: number;
  note?: string;
}
export type SampleJob = Job & {
  demo: true;
  history?: SampleStatusChange[];
  events?: SampleEvent[];
};

/** True only for records the sample loader created (`demo === true`, nothing looser). */
export function isSample(job: Job): boolean {
  return (job as { demo?: unknown }).demo === true;
}

/** Local-time YYYY-MM-DD, `offset` days from `now` (negative = past). */
function day(now: Date, offset: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const NOTE = 'Sample data — a fictional company, for trying the app out.';

/** The fictional pipeline: every status, two follow-ups due, two interviews coming up. */
export function sampleJobs(now: Date = new Date()): SampleJob[] {
  const d = (offset: number) => day(now, offset);
  const job = (j: Omit<SampleJob, 'demo' | 'note'> & { note?: string }): SampleJob => ({
    ...j,
    note: j.note ?? NOTE,
    demo: true,
  });
  return [
    job({
      url: 'https://larkspur.example.com/careers/senior-product-designer',
      label: 'Senior Product Designer',
      company: 'Larkspur Analytics',
      location: 'Remote (US)',
      status: 'Saved',
      verdict: 'match',
      mode: 'remote',
      salary: '$140k–$165k',
      history: [{ status: 'Saved', at: d(-1) }],
    }),
    job({
      url: 'https://quillfeather.example.com/jobs/implementation-consultant',
      label: 'Implementation Consultant',
      company: 'Quillfeather Labs',
      location: 'Denver, CO',
      status: 'Saved',
      verdict: 'stretch',
      mode: 'hybrid',
      blockers: ['travel'],
      travelPct: 40,
      history: [{ status: 'Saved', at: d(-2) }],
    }),
    job({
      url: 'https://tidewater.example.com/careers/solutions-engineer',
      label: 'Solutions Engineer',
      company: 'Tidewater Robotics',
      location: 'Austin, TX',
      status: 'Saved',
      priority: true,
      verdict: 'match',
      mode: 'onsite',
      angle: 'Lead with the integrations work — it maps straight onto their field deployments.',
      history: [{ status: 'Saved', at: d(-4) }],
    }),
    job({
      url: 'https://brambleandfinch.example.com/jobs/ux-researcher',
      label: 'UX Researcher',
      company: 'Bramble & Finch',
      location: 'Remote',
      status: 'Applied',
      applied: d(-12),
      priority: true, // pinned so the due follow-up shows in the default Active view
      verdict: 'stretch',
      mode: 'remote',
      applicants: 310,
      history: [
        { status: 'Saved', at: d(-14) },
        { status: 'Applied', at: d(-12) },
      ],
    }),
    job({
      url: 'https://copperline.example.com/careers/design-systems-lead',
      label: 'Design Systems Lead',
      company: 'Copperline Systems',
      location: 'Portland, OR',
      status: 'Applied',
      applied: d(-10),
      priority: true, // pinned so the due follow-up shows in the default Active view
      verdict: 'match',
      mode: 'hybrid',
      applicants: 85,
      contact: 'Recruiter: Sam Rivera (fictional)',
      history: [
        { status: 'Saved', at: d(-11) },
        { status: 'Applied', at: d(-10) },
      ],
    }),
    job({
      url: 'https://saltmarsh.example.com/jobs/product-operations-manager',
      label: 'Product Operations Manager',
      company: 'Saltmarsh Software',
      location: 'Chicago, IL',
      status: 'Applied',
      applied: d(-3),
      verdict: 'reach',
      mode: 'onsite',
      applicants: 40,
      history: [
        { status: 'Saved', at: d(-5) },
        { status: 'Applied', at: d(-3) },
      ],
    }),
    job({
      url: 'https://meridianoak.example.com/careers/clinical-systems-analyst',
      label: 'Clinical Systems Analyst',
      company: 'Meridian Oak Health',
      location: 'Remote (US)',
      status: 'Interviewing',
      priority: true,
      applied: d(-18),
      followUp: d(-2),
      verdict: 'match',
      mode: 'remote',
      history: [
        { status: 'Saved', at: d(-20) },
        { status: 'Applied', at: d(-18) },
        { status: 'Interviewing', at: d(-6) },
      ],
      events: [
        {
          id: 'demo-ev-1',
          kind: 'call',
          date: d(-6),
          time: '11:00',
          durationMin: 30,
          note: 'Recruiter screen',
        },
        {
          id: 'demo-ev-2',
          kind: 'interview',
          date: d(2),
          time: '14:00',
          durationMin: 60,
          note: 'Hiring manager',
        },
      ],
    }),
    job({
      url: 'https://juniperhollow.example.com/jobs/senior-ux-designer',
      label: 'Senior UX Designer',
      company: 'Juniper Hollow Co.',
      location: 'Seattle, WA',
      status: 'Interviewing',
      priority: true,
      applied: d(-21),
      followUp: d(-1),
      verdict: 'stretch',
      mode: 'hybrid',
      history: [
        { status: 'Saved', at: d(-23) },
        { status: 'Applied', at: d(-21) },
        { status: 'Interviewing', at: d(-9) },
      ],
      events: [
        {
          id: 'demo-ev-3',
          kind: 'interview',
          date: d(-3),
          time: '10:00',
          durationMin: 45,
          note: 'Portfolio review',
        },
        {
          id: 'demo-ev-4',
          kind: 'interview',
          date: d(5),
          time: '13:30',
          durationMin: 120,
          note: 'Final loop (onsite)',
        },
      ],
    }),
    job({
      url: 'https://ashgrove.example.com/careers/product-designer',
      label: 'Product Designer',
      company: 'Ashgrove Logistics',
      location: 'Remote',
      status: 'Offer',
      applied: d(-30),
      verdict: 'match',
      mode: 'remote',
      salary: '$128k + equity',
      history: [
        { status: 'Saved', at: d(-32) },
        { status: 'Applied', at: d(-30) },
        { status: 'Interviewing', at: d(-20) },
        { status: 'Offer', at: d(-2) },
      ],
    }),
    job({
      url: 'https://kestrelworks.example.com/jobs/interaction-designer',
      label: 'Interaction Designer',
      company: 'Kestrel Works',
      location: 'Boston, MA',
      status: 'Rejected',
      applied: d(-25),
      verdict: 'reach',
      mode: 'onsite',
      history: [
        { status: 'Saved', at: d(-27) },
        { status: 'Applied', at: d(-25) },
        { status: 'Rejected', at: d(-8) },
      ],
    }),
  ];
}
