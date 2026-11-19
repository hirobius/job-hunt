// lucide-react is imported by the app (icons beside HDS components), so package.json declares it
// (#818). It must stay the version HDS itself depends on: two copies would ship two icon sets and
// HDS's Icon would size a different lucide than the app's. An HDS upgrade that moves lucide fails
// here until package.json follows.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

describe('lucide-react pin', () => {
  it('package.json declares lucide-react at the version HDS depends on', () => {
    const app = json('package.json');
    const hds = json('node_modules/@hirobius/design-system/package.json');
    const want = hds.dependencies?.['lucide-react'] ?? hds.peerDependencies?.['lucide-react'];
    expect(want).toBeTruthy();
    expect(app.dependencies['lucide-react']).toBe(want);
  });
});
