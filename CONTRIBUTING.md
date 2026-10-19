# Contributing

## Setup

Use Node.js 24 LTS and npm. The runtime is pinned in `.nvmrc` and constrained by `package.json`.

```bash
nvm use
npm ci
npm run dev
```

Development generates an ephemeral anonymous-session signing secret. Production requires a random `SESSION_SECRET` of at least 32 bytes; see the README. Never commit `.env` files, credentials, or personal recovery text.

## Commands

| Command                    | Purpose                                                                   |
| -------------------------- | ------------------------------------------------------------------------- |
| `npm run dev`              | Start the local application                                               |
| `npm run format`           | Apply repository formatting                                               |
| `npm run format:check`     | Check formatting without changing files                                   |
| `npm run lint`             | Check React, Next.js, TypeScript, and accessibility rules                 |
| `npm run test:e2e`         | Run mobile and desktop Chromium user-flow tests after building            |
| `npm test`                 | Run automated tests                                                       |
| `npm run build`            | Produce and validate the production application                           |
| `npm run typecheck`        | Check TypeScript; build first on a fresh checkout to generate route types |
| `npm run openapi:generate` | Generate temporary `.tmp/openapi.yaml` from TypeScript                    |
| `npm run openapi:lint`     | Generate and lint temporary YAML with Spectral; warnings fail             |
| `npm run check`            | Run the complete local verification used by CI                            |

Before opening or updating a PR:

```bash
npm run format
npm run check
```

`check` runs formatting, linting, OpenAPI generation/Spectral checks, unit tests, and the production build. Next.js 16 checks TypeScript during the build, so the sequence does not run the same type check again. `typecheck` remains available for focused development. It needs no credentials or external services once dependencies are installed. Separate scripts remain available for focused work.

## Organization and documentation

Group source by responsibility under `src/` and mirror those groups under `tests/`. Use direct imports, with no barrel files or path aliases. Keep abstractions proportional to the current milestone.

ESLint uses Next.js 16’s native flat configurations for Core Web Vitals and TypeScript; keep `eslint-config-next` aligned with the Next.js major version. Prettier owns formatting; `.editorconfig` supplies matching editor defaults. Use TSDoc for exported functions and types, explaining contracts and escaping failures. Document meaningful parameters, return values, ownership/trust requirements, and side effects at the source. For asynchronous functions, `@throws` describes promise rejections; for Route Handlers and wrappers that catch errors, document returned HTTP failures under `@returns`. Keep presentation-component comments proportional to their state/callback responsibilities rather than repeating markup.

When updating a feature, review its documentation together:

- README: user-visible behavior, local setup, configuration, limitations, and verification entry points.
- [Architecture](docs/ARCHITECTURE.md): module ownership, request/data flow, security decisions, and operational tradeoffs.
- [API reference](docs/API.md): supported requests/responses, error codes/statuses, session/cookie behavior, and runnable fictional examples. Update the operation contracts/handlers in `src/shares/server/operations/` and resource-level method handling in `resource-methods.ts`, the shared OpenAPI helpers in `openapi.ts`, and shared Zod schemas together; `/api/openapi.json` is generated from them, not hand-edited. `npm run openapi:lint` generates ignored `.tmp/openapi.yaml` and lints it using `.spectral.yaml` (`spectral:oas`, warnings fail). TypeScript definitions are the sole source of truth; generated YAML is not committed and has no drift check. The existing Verify workflow runs this through `npm run check` and uploads the generated contract as the `openapi` artifact (retained for seven days). Swagger Parser and Ajv separately validate the document and actual responses.
- [Shared glossary](docs/DATA_GLOSSARY.md): data location, transmission, access loss, deletion, and backup lifecycle.
- Source TSDoc: exported contracts and failures, including methods of exported interfaces. Name internal invariants when a parser or security check depends on them.

Keep each detailed contract in its owning document and link to it from summaries. Check examples/links against the implementation, remove stale milestone claims, and distinguish manual verification from automated checks in the PR. Generated Next.js declarations should come from the build, not manual edits. `next dev` also maintains the framework-owned block in [AGENTS.md](AGENTS.md); preserve it and consult the installed Next.js guides it points to. Keep project documentation policy here rather than inside that managed block.

## Testing

Add or update meaningful tests when behavior changes. Use fictional text and synthetic credentials in fixtures and test output. Do not call live model providers or external services from the default test command.

For UI changes, manually check phone and desktop layouts, keyboard use, and error states. Report manual verification separately from automated tests. CI also runs `npm run test:e2e` after installing Chromium; locally, use the browser setup commands in the README. See the README for the manual checklist.

## Pull requests and merging

Use a focused branch and the PR template's Summary, Validation, and Limitations sections. State what was actually tested and disclose anything unverified. PR titles follow Conventional Commits: `type(optional-scope): description`.

Allowed types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, and `revert`. Single-commit PRs must also have a conventional commit message. Additional review commits need no history rewriting.

Use **Squash and merge** with the validated PR title as the commit title. Follow the [repository settings policy](docs/REPOSITORY_STANDARDS.md#4-repository-settings) once configured. A maintainer reviews and merges; do not enable automatic merging as part of routine implementation work.

## Dependency maintenance

Commit `package-lock.json` and install with `npm ci`. Review dependency changes and merge manually after checks pass. See [shared repository standards](docs/REPOSITORY_STANDARDS.md#7-dependency-and-security-maintenance) for the update schedule, grouping, and security-check policy. Those cross-repository decisions are maintained there rather than repeated here.
