/* eslint-disable react-refresh/only-export-components -- exploration gallery, not app code; no fast refresh needed. */
// Every C v3 screen, sheet, panel and menu. Built only from HDS components and HDS tokens: no
// hand-rolled controls, no hex colours. Sheets are HDS Dialogs (HDS has no bottom sheet yet).
import { useState, type ReactNode } from 'react';
import {
  ArrowLeft, CalendarPlus, Check, Copy, ExternalLink, Filter, MapPin, MoreHorizontal, Plus, Search, Star, X,
} from 'lucide-react';
import {
  Alert, Badge, Box, Button, Callout, Card, Checkbox, Combobox, Dialog, Disclosure, EmptyState, Grid, Icon, InlineLink,
  Input, Menu, MetadataList, Popover, Progress, SegmentedControl, Select, Sidebar, Stack, StatusListItem, Table, Tabs,
  TabsContent, TabsList, TabsTrigger, Tag, Text, Textarea, Toggle, useToast,
} from '@hirobius/design-system';
import { FormActions, MetricTile, MetricTiles, PageHeader } from '@hirobius/design-system/patterns';
import { COMPANIES, JOBS, STAGE_COUNTS, STARRED_QUIET, TEMPLATES, TRACK, WEEKLY, type Company, type Fit, type Job, type Stage } from './data';
import { DeskShell, PhoneShell, SECONDARY, SectionHead, Secondary, go } from './shell';

const FIT_TONE: Record<Fit, 'success' | 'info' | 'warning'> = { 'Strong fit': 'success', Stretch: 'info', Reach: 'warning' };
const STAGES: Stage[] = ['To apply', 'Follow up', 'Applied', 'Interviewing', 'Offer', 'Closed'];
const PRE = { whiteSpace: 'pre-wrap' } as const;
/** `?full=1` lets a sheet grow to its full height, for the Figma captures. */
const FULL = new URLSearchParams(window.location.search).has('full');

/* ------------------------------------------------------------------ shared parts */

function Title({ children, back }: { children: ReactNode; back?: [string, string] }) {
  return (
    <Stack gap="tight">
      {back && (
        <Box>
          <Button variant="tertiary" size="sm" iconLeft={<Icon icon={ArrowLeft} />} onClick={() => go(back[1])}>
            {back[0]}
          </Button>
        </Box>
      )}
      <Text variant="title" as="h1">{children}</Text>
    </Stack>
  );
}

function Chips({ items, active, onPick }: { items: [string, number?][]; active: string; onPick?: (v: string) => void }) {
  return (
    <Stack direction="row" gap="tight" wrap="wrap">
      {items.map(([label, n]) => (
        <Tag key={label} active={label === active} aria-pressed={label === active} onClick={() => onPick?.(label)}>
          {n === undefined ? label : `${label} · ${n}`}
        </Tag>
      ))}
    </Stack>
  );
}

function SearchRow({ placeholder, filters = true }: { placeholder: string; filters?: boolean }) {
  return (
    <Stack direction="row" gap="tight" align="end">
      <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
        <Input aria-label={placeholder} placeholder={placeholder} leadingVisual={<Icon icon={Search} />} />
      </Box>
      {filters && <Button variant="secondary" iconOnly iconLeft={<Icon icon={Filter} />} label="Filters" onClick={() => go('filters')} />}
    </Stack>
  );
}

function ContextButton() {
  const [mode, setMode] = useState(TRACK.mode);
  return (
    <Popover>
      <Popover.Trigger asChild>
        <Button variant="tertiary" size="sm" iconLeft={<Icon icon={MapPin} />}>
          {TRACK.where} · {mode}
        </Button>
      </Popover.Trigger>
      <Popover.Content align="start" aria-label="Where and how you want to work">
        <Stack gap="normal">
          <Input label="Where" defaultValue={TRACK.where} />
          <SegmentedControl label="Work mode" size="sm" options={['Any', 'Remote', 'Hybrid', 'On-site'].map((v) => ({ value: v, label: v }))} value={mode} onChange={setMode} />
        </Stack>
      </Popover.Content>
    </Popover>
  );
}

function MoreMenu({ items, label = 'More actions' }: { items: (string | [string, () => void])[]; label?: string }) {
  return (
    <Menu modal={false}>
      <Menu.Trigger asChild>
        <Button variant="tertiary" size="sm" iconOnly iconLeft={<Icon icon={MoreHorizontal} />} label={label} />
      </Menu.Trigger>
      <Menu.Content align="end">
        {items.map((it) =>
          typeof it === 'string' ? <Menu.Item key={it}>{it}</Menu.Item> : <Menu.Item key={it[0]} onSelect={it[1]}>{it[0]}</Menu.Item>,
        )}
      </Menu.Content>
    </Menu>
  );
}

function CompanyCard({ c }: { c: Company }) {
  const [starred, setStarred] = useState(!!c.starred);
  const top = c.roles[0];
  return (
    <Card as="article" bordered padding="item">
      <Stack gap="normal">
        <Stack direction="row" justify="space-between" align="start" gap="tight">
          <Stack gap="px4" style={{ minWidth: 0 }}>
            <Stack direction="row" gap="tight" align="center" wrap="wrap">
              <Text variant="ui" as="h3" className="rjb-semibold">{c.name}</Text>
              {!!c.newRoles && <Badge tone="info">{`${c.newRoles} new`}</Badge>}
            </Stack>
            <Secondary>{c.team} · {c.board}</Secondary>
          </Stack>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            iconLeft={<Icon icon={Star} weight={starred ? 'fill' : 'regular'} />}
            label={starred ? 'Unstar company' : 'Star company'}
            pressed={starred}
            onPressedChange={setStarred}
          />
        </Stack>
        {top ? (
          <Stack gap="px4">
            <Text variant="body">{top.title}</Text>
            <Secondary>{top.where} · {top.posted}</Secondary>
          </Stack>
        ) : (
          <Secondary>No public board found. A deep check searches the web for their roles.</Secondary>
        )}
        <Stack direction="row" justify="space-between" align="center">
          {top ? (
            <Button variant="secondary" size="sm" onClick={() => go('company')}>
              {`See roles (${c.roles.length})`}
            </Button>
          ) : (
            <Button variant="secondary" size="sm">Run a deep check</Button>
          )}
          <MoreMenu items={['Open their board', 'Set aside', 'Save as a contact target']} />
        </Stack>
      </Stack>
    </Card>
  );
}

