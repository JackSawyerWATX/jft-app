# Contributing

## Setup

Use Node.js 24 LTS and npm. The runtime is pinned in `.nvmrc` and constrained by `package.json`.

```bash
nvm use
npm ci
npm run dev
```

This app requires no credentials. Never commit `.env` files, credentials, or personal recovery text.

## Commands

| Command                | Purpose                                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| `npm run dev`          | Start the local application                                               |
| `npm run format`       | Apply repository formatting                                               |
| `npm run format:check` | Check formatting without changing files                                   |
| `npm run lint`         | Check React, Next.js, TypeScript, and accessibility rules                 |
| `npm run test:e2e`     | Run mobile and desktop Chromium user-flow tests after building            |
| `npm test`             | Run automated tests                                                       |
| `npm run build`        | Produce and validate the production application                           |
| `npm run typecheck`    | Check TypeScript; build first on a fresh checkout to generate route types |
| `npm run check`        | Run the complete local verification used by CI                            |

Before opening or updating a PR:

```bash
npm run format
npm run check
```

`check` runs formatting, linting, unit tests, and the production build. Next.js 15 checks TypeScript during the build, so the sequence does not run the same type check again. `typecheck` remains available for focused development. It needs no credentials or external services once dependencies are installed. Separate scripts remain available for focused work.

## Organization and documentation

Group source by responsibility under `src/` and mirror those groups under `tests/`. Use direct imports, with no barrel files or path aliases. Keep abstractions proportional to the current milestone.

Prettier owns formatting; `.editorconfig` supplies matching editor defaults. Use TSDoc for exported functions and types, explaining contracts and escaping failures. Update the README for user-visible behavior, `docs/ARCHITECTURE.md` for design changes, and [the shared glossary](docs/DATA_GLOSSARY.md) when data terminology changes.

## Testing

Add or update meaningful tests when behavior changes. Use fictional text and synthetic credentials in fixtures and test output. Do not call live model providers or external services from the default test command.

For UI changes, manually check phone and desktop layouts, keyboard use, and error states. Report manual verification separately from automated tests. CI also runs `npm run test:e2e` after installing Chromium; locally, use the browser setup commands in the README. See the README for the manual checklist.

## Pull requests and merging

Use a focused branch and the PR template's Summary, Validation, and Limitations sections. State what was actually tested and disclose anything unverified. PR titles follow Conventional Commits: `type(optional-scope): description`.

Allowed types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, and `revert`. Single-commit PRs must also have a conventional commit message. Additional review commits need no history rewriting.

Use **Squash and merge** with the validated PR title as the commit title. Follow the [repository settings policy](docs/REPOSITORY_STANDARDS.md#4-repository-settings) once configured. No automatic merging is enabled by this PR.

## Dependency maintenance

Commit `package-lock.json` and install with `npm ci`. Review dependency changes and merge manually after checks pass. See [shared repository standards](docs/REPOSITORY_STANDARDS.md#7-dependency-and-security-maintenance) for the update schedule, grouping, and security-check policy. Those cross-repository decisions are maintained there rather than repeated here.
