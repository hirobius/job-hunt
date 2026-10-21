// A follow-up or event day as the Pipeline writes it (shared by the agenda and Apply mode).
import { ymd } from './jobEvents';

/** "Today", "Tomorrow", else "Fri, Oct 16". */
export function dayLabel(date: string, now: Date) {
  if (date === ymd(now)) return 'Today';
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (date === ymd(tomorrow)) return 'Tomorrow';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
