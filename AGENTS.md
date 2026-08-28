<!-- intent-skills:start -->
## Skill Loading

Before editing files for a substantial task:
- Run `npx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `npx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

## Test ownership

- Production code belongs in each workspace's `src/`.
- Tests belong in that workspace's `test/`.
- Do not create `__tests__` directories or place `*.test.ts` or `*.test.tsx` under `src/`.
- Organize tests primarily by feature/source ownership; create separate categories only when execution or infrastructure differs.
- Root `test/` is reserved for true cross-workspace E2E/system tests.
- Test scripts should use discovery instead of explicit test-file inventories.

# Code formatting

Prettier is the authoritative formatter for this repository.

After modifying supported source files:

1. Run `npm run format`.
2. Run `npm run format:check`.
3. Do not manually fight or override Prettier formatting.
4. Do not finish a coding task while `npm run format:check` fails.

Before reporting completion of an implementation task, run:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- relevant tests

If formatting fails, run `npm run format` and re-run the checks.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
