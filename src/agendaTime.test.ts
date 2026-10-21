import { describe, expect, it } from 'vitest';
import { timeLabel } from './agendaTime';

describe('timeLabel', () => {
  it('formats a stored 24h HH:mm the way the dates read (US, 12h)', () => {
    expect(timeLabel('14:00')).toBe('2:00 PM');
    expect(timeLabel('09:05')).toBe('9:05 AM');
  });
  it('says "all day" without a time and keeps an unreadable one as typed', () => {
    expect(timeLabel(undefined)).toBe('all day');
    expect(timeLabel('noonish')).toBe('noonish');
  });
});
