import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LEDGER_SQL,
  applySql,
  localImports,
  orderProblems,
  planDeploy,
  touchesFunction,
} from './supabaseDeploy';

const A = '20261111100000_postings_all_board_kinds.sql';
const B = '20261111100100_sync_feeds_twice_a_day.sql';
const C = '20261111100200_board_suggestions.sql';

describe('planDeploy (#596)', () => {
  it('applies only files not in the ledger, in file-name order, before the function', () => {
    expect(
      planDeploy({
        files: [C, A, B],
        applied: [A],
        order: { afterFunction: [] },
        functionChanged: false,
      }),
    ).toEqual({ before: [B, C], deployFunction: false, after: [] });
  });

  it('runs deploy-order.json files after the function, and forces the deploy (#583 order)', () => {
    expect(
      planDeploy({
        files: [A, B, C],
        applied: [],
        order: { afterFunction: [B] },
        functionChanged: false,
      }),
    ).toEqual({ before: [A, C], deployFunction: true, after: [B] });
  });

  it('nothing new and no function change: nothing to do', () => {
    expect(
      planDeploy({
        files: [A],
        applied: [A],
        order: { afterFunction: [] },
        functionChanged: false,
      }),
    ).toEqual({ before: [], deployFunction: false, after: [] });
  });
});

describe('orderProblems', () => {
  it('stops on a bad file name or an order entry with no file', () => {
    expect(orderProblems([A, 'Bad Name.sql'], { afterFunction: ['20990101_missing.sql'] })).toEqual(
      [
        'not a migration name: Bad Name.sql',
        'deploy-order.json names a missing file: 20990101_missing.sql',
      ],
    );
  });

  it('every migration in the repo has a name the CI accepts, and the order file is valid', () => {
    const files = fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
    const order = JSON.parse(fs.readFileSync('supabase/deploy-order.json', 'utf8'));
    expect(orderProblems(files, order)).toEqual([]);
  });
});

describe('function change detection', () => {
  it('reads static, re-export and dynamic relative imports, not packages', () => {
    const src = `import { a } from '../../src/a.ts';
import type { B } from "./b.ts";
export { c } from '../c.ts';
const d = await import('./d.ts');
import x from 'npm:@supabase/supabase-js@2';
import data from '../../../src/feed/data/boards.json' with { type: 'json' };`;
    expect(localImports(src).sort()).toEqual(
      [
        '../../src/a.ts',
        './b.ts',
        '../c.ts',
        './d.ts',
        '../../../src/feed/data/boards.json',
      ].sort(),
    );
  });

  it('a change in the import graph or the function folder counts; an app-only change does not', () => {
    const graph = new Set(['src/tracks/plan.ts']);
    expect(touchesFunction(['src/tracks/plan.ts'], graph)).toBe(true);
    expect(touchesFunction(['supabase/functions/sync-postings/README.md'], graph)).toBe(true);
    expect(touchesFunction(['src/App.tsx', 'README.md'], graph)).toBe(false);
  });

  it('the real function entry imports repo files the walk can follow', () => {
    const entry = fs.readFileSync('supabase/functions/sync-postings/index.ts', 'utf8');
    expect(localImports(entry).some((s) => s.includes('src/tracks/'))).toBe(true);
  });
});

describe('the ledger and the transaction', () => {
  it('wraps one migration and its ledger row in one transaction', () => {
    const sql = applySql(A, 'alter table x add column y int;', 'abcdef1');
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.trim().endsWith('commit;')).toBe(true);
    expect(sql).toContain(
      `insert into ops.deployed_migrations (file, sha) values ('${A}', 'abcdef1');`,
    );
  });

  it('refuses a name or sha that could break out of the SQL', () => {
    expect(() => applySql("x');drop table y;--.sql", '', 'abcdef1')).toThrow('bad migration name');
    expect(() => applySql(A, '', "abc'; --")).toThrow('bad sha');
  });

  it('keeps its own ledger, never schema_migrations, closed to the API roles', () => {
    expect(LEDGER_SQL).toContain('revoke all on schema ops from public, anon, authenticated;');
    const src = fs.readFileSync('scripts/supabase-deploy.ts', 'utf8');
    expect(src + LEDGER_SQL).not.toMatch(/schema_migrations/);
  });
});

describe('the script and the workflow', () => {
  const script = fs.readFileSync('scripts/supabase-deploy.ts', 'utf8');
  const yml = fs.readFileSync('docs/ci/proposed-supabase-deploy.yml', 'utf8');

  it('writes only inside GitHub Actions, and keeps the JWT check off', () => {
    expect(script).toContain("process.env.GITHUB_ACTIONS !== 'true'");
    expect(script).toContain("'--no-verify-jwt'");
    expect(script).toMatch(/const CLI = 'supabase@\d+\.\d+\.\d+';/);
  });

  it('runs after ci passes on main, one at a time, behind an environment', () => {
    expect(yml).toMatch(/workflow_run:\s*\n\s*workflows: \[ci\]/);
    expect(yml).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(yml).toContain('cancel-in-progress: false');
    expect(yml).toContain('environment: supabase-production');
    expect(yml).toContain('secrets.SUPABASE_ACCESS_TOKEN');
  });
});
