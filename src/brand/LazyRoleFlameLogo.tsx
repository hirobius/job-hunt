// The animated logo (RoleFlame.tsx) on demand: its engine is ~10 kB and the entry chunk is at its size
// budget, so the still wordmark shows at once and the animated one replaces it when its chunk lands.
// A chunk that fails to load leaves the still wordmark (importFresh raises the new-version notice).
import { lazy, Suspense, type ComponentProps } from 'react';
import { importFresh } from '../staleBuild';
import { Wordmark } from './Wordmark';

const RoleFlameLogo = lazy(
  importFresh(() => import('./RoleFlame').then((m) => ({ default: m.RoleFlameLogo }))),
);

export function LazyRoleFlameLogo(props: ComponentProps<typeof RoleFlameLogo>) {
  return (
    <Suspense fallback={<Wordmark still />}>
      <RoleFlameLogo {...props} />
    </Suspense>
  );
}
