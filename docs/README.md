# docs

Start with the [README](../README.md), [CONTRIBUTING](../CONTRIBUTING.md) and the domain words in
[CONTEXT](../CONTEXT.md). Then:

| Folder or file                                                                                                           | What it holds                                                                                |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| [`agent/`](agent/README.md)                                                                                              | How the app works today, one area per file. The rules in `CLAUDE.md` link here.              |
| [`adr/`](adr/README.md)                                                                                                  | Architecture decisions, in order. Read them before you change a decision.                    |
| [`figma/`](figma/README.md)                                                                                              | The visual rules for the Figma agent (`FIGMA-RULES.md`, pinned by `src/figmaRules.test.ts`). |
| [`hds-upstream-asks-0.9.md`](hds-upstream-asks-0.9.md), [`hds-upstream-asks/`](hds-upstream-asks)                        | Every local HDS workaround and what HDS must ship to remove it.                              |
| [`guardrails.md`](guardrails.md)                                                                                         | The layout rules and screenshot baselines (`npm run verify:ui`).                             |
| [`ci/`](ci/README.md)                                                                                                    | Smoke checks, rollback and the proposed workflows (agents never edit `.github/workflows`).   |
| [`supabase-setup.md`](supabase-setup.md), [`secrets.md`](secrets.md), [`resend-smtp-runbook.md`](resend-smtp-runbook.md) | Backend set-up and runbooks.                                                                 |
| [`board-discovery-refresh.md`](board-discovery-refresh.md), [`daily-picks.md`](daily-picks.md)                           | The feed's scheduled jobs.                                                                   |
| [`delete-list.md`](delete-list.md)                                                                                       | The dead-code list, pinned by `src/deleteList.test.ts`.                                      |
| [`specs/`](specs), [`research/`](research)                                                                               | The specs and source research behind shipped work. Historical: the code and `agent/` win.    |
| [`screenshots/`](screenshots), [`images/`](images)                                                                       | Images that the README, the PWA manifest and the docs use.                                   |

Old plans, review shots and case-study pages were removed on 2026-11-19 (they described screens
that are gone). They stay in git history.