function JobCard({ j, onRemove }: { j: Job; onRemove?: () => void }) {
  const next = j.stage === 'Follow up' ? 'Log follow-up' : j.stage === 'To apply' ? 'Apply' : j.stage === 'Interviewing' ? 'Add notes' : 'Open';
  return (
    <Card as="article" bordered padding="item">
      <Stack gap="normal">
        <Stack gap="px4">
          <Stack direction="row" gap="tight" align="center" justify="space-between">
            <InlineLink href="?s=job" externalIcon={false}>{j.title}</InlineLink>
            {j.starred && <Icon icon={Star} weight="fill" aria-label="Starred" />}
          </Stack>
          <Secondary>{j.company} · {j.line}</Secondary>
        </Stack>
        <Stack direction="row" gap="tight" wrap="wrap">
          {j.fit && <Badge tone={FIT_TONE[j.fit]}>{j.fit}</Badge>}
          {j.closed && <Badge tone="warning">Closed on the board</Badge>}
        </Stack>
        <Stack direction="row" justify="space-between" align="center">
          <Button variant="secondary" size="sm" onClick={() => next === 'Apply' && go('apply')}>{next}</Button>
          <MoreMenu items={['Open posting', 'Star', 'Retire', ['Find more like this', () => go('findmore-search')], ...(onRemove ? [['Remove', onRemove] as [string, () => void]] : ['Remove'])]} />
        </Stack>
      </Stack>
    </Card>
  );
}

function List({ children }: { children: ReactNode }) {
  return <Stack gap="normal">{children}</Stack>;
}

/* ------------------------------------------------------------------ Companies */

function CompaniesBody({ scope = 'Hiring now', firstWeek = false }: { scope?: string; firstWeek?: boolean }) {
  const [active, setActive] = useState(scope);
  const list = active === 'Starred' ? [...COMPANIES.filter((c) => c.starred), STARRED_QUIET] : COMPANIES;
  return (
    <Stack gap="spacious">
      <Title>Companies</Title>
      {firstWeek && <GettingStartedCard />}
      <Stack gap="normal">
        <SearchRow placeholder="Search companies or roles" />
        <Chips items={[['Hiring now', 5], ['Starred', 3], ['To contact', 4], ['Your links', 12], ['All']]} active={active} onPick={setActive} />
        <Stack direction="row" align="center" justify="space-between" wrap="wrap" gap="tight">
          <ContextButton />
          <Secondary as="span">{active === 'Starred' ? '3 starred' : '5 teams with open roles'}</Secondary>
        </Stack>
      </Stack>
      {active === 'Starred' && (
        <Card bordered padding="item" variant="accent">
          <Stack gap="normal">
            <SectionHead>Check your starred companies</SectionHead>
            <Progress value={4} max={6} label="Read 4 of 6 boards" />
            <Secondary>Last full check 2 hours ago. New openings get a badge.</Secondary>
            <Box><Button variant="primary" size="sm">Check now</Button></Box>
          </Stack>
        </Card>
      )}
      <List>
        {list.map((c) => <CompanyCard key={c.id} c={c} />)}
      </List>
      {active !== 'Starred' && (
        <Card bordered padding="item">
          <Stack gap="normal">
            <SectionHead>Add suggested companies (12)</SectionHead>
            <Secondary>Boards from the {TRACK.name} pack that you are not watching yet.</Secondary>
            <Box><Button variant="secondary" size="sm" iconLeft={<Icon icon={Plus} />}>Add 12 companies</Button></Box>
          </Stack>
        </Card>
      )}
      <Box>
        <Button variant="tertiary" onClick={() => go('findmore')}>Find more companies and openings</Button>
      </Box>
    </Stack>
  );
}

function GettingStartedCard() {
  return (
    <Card bordered padding="item" role="region" aria-label="Getting started">
      <Stack gap="normal">
        <SectionHead aside={<Button variant="tertiary" size="sm" iconOnly iconLeft={<Icon icon={X} />} label="Dismiss" />}>Getting started</SectionHead>
        <Checkbox label="Pick a track" checked disabled onChange={() => undefined} />
        <Checkbox label="Star a company you'd love to work for" checked={false} disabled onChange={() => undefined} />
        <Checkbox label="Save your first job" checked={false} disabled onChange={() => undefined} />
      </Stack>
    </Card>
  );
}

function CompanyBody() {
  const c = COMPANIES[0];
  const { toast } = useToast();
  const [saved, setSaved] = useState<Record<number, boolean>>({ 2: true });
  const [starred, setStarred] = useState(true);
  return (
    <Stack gap="spacious">
      <PageHeader
        level={1}
        breadcrumb={<Button variant="tertiary" size="sm" iconLeft={<Icon icon={ArrowLeft} />} onClick={() => go('companies')}>Companies</Button>}
        title={c.name}
        actions={
          <Button variant="secondary" size="sm" iconLeft={<Icon icon={Star} weight={starred ? 'fill' : 'regular'} />} pressed={starred} onPressedChange={setStarred}>
            {starred ? 'Starred' : 'Star'}
          </Button>
        }
      />
      <MetadataList
        variant="divided"
        items={[
          { term: 'Team', description: c.team },
          { term: 'Board', description: `${c.board} · checked ${c.checked}` },
          { term: 'Based', description: 'Seattle, WA · Remote friendly' },
          { term: 'Links', description: <InlineLink href="#" externalIcon={false}>Careers page</InlineLink> },
        ]}
      />
      <SectionHead aside={<Secondary as="span">3 open</Secondary>}>Roles</SectionHead>
      <List>
        {c.roles.map((r, i) => (
          <Card key={r.title} as="article" bordered padding="item">
            <Stack gap="normal">
              <Stack gap="px4">
                <Text variant="body" className="rjb-semibold">{r.title}</Text>
                <Secondary>{[r.where, r.mode, r.pay, r.posted].filter(Boolean).join(' · ')}</Secondary>
              </Stack>
              <Stack direction="row" gap="tight" wrap="wrap">
                <Badge tone={FIT_TONE[r.fit]}>{r.fit}</Badge>
                {r.fit !== 'Strong fit' && <Badge tone="neutral">Missing: Figma variables</Badge>}
              </Stack>
              <Box>
                {saved[i] ? (
                  <Button variant="secondary" size="sm" iconLeft={<Icon icon={Check} />} disabled>Saved</Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setSaved((s) => ({ ...s, [i]: true }));
                      toast({ title: 'Saved to Pipeline', description: `${r.title} is in To apply.`, tone: 'success' });
                    }}
                  >
                    Save
                  </Button>
                )}
              </Box>
            </Stack>
          </Card>
        ))}
      </List>
    </Stack>
  );
}

/* ------------------------------------------------------------------ sheets */

function Sheet({ title, description, children, footer, under }: { title: string; description?: string; children: ReactNode; footer?: ReactNode; under: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      {under}
      <Dialog open={open} onOpenChange={setOpen}>
        <Dialog.Content style={{ width: '100%', maxWidth: 520 }}>
          <Dialog.Header>
            <Dialog.Title>{title}</Dialog.Title>
            {description && <Dialog.Description>{description}</Dialog.Description>}
          </Dialog.Header>
          <Box sx={{ maxHeight: FULL ? 'none' : '64vh', overflowY: 'auto', px: 1, mx: -1, py: 1 }}>{children}</Box>
          {footer && <Dialog.Footer>{footer}</Dialog.Footer>}
        </Dialog.Content>
      </Dialog>
    </>
  );
}

