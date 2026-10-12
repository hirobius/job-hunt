import { describe, expect, it } from 'vitest';
import { buildIcs, escapeText, foldLine, type IcsEvent } from './ics';

const NOW = new Date(Date.UTC(2026, 9, 12, 18, 30, 5));
const unfold = (s: string) => s.replace(/\r\n[ \t]/g, '');
const octets = (s: string) => new TextEncoder().encode(s).length;

describe('escapeText (RFC 5545 §3.3.11)', () => {
  it.each([
    ['plain', 'plain'],
    ['a,b', 'a\\,b'],
    ['a;b', 'a\;b'],
    ['back\\slash', 'back\\\\slash'],
    ['line1\nline2', 'line1\\nline2'],
    ['crlf\r\nx', 'crlf\\nx'],
  ])('%j → %j', (input, out) => expect(escapeText(input)).toBe(out));
});

describe('foldLine (75-octet limit, §3.1)', () => {
  it('leaves short lines alone', () => expect(foldLine('SUMMARY:hi')).toBe('SUMMARY:hi'));

  it('folds long ASCII lines at 75 octets with CRLF + space', () => {
    const line = 'DESCRIPTION:' + 'x'.repeat(200);
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(2);
    parts.forEach((p) => expect(octets(p)).toBeLessThanOrEqual(75));
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(unfold(folded)).toBe(line);
  });

  it('never splits a multibyte character', () => {
    const line = 'SUMMARY:' + 'é😀'.repeat(40);
    const folded = foldLine(line);
    folded.split('\r\n').forEach((p) => expect(octets(p)).toBeLessThanOrEqual(75));
    expect(unfold(folded)).toBe(line);
    expect(folded).not.toContain('�');
  });
});

describe('buildIcs', () => {
  const timed: IcsEvent = {
    uid: 'ev1',
    summary: 'Interview: Acme, Inc; Design Engineer',
    date: '2026-10-15',
    time: '14:30',
    durationMin: 45,
    description: 'Bring portfolio\nAsk about team',
    url: 'https://acme.example/jobs/1',
  };
  const allDay: IcsEvent = { uid: 'fu1', summary: 'Follow up: Acme', date: '2026-10-31' };

  const ics = buildIcs([timed, allDay], { now: NOW, uidDomain: 'apply-board.test' });
  const lines = unfold(ics).split('\r\n');

  it('is a CRLF VCALENDAR with PRODID and VERSION, ending in CRLF', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('emits one VEVENT per event with a stable UID and DTSTAMP', () => {
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(lines).toContain('UID:ev1@apply-board.test');
    expect(lines.filter((l) => l === 'DTSTAMP:20261012T183005Z')).toHaveLength(2);
  });

  it('timed events use floating local DTSTART/DTEND with the duration', () => {
    expect(lines).toContain('DTSTART:20261015T143000');
    expect(lines).toContain('DTEND:20261015T151500');
  });

  it('all-day events use VALUE=DATE with an exclusive next-day DTEND', () => {
    expect(lines).toContain('DTSTART;VALUE=DATE:20261031');
    expect(lines).toContain('DTEND;VALUE=DATE:20261101');
  });

  it('escapes TEXT values and keeps URL raw', () => {
    expect(lines).toContain('SUMMARY:Interview: Acme\\, Inc\; Design Engineer');
    expect(lines).toContain('DESCRIPTION:Bring portfolio\\nAsk about team');
    expect(lines).toContain('URL:https://acme.example/jobs/1');
  });

  it('defaults timed duration to 60 minutes and rolls over midnight', () => {
    const late = buildIcs([{ uid: 'x', summary: 's', date: '2026-12-31', time: '23:30' }], {
      now: NOW,
    });
    expect(unfold(late)).toContain('DTEND:20270101T003000');
  });
});
