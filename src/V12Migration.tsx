// Runs the v11 → v12 move (v12Migration.ts) after sync settles, so a profile made on another
// device arrives first, and again whenever the old screens change a v11 store (the add-only
// top-up). The one time it makes the profile, it offers the links that are not boards as a .txt.
// The move's module loads on demand: it pulls in the feed's source list.
import { useEffect } from 'react';
import { useToast } from '@hirobius/design-system';
import { useCloudSync } from './account/accountContext';
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

export default function V12Migration() {
  const { settled } = useCloudSync();
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
    void loadMove().then(
      ({ runV12Move, linksText, linksNotice }) => {
        if (!live) return;
        const { moved, links } = runV12Move();
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
