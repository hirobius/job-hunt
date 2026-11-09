// Runs the v11 → v12 move (v12Migration.ts) after sync settles, so a profile made on another
// device arrives first, and again whenever the old screens change a v11 store (the add-only
// top-up). The one time it makes the profile, it offers the links that are not boards as a .txt.
// With no profile after the move (a new user, or no design-systems track to make one from), the
// design-systems profile is made on its own (`ensureProfile`, Adrian 2026-10-29: no setup screen).
// The move's module loads on demand: it pulls in the feed's source list.
import { useEffect } from 'react';
import { useToast } from '@hirobius/design-system';
import { canWrite, useCloudSync } from './account/accountContext';
import { useCategories, useGroups, useTiles } from './curation/curationStore';
import { useAllMustInclude } from './feed/mustInclude';
import { useAllDreams } from './feed/dreams';
import { useAllTargets } from './feed/targets';
import { useAllSweeps } from './feed/sweepTitles';
import { useJobs } from './store';
import { download } from './download';
import { linksFilename } from './exportLinks';
import { importFresh } from './staleBuild';

const loadMove = importFresh(() => import('./v12Migration'));
// The default profile pulls in the starter company list: on demand too (entryChunk.test.ts).
const loadDefaults = importFresh(() => import('./searchDefaults'));

export default function V12Migration() {
  // Never in a tab stopped by another tab, nor before the cloud copy is here (#517 review): the
  // default profile would land in shared storage over the account's own.
  const settled = canWrite(useCloudSync());
  const { toast } = useToast();
  const categories = useCategories();
  const groups = useGroups();
  const tiles = useTiles();
  const mustInclude = useAllMustInclude();
  const jobs = useJobs();
  const dreams = useAllDreams();
  const targets = useAllTargets();
  const sweeps = useAllSweeps();
  useEffect(() => {
    if (!settled) return;
    let live = true;
    void Promise.all([loadMove(), loadDefaults()]).then(
      ([{ runV12Move, linksText, linksNotice }, { ensureProfile }]) => {
        if (!live) return;
        const { moved, links } = runV12Move();
        ensureProfile();
        if (!moved || !links.length) return;
        toast({
          title: linksNotice(links.length),
          tone: 'info',
          duration: 15000,
          actions: [
            {
              label: 'Download links',
              onSelect: () => download(linksFilename(new Date()), linksText(links)),
            },
          ],
        });
      },
      () => {}, // a stale chunk says so itself (importFresh); the next change tries again
    );
    return () => {
      live = false;
    };
  }, [settled, categories, groups, tiles, mustInclude, jobs, dreams, targets, sweeps, toast]);
  return null;
}
