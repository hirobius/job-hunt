import { describe, expect, it } from 'vitest';
import { classifyFind, type FindKind } from './classifyFind';

describe('classifyFind: what one pasted line is', () => {
  it.each<[string, FindKind]>([
    // Nothing to find.
    ['', 'empty'],
    ['   ', 'empty'],
    // A posting on a board system is a job, not the board.
    ['https://boards.greenhouse.io/figma/jobs/4567', 'job'],
    ['https://job-boards.greenhouse.io/figma/jobs/4567?gh_src=x', 'job'],
    ['https://boards.greenhouse.io/embed/job_app?for=figma&token=4567', 'job'],
    ['https://www.figma.com/careers/?gh_jid=4567', 'job'],
    ['https://jobs.lever.co/northwind/1a2b-3c4d', 'job'],
    ['https://jobs.lever.co/northwind/1a2b-3c4d/apply', 'job'],
    ['https://jobs.ashbyhq.com/ramp/0f9e-8d7c', 'job'],
    ['https://apply.workable.com/acme/j/ABC123/', 'job'],
    ['https://acme.recruitee.com/o/senior-welder', 'job'],
    ['https://jobs.smartrecruiters.com/Acme/7444-designer', 'job'],
    ['https://acme.teamtailor.com/jobs/123-designer', 'job'],
    ['https://acme.jobs.personio.de/job/123', 'job'],
    // Any other page with a path is a posting somewhere.
    ['https://www.linkedin.com/jobs/view/123', 'job'],
    ['https://careers.example.org/roles/design-systems-lead', 'job'],
    ['linkedin.com/jobs/view/123', 'job'],
    ['http://indeed.com/viewjob?jk=abc', 'job'],
    // A company board on one of the eight systems is a board.
    ['https://boards.greenhouse.io/figma', 'board'],
    ['https://job-boards.greenhouse.io/figma/', 'board'],
    ['https://boards.greenhouse.io/embed/job_board?for=figma', 'board'],
    ['https://boards-api.greenhouse.io/v1/boards/figma/jobs', 'board'],
    ['https://jobs.lever.co/northwind', 'board'],
    ['jobs.lever.co/northwind', 'board'],
    ['https://jobs.eu.lever.co/northwind', 'board'],
    ['https://jobs.ashbyhq.com/ramp', 'board'],
    ['https://apply.workable.com/acme/', 'board'],
    ['https://acme.recruitee.com', 'board'],
    ['https://jobs.smartrecruiters.com/Acme', 'board'],
    ['https://acme.teamtailor.com/jobs', 'board'],
    ['https://acme.jobs.personio.de', 'board'],
    // A company's own site with no page is the company.
    ['https://www.figma.com', 'company'],
    ['https://figma.com/', 'company'],
    ['figma.com', 'company'],
    // A name is a company.
    ['Figma', 'company'],
    ['figma', 'company'],
    ['Nobody Inc', 'company'],
    ['The Browser Company', 'company'],
    ['Acme & Sons', 'company'],
    // Words that name a role are search words (a title).
    ['Design Systems Engineer', 'words'],
    ['senior product designer', 'words'],
    ['Welder', 'words'],
    ['CNC machinist', 'words'],
    ['design system', 'words'],
    ['Design Technologist', 'words'],
    ['Staff UX Designer', 'words'],
    ['frontend developer', 'words'],
    ['Engineering Manager', 'words'],
  ])('%j → %s', (input, kind) => {
    expect(classifyFind(input).kind).toBe(kind);
  });

  it('a job keeps the link as pasted, trimmed', () => {
    expect(classifyFind('  https://jobs.lever.co/northwind/1a2b  ')).toEqual({
      kind: 'job',
      url: 'https://jobs.lever.co/northwind/1a2b',
    });
  });

  it('a board names its system and slug', () => {
    expect(classifyFind('https://jobs.lever.co/northwind')).toEqual({
      kind: 'board',
      board: { kind: 'lever', slug: 'northwind' },
    });
  });

  it('a company keeps the name as typed; a bare site gives its name', () => {
    expect(classifyFind(' Nobody Inc ')).toEqual({ kind: 'company', name: 'Nobody Inc' });
    expect(classifyFind('https://www.browser-company.com/')).toEqual({
      kind: 'company',
      name: 'browser-company',
    });
    expect(classifyFind('acme.co.uk')).toEqual({ kind: 'company', name: 'acme' });
  });

  it('words keep the spelling typed, spaces folded', () => {
    expect(classifyFind('  Design   Systems Engineer ')).toEqual({
      kind: 'words',
      words: 'Design Systems Engineer',
    });
  });
});