function FiltersSheet() {
  const [level, setLevel] = useState('Senior');
  const [src, setSrc] = useState({ hn: true, remotive: true, jobicy: true, remoteok: false, boards: true, aside: false });
  const flip = (k: keyof typeof src) => (v: boolean) => setSrc((s) => ({ ...s, [k]: v }));
  return (
    <Sheet
      title="Filters"
      description="These apply to Companies and to Find more."
      under={<PhoneShell tab="companies"><CompaniesBody /></PhoneShell>}
      footer={
        <Stack direction="row" gap="tight" justify="end">
          <Button variant="tertiary">Reset</Button>
          <Button variant="primary">Show 18 openings</Button>
        </Stack>
      }
    >
      <Stack gap="spacious">
        <Stack gap="tight">
          <SectionHead>Saved searches</SectionHead>
          <Stack direction="row" gap="tight" align="end">
            <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
              <Select label="Saved search" options={[{ value: 'senior', label: 'Senior, remote or Spokane' }, { value: 'contract', label: 'Contract only' }]} value="senior" onChange={() => undefined} />
            </Box>
            <Button variant="secondary">Save search</Button>
          </Stack>
        </Stack>
        <Stack gap="normal">
          <SectionHead>Targeting</SectionHead>
          <Input label="Leave out" defaultValue="intern, junior, unpaid" helperText="Hiding 7 openings" />
          <SegmentedControl label="Level (from the title)" size="sm" options={['Any', 'Mid', 'Senior', 'Staff+'].map((v) => ({ value: v, label: v }))} value={level} onChange={setLevel} />
          <Input label="Pay floor" prefix="$" suffix="k a year" defaultValue="130" helperText="Hiding 3 · only where the source lists pay" />
        </Stack>
        <Stack gap="tight">
          <SectionHead>Your evidence</SectionHead>
          <Textarea label="Paste your résumé highlights" defaultValue={'Led a 140-component library used by 9 product teams.\nShipped design tokens across web and iOS.'} helperText="Used for Strong fit / Stretch / Reach. 112 of 20,000 characters." />
        </Stack>
        <Stack gap="normal">
          <SectionHead>Sources</SectionHead>
          <Toggle label="HN Who is hiring (+ Freelancer thread)" checked={src.hn} onChange={flip('hn')} />
          <Stack gap="px4">
            <Toggle label="Remotive" checked={src.remotive} onChange={flip('remotive')} />
            <Secondary>2 of 4 checks left today (their limit).</Secondary>
          </Stack>
          <Stack gap="px4">
            <Toggle label="Jobicy" checked={src.jobicy} onChange={flip('jobicy')} />
            <Secondary>Unverified live: turn off if it fails.</Secondary>
          </Stack>
          <Stack gap="px4">
            <Toggle label="Remote OK" checked={false} disabled onChange={() => undefined} />
            <Secondary>Off until its legal notice is checked.</Secondary>
          </Stack>
          <Toggle label="Company boards (Greenhouse, Lever, Ashby, Workable, Recruitee)" checked={src.boards} onChange={flip('boards')} />
        </Stack>
        <Toggle label="Show set-aside companies (2)" checked={src.aside} onChange={flip('aside')} />
      </Stack>
    </Sheet>
  );
}

function ApplySheet() {
  const [tpl, setTpl] = useState('intro');
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const filled = (TEMPLATES.find((t) => t.id === tpl)?.body ?? '')
    .replaceAll('[Contact]', 'Sam')
    .replaceAll('[Role]', 'Senior design systems designer')
    .replaceAll('[Company]', 'Kestrel Labs')
    .replaceAll('[Applied date]', 'Oct 17');
  return (
    <Sheet
      title="Apply"
      description="Senior design systems designer · Kestrel Labs"
      under={<PhoneShell tab="pipeline"><PipelineBody /></PhoneShell>}
      footer={
        <Stack gap="tight" style={{ width: '100%' }}>
          <Button
            variant="primary"
            onClick={() => toast({ title: 'Marked applied', description: 'Follow-up set for Oct 24.', tone: 'success' })}
          >
            Mark applied
          </Button>
          <Secondary>Sets a follow-up for 7 days from today (Oct 24).</Secondary>
        </Stack>
      }
    >
      <Stack gap="spacious">
        <Stack gap="tight">
          <SectionHead>1. Open the posting</SectionHead>
          <Box>
            <Button variant="secondary" iconRight={<Icon icon={ExternalLink} />} asChild>
              <a href="#" onClick={(e) => e.preventDefault()}>Open on Greenhouse</a>
            </Button>
          </Box>
        </Stack>
        <Stack gap="normal">
          <SectionHead aside={<Button variant="tertiary" size="sm" onClick={() => go('templates')}>Edit templates</Button>}>2. Copy what you need</SectionHead>
          <Select label="Template" options={TEMPLATES.map((t) => ({ value: t.id, label: t.title }))} value={tpl} onChange={setTpl} />
          <Card bordered padding="item">
            <Text variant="body" style={PRE}>{filled}</Text>
          </Card>
          <Box>
            <Button variant="secondary" iconLeft={<Icon icon={copied ? Check : Copy} />} onClick={() => setCopied(true)}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </Box>
        </Stack>
        <Stack gap="tight">
          <SectionHead>3. Mark it applied</SectionHead>
          <Secondary>When you've sent it, mark it applied below.</Secondary>
        </Stack>
      </Stack>
    </Sheet>
  );
}

function TemplatesSheet() {
  return (
    <Sheet
      title="Templates"
      under={<PhoneShell tab="pipeline"><PipelineBody /></PhoneShell>}
      footer={
        <Stack direction="row" gap="tight" justify="space-between" style={{ width: '100%' }}>
          <Button variant="tertiary">Restore starter templates</Button>
          <Button variant="primary" iconLeft={<Icon icon={Plus} />} onClick={() => go('template-edit')}>New template</Button>
        </Stack>
      }
    >
      <Stack gap="normal">
        <Input aria-label="Find a template" placeholder="Find a template" leadingVisual={<Icon icon={Search} />} />
        {TEMPLATES.map((t) => (
          <Card key={t.id} as="article" bordered padding="item">
            <Stack gap="px4">
              <Stack direction="row" justify="space-between" align="center">
                <InlineLink href="?s=template-edit" externalIcon={false}>{t.title}</InlineLink>
                {t.pinned && <Badge tone="neutral">Pinned</Badge>}
              </Stack>
              <Text variant="caption" style={{ ...SECONDARY, ...PRE }}>{t.body.split('\n\n')[1]}</Text>
            </Stack>
          </Card>
        ))}
      </Stack>
    </Sheet>
  );
}

