// The one "A new version is ready" notice (staleBuild.ts), rendered once in the shell: an HDS Toast
// that stays until Reload or Dismiss, raised the first time a late chunk fails to load.
import { useEffect, useRef } from 'react';
import { useToast } from '@hirobius/design-system';
import { reloadForNewVersion, STALE_MSG, useStaleBuild } from './staleBuild';

export default function StaleBuildNotice({ reload }: { reload?: () => void }) {
  const stale = useStaleBuild();
  const { toast } = useToast();
  const shown = useRef(false);
  useEffect(() => {
    if (!stale || shown.current) return;
    shown.current = true;
    toast({
      title: STALE_MSG,
      tone: 'info',
      duration: Infinity,
      actions: [{ label: 'Reload', onSelect: () => reloadForNewVersion(reload) }],
    });
  }, [stale, toast, reload]);
  return null;
}
