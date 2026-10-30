// The shell's sheets that most visits never open, loaded whole on their first open (#368 pass):
// Follow up, Add interview and Recently removed. Each stays mounted once loaded, so a second open
// is instant and behaves as before. A chunk that won't load closes the sheet (useLoadedWhen).
import { closeFollowUp, useFollowUpTarget } from './followUpFlow';
import {
  closeAddInterview,
  closeRecentlyRemoved,
  useAddInterviewTarget,
  useRecentlyRemovedOpen,
} from './jobDialogs';
import { AddInterviewHost, FollowUpHost, RecentlyRemovedHost, useLoadedWhen } from './lazyDialogs';

export function LazyFollowUpHost() {
  const ready = useLoadedWhen(FollowUpHost, useFollowUpTarget() !== null, closeFollowUp);
  return ready ? <FollowUpHost /> : null;
}

export function LazyAddInterviewHost() {
  const ready = useLoadedWhen(
    AddInterviewHost,
    useAddInterviewTarget() !== null,
    closeAddInterview,
  );
  return ready ? <AddInterviewHost /> : null;
}

export function LazyRecentlyRemovedHost() {
  const ready = useLoadedWhen(RecentlyRemovedHost, useRecentlyRemovedOpen(), closeRecentlyRemoved);
  return ready ? <RecentlyRemovedHost /> : null;
}