function TemplateEditSheet() {
  const t = TEMPLATES[0];
  const [body, setBody] = useState(t.body);
  return (
    <Sheet
      title="Edit template"
      under={<PhoneShell tab="pipeline"><PipelineBody /></PhoneShell>}
      footer={
        <Stack direction="row" gap="tight" justify="space-between" style={{ width: '100%' }}>
          <MoreMenu label="Template actions" items={['Unpin', 'Duplicate', 'Delete…']} />
          <Button variant="primary">Copy filled</Button>
        </Stack>
      }
    >
      <Stack gap="normal">
        <Input label="Name" defaultValue={t.title} />
        <Stack direction="row" gap="tight" wrap="wrap" aria-label="Insert a token">
          {['[Company]', '[Role]', '[Contact]', '[Applied date]'].map((k) => (
            <Tag key={k} onClick={() => setBody((b) => `${b} ${k}`)}>{k}</Tag>
          ))}
        </Stack>
        <Tabs defaultValue="write">
          <TabsList>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          <TabsContent value="write">
            <Textarea aria-label="Template text" value={body} onChange={(e) => setBody(e.target.value)} rows={7} />
          </TabsContent>
          <TabsContent value="preview">
            <Text variant="body" style={PRE}>{body.replaceAll('[Company]', 'Kestrel Labs').replaceAll('[Contact]', 'Sam').replaceAll('[Role]', 'Senior design systems designer')}</Text>
          </TabsContent>
        </Tabs>
        <Select label="Fill for" options={[{ value: 'k', label: 'Senior design systems designer · Kestrel Labs' }, { value: 'none', label: 'No job (show tokens)' }]} value="k" onChange={() => undefined} />
      </Stack>
    </Sheet>
  );
}

function TrackSheet() {
  const [pack, setPack] = useState('consulting');
  return (
    <Sheet title="Tracks" description="A track is one kind of job you're hunting. Each keeps its own companies, terms and place." under={<PhoneShell tab="companies"><CompaniesBody /></PhoneShell>}>
      <Stack gap="spacious">
        <Stack gap="tight">
          {[['Design systems', 'Spokane, WA · Hybrid · 31 companies'], ['Implementation consulting', 'Remote · 18 companies'], ['Trades', 'Spokane, WA · On-site · 9 companies']].map(([n, d], i) => (
            <Card key={n} bordered padding="item" selectable selected={i === 0}>
              <Stack gap="px4">
                <Text variant="ui" className="rjb-semibold">{n}</Text>
                <Secondary>{d}</Secondary>
              </Stack>
            </Card>
          ))}
        </Stack>
        <Box><Button variant="secondary">Manage this track</Button></Box>
        <Stack gap="normal">
          <SectionHead>New track</SectionHead>
          <Select label="Start from" options={[{ value: 'consulting', label: 'Implementation consulting pack' }, { value: 'servicenow', label: 'ServiceNow pack' }, { value: 'ds', label: 'Design systems pack' }, { value: 'trades', label: 'Trades pack' }, { value: 'blank', label: 'Blank' }]} value={pack} onChange={setPack} />
          <Box><Button variant="primary" iconLeft={<Icon icon={Plus} />}>Create track</Button></Box>
        </Stack>
      </Stack>
    </Sheet>
  );
}

function SignInSheet() {
  return (
    <Sheet title="Sign in" description="We'll email you a link. Your jobs, templates and companies sync to every device." under={<PhoneShell tab="companies"><CompaniesBody /></PhoneShell>} footer={<Button variant="primary">Email me a link</Button>}>
      <Input label="Email" type="email" placeholder="you@example.com" />
    </Sheet>
  );
}

/* ------------------------------------------------------------------ Find more */

function FindMoreTools({ value }: { value: string }) {
  return (
    <SegmentedControl
      label="Find more tools"
      fullWidth
      size="sm"
      options={[{ value: 'findmore', label: 'Openings' }, { value: 'findmore-search', label: 'Search' }, { value: 'findmore-boards', label: 'Boards & teams' }]}
      value={value}
      onChange={go}
    />
  );
}

function FindMoreBody() {
  const posts = COMPANIES.flatMap((c) => c.roles.map((r) => ({ ...r, company: c.name, source: c.board })));
  return (
    <Stack gap="spacious">
      <Title back={['Companies', 'companies']}>Find more</Title>
      <FindMoreTools value="findmore" />
      <SearchRow placeholder="Search openings" />
      <Alert tone="warning" title="Remotive didn't answer">
        <Stack direction="row" gap="tight" align="center" justify="space-between" wrap="wrap">
          <span>The other sources loaded.</span>
          <Button variant="secondary" size="sm">Retry Remotive</Button>
        </Stack>
      </Alert>
      <Secondary>Read 18 of 18 boards · 42 openings · newest first</Secondary>
      <List>
        {posts.slice(0, 4).map((p) => (
          <Card key={p.title} as="article" bordered padding="item">
            <Stack gap="normal">
              <Stack gap="px4">
                <Text variant="body" className="rjb-semibold">{p.title}</Text>
                <Secondary>{p.company} · {p.where} · via {p.source}</Secondary>
              </Stack>
              <Stack direction="row" gap="tight" wrap="wrap">
                <Badge tone={FIT_TONE[p.fit]}>{p.fit}</Badge>
                {p.contract && <Badge tone="success">Contract</Badge>}
              </Stack>
              <Box><Button variant="secondary" size="sm">Save</Button></Box>
            </Stack>
          </Card>
        ))}
      </List>
      <Card bordered padding="item">
        <Stack gap="normal">
          <SectionHead>Add a company</SectionHead>
          <Input label="Board or careers link" placeholder="boards.greenhouse.io/…" />
          <Box><Button variant="secondary" size="sm">Watch</Button></Box>
        </Stack>
      </Card>
    </Stack>
  );
}

const SWEEP_TITLES = ['Design systems designer', 'Design engineer', 'Product designer, platform', 'UX engineer', 'Design ops lead'];

