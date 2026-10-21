// An event's stored time ("14:00", HH:mm) as the agenda shows it, in the same US style as its
// date: "2:00 PM". No time means all day; anything unreadable is shown as typed.
export function timeLabel(time: string | undefined): string {
  if (!time) return 'all day';
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return time;
  return new Date(2000, 0, 1, Number(m[1]), Number(m[2])).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}