function FindMoreSearchBody() {
  const [titles, setTitles] = useState<string[]>(SWEEP_TITLES.slice(0, 4));
  const [off, setOff] = useState<Record<string, boolean>>({ 'UX engineer': true });
  const [contract, setContract] = useState(false);
  const live = titles.filter((t) => !off[t]);
  return (
    <Stack gap="spacious">
      <Title back={['Companies', 'companies']}>Find more</Title>
      <FindMoreTools value="findmore-search" />
      <Card bordered padding="item" variant="accent">
        <Stack gap="normal">
          <SectionHead aside={<Badge tone="neutral">Planned · #213</Badge>}>Wide sweep</SectionHead>
          <Combobox multiple options={SWEEP_TITLES.map((t) => ({ value: t, label: t }))} value={titles} onChange={setTitles} placeholder="Add job titles" />
          <Stack gap="tight">
            {titles.map((t) => (
              <Toggle key={t} label={t} checked={!off[t]} onChange={(v) => setOff((o) => ({ ...o, [t]: !v }))} />
            ))}
          </Stack>
          <Box><Button variant="primary" size="sm">{`Run ${live.length * 5} searches`}</Button></Box>
          <Secondary>Each title runs on every board below. Turned-off titles stay saved.</Secondary>
        </Stack>
      </Card>
      <Stack gap="normal">
        <SectionHead>Title search</SectionHead>
        <Stack direction="row" gap="tight" align="end" wrap="wrap">
          <Box sx={{ flex: '1 1 10rem', minWidth: 0 }}>
            <Select label="Posted" options={[{ value: 'week', label: 'Past week' }, { value: 'day', label: 'Past day' }, { value: 'any', label: 'Any time' }]} value="week" onChange={() => undefined} />
          </Box>
          <Toggle label="Contract only" checked={contract} onChange={setContract} />
        </Stack>
        {['Indeed', 'LinkedIn', 'ZipRecruiter', 'Google Jobs', 'Snagajob'].map((b) => (
          <StatusListItem key={b} title={b} notes={['Design systems designer · Spokane, WA · Hybrid']} trailing={<Button variant="secondary" size="sm" iconRight={<Icon icon={ExternalLink} />}>Open</Button>} />
        ))}
      </Stack>
      <Stack gap="normal">
        <SectionHead>ATS search (Google)</SectionHead>
        {[['Greenhouse · Lever · Ashby', ''], ['Workday · SuccessFactors · Taleo', ''], ['Community boards', 'Unverified live']].map(([b, n]) => (
          <StatusListItem key={b} title={b} notes={n ? [n] : undefined} tone={n ? 'warning' : undefined} trailing={<Button variant="secondary" size="sm" iconRight={<Icon icon={ExternalLink} />}>Open</Button>} />
        ))}
      </Stack>
    </Stack>
  );
}

function FindMoreBoardsBody() {
  const [hiring, setHiring] = useState(true);
  return (
    <Stack gap="spacious">
      <Title back={['Companies', 'companies']}>Find more</Title>
      <FindMoreTools value="findmore-boards" />
      <Stack gap="normal">
        <SectionHead>Boards</SectionHead>
        <Textarea label="Companies, one per line" defaultValue={'Kestrel Labs\nJuniper Freight\nOrchard Analytics'} helperText="Up to 500. We ask each job-board service whether they have a public board." />
        <Stack direction="row" gap="tight" wrap="wrap" align="center">
          <Button variant="primary" size="sm">Check for boards</Button>
          <Button variant="tertiary" size="sm">Load a YC batch</Button>
          <Badge tone="warning">YC list unverified live</Badge>
        </Stack>
        <Stack direction="row" gap="tight" wrap="wrap">
          <Badge tone="success">12 hiring</Badge>
          <Badge tone="neutral">30 no board</Badge>
          <Badge tone="warning">3 couldn't check</Badge>
        </Stack>
        <Toggle label="Only companies with open roles" checked={hiring} onChange={setHiring} />
        <Box><Button variant="secondary" size="sm">Watch all 12</Button></Box>
      </Stack>
      <Stack gap="normal">
        <SectionHead>Teams</SectionHead>
        <Callout tone="info">Searches GitHub with this track's terms: design system, component library, design tokens. On another track it uses that track's terms.</Callout>
        <StatusListItem tone="success" title="Kestrel Labs" notes={['Greenhouse board · 3 open roles']} trailing={<Button variant="secondary" size="sm">Watch</Button>} />
        <StatusListItem tone="success" title="Bluefin Studio" notes={['Recruitee board · 1 open role']} trailing={<Button variant="secondary" size="sm">Watch</Button>} />
        <StatusListItem tone="neutral" title="Orchard Analytics" notes={['No public board']} trailing={<Button variant="tertiary" size="sm">Save as target</Button>} />
        <Secondary>GitHub: 6 searches left this minute · 31 lookups left this hour.</Secondary>
      </Stack>
    </Stack>
  );
}

/* ------------------------------------------------------------------ Pipeline */

function PipelineBody({ stage = 'To apply' }: { stage?: Stage }) {
  const [active, setActive] = useState<string>(stage);
  const [removed, setRemoved] = useState<string | null>(stage === 'Follow up' ? 'UI engineer · Juniper Freight' : null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const shown = JOBS.filter((j) => (active === 'Follow up' ? j.stage === 'Follow up' || j.stage === 'Applied' : j.stage === active));
  return (
    <Stack gap="spacious">
      <Title>Pipeline</Title>
      <Stack gap="normal">
        <Stack direction="row" gap="tight" align="end">
          <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
            <Input aria-label="Paste a job link" placeholder="Paste a job link to save it" />
          </Box>
          <Button variant="primary">Add</Button>
        </Stack>
        <Chips items={STAGES.map((s) => [s, STAGE_COUNTS[s]] as [string, number])} active={active} onPick={setActive} />
        <Stack direction="row" gap="tight" align="end">
          <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
            <Input aria-label="Search jobs" placeholder="Search jobs" leadingVisual={<Icon icon={Search} />} />
          </Box>
          <Box sx={{ flex: '0 0 10rem' }}>
            <Select label="Sort" showLabel={false} options={['Recent', 'Follow-up due', 'Best fit', 'Applied date', 'Status', 'Salary', 'A–Z'].map((v) => ({ value: v, label: v }))} value="Best fit" onChange={() => undefined} />
          </Box>
        </Stack>
      </Stack>
      {active === 'To apply' && <Alert tone="warning" title="1 saved job closed on the board">Design ops lead · Harbor & Pine. We never change its status for you.</Alert>}
      {active === 'Follow up' && (
        <Stack gap="tight">
          <SectionHead>This week</SectionHead>
          <StatusListItem tone="info" title="Phone screen · Bluefin Studio" notes={['Tue Oct 21, 10:00']} />
          <StatusListItem tone="neutral" title="Portfolio review · Kestrel Labs" notes={['Thu Oct 23, 14:00']} />
        </Stack>
      )}
      <List>
        {removed && (
          <StatusListItem
            tone="neutral"
            title={`Removed: ${removed}`}
            notes={['Undo for 10 seconds']}
            trailing={<Button variant="secondary" size="sm" onClick={() => setRemoved(null)}>Undo</Button>}
          />
        )}
        {shown.map((j) => <JobCard key={j.title} j={j} onRemove={() => setRemoved(`${j.title} · ${j.company}`)} />)}
      </List>
      <Disclosure label="Insights" open={insightsOpen} onOpenChange={setInsightsOpen}>
        <InsightsBlocks compact />
      </Disclosure>
      <Card bordered padding="item">
        <Stack gap="normal">
          <SectionHead>Find the next company</SectionHead>
          <Secondary>5 teams are hiring now on your {TRACK.name} track.</Secondary>
          <Box><Button variant="secondary" size="sm" onClick={() => go('companies')}>Go to Companies</Button></Box>
        </Stack>
      </Card>
    </Stack>
  );
}

function InsightsBlocks({ compact = false }: { compact?: boolean }) {
  const max = Math.max(...WEEKLY);
  const weeks = ['Aug 24', 'Aug 31', 'Sep 7', 'Sep 14', 'Sep 21', 'Sep 28', 'Oct 5', 'Oct 12'];
  return (
    <Stack gap="spacious">
      <MetricTiles>
        <MetricTile label="Applied, 7 days" value="9" sub="+2 on last week" tone="success" />
        <MetricTile label="Response rate" value="22%" sub="4 of 18" />
        <MetricTile label="Interview rate" value="11%" sub="2 of 18" />
        <MetricTile label="Median reply" value="5 days" />
      </MetricTiles>
      {!compact && (
        <>
          <Stack gap="normal">
            <SectionHead>Funnel</SectionHead>
            {[['Saved', 31], ['Applied', 18], ['Replied', 4], ['Interviewing', 2], ['Offer', 0]].map(([s, n]) => (
              <Progress key={s} value={Number(n)} max={31} label={`${s} · ${n}`} />
            ))}
          </Stack>
          <Stack gap="normal">
            <SectionHead aside={<Badge tone="info">New</Badge>}>Applied per week</SectionHead>
            {WEEKLY.map((n, i) => (
              <Progress key={weeks[i]} value={n} max={max} size="sm" label={`Week of ${weeks[i]} · ${n}`} />
            ))}
            <Secondary>Was computed but never shown. Now it is.</Secondary>
          </Stack>
        </>
      )}
    </Stack>
  );
}

function InsightsBody() {
  return (
    <Stack gap="spacious">
      <Title back={['Pipeline', 'pipeline']}>Insights</Title>
      <InsightsBlocks />
    </Stack>
  );
}

/* ------------------------------------------------------------------ Job */

function JobBody({ tab = 'overview' }: { tab?: string }) {
  const [starred, setStarred] = useState(true);
  const [open, setOpen] = useState(tab);
  return (
    <Stack gap="spacious">
      <PageHeader
        level={1}
        breadcrumb={<Button variant="tertiary" size="sm" iconLeft={<Icon icon={ArrowLeft} />} onClick={() => go('pipeline')}>Pipeline</Button>}
        title="Senior design systems designer"
        status={
          <Stack direction="row" gap="tight" wrap="wrap">
            <Badge tone="neutral">To apply</Badge>
            <Badge tone="success">Strong fit</Badge>
          </Stack>
        }
        actions={
          <Stack direction="row" gap="tight" align="center" wrap="wrap">
            <Button variant="secondary" size="sm" iconLeft={<Icon icon={Star} weight={starred ? 'fill' : 'regular'} />} pressed={starred} onPressedChange={setStarred}>
              {starred ? 'Starred' : 'Star'}
            </Button>
            <Button variant="primary" size="sm" onClick={() => go('apply')}>Apply</Button>
            <MoreMenu label="Job actions" items={['Open posting', ['Find more like this', () => go('findmore-search')], 'Retire', 'Remove']} />
          </Stack>
        }
      />
      <Tabs value={open} onValueChange={setOpen}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="screening">Screening</TabsTrigger>
          <TabsTrigger value="interviews">Interviews</TabsTrigger>
          <TabsTrigger value="todos">To-dos</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><Box sx={{ pt: 'md' }}><JobOverview /></Box></TabsContent>
        <TabsContent value="screening"><Box sx={{ pt: 'md' }}><JobScreening /></Box></TabsContent>
        <TabsContent value="interviews"><Box sx={{ pt: 'md' }}><JobInterviews /></Box></TabsContent>
        <TabsContent value="todos"><Box sx={{ pt: 'md' }}><JobTodos /></Box></TabsContent>
      </Tabs>
    </Stack>
  );
}

function JobOverview() {
  return (
    <Stack gap="spacious">
      <Stack gap="tight">
        <SectionHead aside={<Button variant="tertiary" size="sm">Edit</Button>}>Details</SectionHead>
        <MetadataList
          variant="divided"
          items={[
            { term: 'Company', description: 'Kestrel Labs' },
            { term: 'Where', description: 'Remote, US' },
            { term: 'Pay', description: '$150k–$175k' },
            { term: 'Saved', description: 'Oct 17 from Kestrel Labs (Greenhouse)' },
            { term: 'Posting', description: <InlineLink href="#">boards.greenhouse.io/kestrel</InlineLink> },
          ]}
        />
      </Stack>
      <Stack gap="tight">
        <SectionHead>Research</SectionHead>
        <Stack direction="row" gap="tight" wrap="wrap">
          <Button variant="secondary" size="sm" iconRight={<Icon icon={ExternalLink} />}>Glassdoor</Button>
          <Button variant="secondary" size="sm" iconRight={<Icon icon={ExternalLink} />}>LinkedIn people</Button>
        </Stack>
      </Stack>
    </Stack>
  );
}

function JobScreening() {
  const [mode, setMode] = useState('Remote');
  return (
    <Stack gap="spacious">
      <Disclosure label="Screen a job description" variant="nav" defaultOpen>
        <Stack gap="normal">
          <Textarea aria-label="Job description" rows={4} defaultValue={'5+ years building design systems. Live coding exercise in React. Up to 10% travel.'} />
          <Stack direction="row" gap="tight" wrap="wrap">
            <Badge tone="danger">Coding loop</Badge>
            <Badge tone="neutral">5+ years</Badge>
            <Badge tone="neutral">Travel 10%</Badge>
            <Badge tone="info">Suggests: Stretch</Badge>
          </Stack>
          <Box><Button variant="secondary" size="sm">Use suggestions</Button></Box>
          <Secondary>Rules only, on this device. No AI.</Secondary>
        </Stack>
      </Disclosure>
      <Stack gap="normal">
        <SectionHead>Screening</SectionHead>
        <Select label="Fit" options={[{ value: 'match', label: 'Strong fit' }, { value: 'stretch', label: 'Stretch' }, { value: 'reach', label: 'Reach' }]} value="match" onChange={() => undefined} />
        <SegmentedControl label="Work mode" size="sm" options={['Remote', 'Hybrid', 'On-site'].map((v) => ({ value: v, label: v }))} value={mode} onChange={setMode} />
        <Stack direction="row" gap="tight">
          <Input label="Travel %" defaultValue="10" />
          <Input label="Applicants" defaultValue="40" />
        </Stack>
        <Input label="Blockers" defaultValue="Live coding" />
        <Textarea label="Angle" defaultValue="Lead with the token pipeline work." />
      </Stack>
    </Stack>
  );
}

function JobInterviews() {
  return (
    <Stack gap="spacious">
      <Stack gap="tight">
        <StatusListItem tone="info" title="Recruiter call" notes={['Tue Oct 21, 10:00 · 30 min']} trailing={<Button variant="tertiary" size="sm" iconOnly iconLeft={<Icon icon={X} />} label="Remove interview" />} />
        <StatusListItem tone="neutral" title="Portfolio review" notes={['Thu Oct 23, 14:00 · 60 min']} trailing={<Button variant="tertiary" size="sm" iconOnly iconLeft={<Icon icon={X} />} label="Remove interview" />} />
      </Stack>
      <Stack gap="normal">
        <SectionHead>Add an interview</SectionHead>
        <Stack direction="row" gap="tight">
          <Input label="When" type="datetime-local" />
          <Input label="What" placeholder="Hiring manager" />
        </Stack>
        <Stack direction="row" gap="tight" wrap="wrap">
          <Button variant="secondary" size="sm" iconLeft={<Icon icon={Plus} />}>Add interview</Button>
          <Button variant="tertiary" size="sm" iconLeft={<Icon icon={CalendarPlus} />}>Add to calendar</Button>
        </Stack>
      </Stack>
    </Stack>
  );
}

function JobTodos() {
  const [items, setItems] = useState([
    { l: 'Tailor the portfolio case study', d: true },
    { l: 'Find the hiring manager', d: false },
    { l: 'Ask Sam for a referral', d: false },
  ]);
  return (
    <Stack gap="spacious">
      <Stack gap="tight">
        {items.map((it, i) => (
          <Checkbox key={it.l} label={it.l} checked={it.d} onChange={(v) => setItems((xs) => xs.map((x, k) => (k === i ? { ...x, d: v } : x)))} />
        ))}
        <Stack direction="row" gap="tight" align="end">
          <Box sx={{ flex: '1 1 auto', minWidth: 0 }}><Input aria-label="New to-do" placeholder="Add a to-do" /></Box>
          <Button variant="secondary">Add</Button>
        </Stack>
      </Stack>
      <Stack gap="tight">
        <SectionHead aside={<Badge tone="success">Saved</Badge>}>Notes</SectionHead>
        <Textarea aria-label="Notes" rows={4} defaultValue="Team ships tokens to iOS and web. Recruiter mentioned a take-home." />
      </Stack>
    </Stack>
  );
}

/* ------------------------------------------------------------------ first run, account, error */

function OnboardingBody() {
  const [pick, setPick] = useState('ds');
  return (
    <Box sx={{ minHeight: '100vh', px: 'var(--semantic-space-region-gutter)', py: 'lg' }}>
      <Stack gap="spacious">
        <Progress value={1} max={3} label="Step 1 of 3" />
        <Text variant="title" as="h1">What are you looking for?</Text>
        <Secondary>Pick a starter pack. It fills in companies and search terms you can change later.</Secondary>
        <Stack gap="tight">
          {[['ds', 'Design systems', '31 companies'], ['consulting', 'Implementation consulting', '18 companies'], ['servicenow', 'ServiceNow', '14 companies'], ['trades', 'Trades', '9 companies'], ['blank', 'Start blank', 'Add your own']].map(([v, n, d]) => (
            <Card key={v} bordered padding="item" selectable selected={pick === v} onSelectedChange={() => setPick(v)}>
              <Stack gap="px4">
                <Text variant="ui" className="rjb-semibold">{n}</Text>
                <Secondary>{d}</Secondary>
              </Stack>
            </Card>
          ))}
        </Stack>
        <Box><Button variant="tertiary">Try it with sample data</Button></Box>
        <FormActions primary={<Button variant="primary">Next</Button>} secondary={<Button variant="tertiary">Skip</Button>} />
      </Stack>
    </Box>
  );
}

function AccountMenuScreen() {
  return (
    <Box sx={{ position: 'relative' }}>
      <PhoneShell tab="companies"><CompaniesBody /></PhoneShell>
      <Box sx={{ position: 'absolute', top: 1, right: 'var(--semantic-space-region-gutter)' }}>
        <Menu defaultOpen modal={false}>
          <Menu.Trigger asChild>
            <Button variant="secondary" size="sm">Account</Button>
          </Menu.Trigger>
          <Menu.Content align="end">
            <Menu.Label>Not synced. Sign in to keep your data safe.</Menu.Label>
            <Menu.Item onSelect={() => go('signin')}>Sign in</Menu.Item>
            <Menu.Separator />
            <Menu.Item onSelect={() => go('templates')}>Templates</Menu.Item>
            <Menu.Item onSelect={() => go('track')}>Manage track</Menu.Item>
            <Menu.Separator />
            <Menu.Item>Back up</Menu.Item>
            <Menu.Item>Restore…</Menu.Item>
            <Menu.Item>Export CSV</Menu.Item>
            <Menu.Separator />
            <Menu.Item>Theme: dark</Menu.Item>
            <Menu.Item>Density: compact</Menu.Item>
            <Menu.Item>Send feedback</Menu.Item>
            <Menu.Separator />
            <Menu.Item disabled>Sign out</Menu.Item>
            <Menu.Item disabled>Delete my data…</Menu.Item>
          </Menu.Content>
        </Menu>
      </Box>
    </Box>
  );
}

function ErrorScreen() {
  return (
    <Box sx={{ minHeight: '100vh', px: 'var(--semantic-space-region-gutter)', py: 'xl' }}>
      <Stack gap="spacious">
        <EmptyState title="Something broke" description="Your data is still saved on this device. Reload first; reset only clears this browser." />
        <Stack direction="row" gap="tight" justify="center">
          <Button variant="primary">Reload</Button>
          <Button variant="secondary" tone="danger">Reset local data</Button>
        </Stack>
      </Stack>
    </Box>
  );
}

/* ------------------------------------------------------------------ desktop */

function CompaniesDesk() {
  return (
    <DeskShell tab="companies">
      <Stack gap="spacious">
        <Stack direction="row" justify="space-between" align="end" gap="normal">
          <Text variant="title" as="h1">Companies</Text>
          <Button variant="tertiary" onClick={() => go('findmore')}>Find more</Button>
        </Stack>
        <Sidebar side="start" sideWidth="18rem" gap="spacious">
          <Stack gap="spacious">
            <SearchRow placeholder="Search companies or roles" filters={false} />
            <ContextButton />
            <Stack gap="normal">
              <SectionHead>Show</SectionHead>
              <Chips items={[['Hiring now', 5], ['Starred', 3], ['To contact', 4], ['Your links', 12], ['All']]} active="Hiring now" />
            </Stack>
            <Stack gap="normal">
              <SectionHead>Targeting</SectionHead>
              <Input label="Leave out" defaultValue="intern, junior" helperText="Hiding 7" />
              <Input label="Pay floor" prefix="$" suffix="k" defaultValue="130" helperText="Hiding 3" />
            </Stack>
            <Button variant="secondary" iconLeft={<Icon icon={Filter} />} onClick={() => go('filters')}>All filters</Button>
          </Stack>
          <Stack gap="normal">
            <Secondary>5 teams with open roles · newest first</Secondary>
            <Grid layout="auto-fill" minItemWidth="300px" gap="medium" align="stretch">
              {COMPANIES.map((c) => <CompanyCard key={c.id} c={c} />)}
              <Card bordered padding="item">
                <Stack gap="normal">
                  <SectionHead>Add suggested companies (12)</SectionHead>
                  <Secondary>From the {TRACK.name} pack.</Secondary>
                  <Box><Button variant="secondary" size="sm">Add 12</Button></Box>
                </Stack>
              </Card>
            </Grid>
          </Stack>
        </Sidebar>
      </Stack>
    </DeskShell>
  );
}

function PipelineDesk() {
  const rows = JOBS.map((j) => ({
    key: j.title,
    cells: [
      { slot: 'label' as const, content: <InlineLink href="?s=job-desk" externalIcon={false}>{j.title}</InlineLink> },
      { slot: 'description' as const, content: j.company },
      { slot: 'badge' as const, content: <Badge tone="neutral">{j.stage}</Badge> },
      { slot: 'badge' as const, content: j.fit ? <Badge tone={FIT_TONE[j.fit]}>{j.fit}</Badge> : '—' },
      { slot: 'description' as const, content: j.line },
      { slot: 'action' as const, content: <Stack direction="row" gap="tight" justify="end"><Button variant="secondary" size="sm" onClick={() => j.stage === 'To apply' && go('apply')}>{j.stage === 'To apply' ? 'Apply' : j.stage === 'Follow up' ? 'Log follow-up' : 'Open'}</Button><MoreMenu items={['Open posting', 'Star', 'Retire', 'Find more like this', 'Remove']} /></Stack>, align: 'right' as const },
    ],
  }));
  return (
    <DeskShell tab="pipeline">
      <Stack gap="spacious">
        <Stack direction="row" justify="space-between" align="end" gap="normal" wrap="wrap">
          <Text variant="title" as="h1">Pipeline</Text>
          <Stack direction="row" gap="tight" align="end">
            <Box sx={{ width: '24rem' }}><Input aria-label="Paste a job link" placeholder="Paste a job link to save it" /></Box>
            <Button variant="primary">Add</Button>
          </Stack>
        </Stack>
        <Stack direction="row" justify="space-between" align="center" gap="normal" wrap="wrap">
          <Chips items={STAGES.map((s) => [s, STAGE_COUNTS[s]] as [string, number])} active="To apply" />
          <Stack direction="row" gap="tight" align="end">
            <Box sx={{ width: '16rem' }}><Input aria-label="Search jobs" placeholder="Search jobs" leadingVisual={<Icon icon={Search} />} /></Box>
            <Box sx={{ width: '10rem' }}><Select label="Sort" showLabel={false} options={['Best fit', 'Recent', 'Follow-up due'].map((v) => ({ value: v, label: v }))} value="Best fit" onChange={() => undefined} /></Box>
          </Stack>
        </Stack>
        <Alert tone="warning" title="1 saved job closed on the board">Design ops lead · Harbor & Pine</Alert>
        <Table
          caption="Jobs"
          columns={[
            { key: 'role', label: 'Role', sortable: true, sortDirection: 'none' },
            { key: 'co', label: 'Company', sortable: true, sortDirection: 'none' },
            { key: 'stage', label: 'Stage' },
            { key: 'fit', label: 'Fit', sortable: true, sortDirection: 'descending' },
            { key: 'next', label: 'Latest' },
            { key: 'act', label: 'Next step', align: 'right' },
          ]}
          rows={rows}
        />
        <Stack gap="normal">
          <SectionHead>Insights</SectionHead>
          <InsightsBlocks compact />
        </Stack>
      </Stack>
    </DeskShell>
  );
}

function JobDesk() {
  return (
    <DeskShell tab="pipeline">
      <Sidebar side="start" sideWidth="20rem" gap="spacious">
        <Stack gap="tight" as="nav">
          <SectionHead>To apply · 3</SectionHead>
          {JOBS.filter((j) => j.stage === 'To apply').map((j, i) => (
            <Card key={j.title} bordered padding="item" variant={i === 0 ? 'accent' : 'default'}>
              <Stack gap="px4">
                <InlineLink href="?s=job-desk" externalIcon={false} aria-current={i === 0 ? 'page' : undefined}>{j.title}</InlineLink>
                <Secondary>{j.company}</Secondary>
              </Stack>
            </Card>
          ))}
        </Stack>
        <Box sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
          <JobBody />
        </Box>
      </Sidebar>
    </DeskShell>
  );
}

/* ------------------------------------------------------------------ registry */

export const SCREENS: Record<string, () => ReactNode> = {
  companies: () => <PhoneShell tab="companies"><CompaniesBody /></PhoneShell>,
  starred: () => <PhoneShell tab="companies"><CompaniesBody scope="Starred" /></PhoneShell>,
  company: () => <PhoneShell tab="companies"><CompanyBody /></PhoneShell>,
  filters: () => <FiltersSheet />,
  findmore: () => <PhoneShell tab="companies"><FindMoreBody /></PhoneShell>,
  'findmore-search': () => <PhoneShell tab="companies"><FindMoreSearchBody /></PhoneShell>,
  'findmore-boards': () => <PhoneShell tab="companies"><FindMoreBoardsBody /></PhoneShell>,
  pipeline: () => <PhoneShell tab="pipeline"><PipelineBody /></PhoneShell>,
  'pipeline-follow': () => <PhoneShell tab="pipeline"><PipelineBody stage="Follow up" /></PhoneShell>,
  insights: () => <PhoneShell tab="pipeline"><InsightsBody /></PhoneShell>,
  job: () => <PhoneShell tab="pipeline"><JobBody /></PhoneShell>,
  'job-screening': () => <PhoneShell tab="pipeline"><JobBody tab="screening" /></PhoneShell>,
  'job-interviews': () => <PhoneShell tab="pipeline"><JobBody tab="interviews" /></PhoneShell>,
  'job-todos': () => <PhoneShell tab="pipeline"><JobBody tab="todos" /></PhoneShell>,
  apply: () => <ApplySheet />,
  templates: () => <TemplatesSheet />,
  'template-edit': () => <TemplateEditSheet />,
  account: () => <AccountMenuScreen />,
  track: () => <TrackSheet />,
  onboarding: () => <OnboardingBody />,
  'getting-started': () => <PhoneShell tab="companies"><CompaniesBody firstWeek /></PhoneShell>,
  signin: () => <SignInSheet />,
  error: () => <ErrorScreen />,
  'companies-desk': () => <CompaniesDesk />,
  'pipeline-desk': () => <PipelineDesk />,
  'job-desk': () => <JobDesk />,
};


