# Contributing

## Setup

Use Node.js 24 LTS and npm. The runtime is pinned in `.nvmrc` and constrained by `package.json`.

```bash
nvm use
npm ci
npm run dev
```

Development generates an ephemeral session signing secret. Optional live transcription needs server-only OpenAI configuration; see [transcription deployment](docs/TRANSCRIPTION.md). Builds and mocked tests require no provider credentials. Production requires a random `SESSION_SECRET` of at least 32 bytes; sharing links use the random share UUID and need no separate secret. See the README. Never commit `.env` files, credentials, or personal recovery text.

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

Group source by responsibility under `src/` and mirror those groups under `tests/`. Use direct imports, with no barrel files or path aliases. Keep abstractions proportional to the current milestone. Share UI is grouped into `composer/` (including `recording/`), `history/`, `detail/`, and `reflection/`; keep adapter/lifecycle code in `transcription/` and backend operations in `server/`.

ESLint uses Next.js 16’s native flat configurations for Core Web Vitals and TypeScript; keep `eslint-config-next` aligned with the Next.js major version. Prettier owns formatting; `.editorconfig` supplies matching editor defaults. Use TSDoc for exported functions and types, explaining contracts and escaping failures. Document meaningful parameters, return values, ownership/trust requirements, and side effects at the source. For asynchronous functions, `@throws` describes promise rejections; for Route Handlers and wrappers that catch errors, document returned HTTP failures under `@returns`. Keep presentation-component comments proportional to their state/callback responsibilities rather than repeating markup.

When updating a feature, review its documentation together:

- README: user-visible behavior, local setup, configuration, limitations, and verification entry points.
- [Architecture](docs/ARCHITECTURE.md): module ownership, request/data flow, security decisions, and operational tradeoffs.
- [API reference](docs/API.md): supported requests/responses, error codes/statuses, session/cookie behavior, and runnable fictional examples. Update the operation contracts/handlers in `src/shares/server/operations/` and resource-level method handling in `resource-methods.ts`, the shared OpenAPI helpers in `openapi.ts`, and shared Zod schemas together; `/api/openapi.json` is generated from them, not hand-edited. `npm run openapi:lint` generates ignored `.tmp/openapi.yaml` and lints it using `.spectral.yaml` (`spectral:oas`, warnings fail). TypeScript definitions are the sole source of truth; generated YAML is not committed and has no drift check. The existing Verify workflow runs this through `npm run check` and uploads the generated contract as the `openapi` artifact (retained for seven days). Swagger Parser and Ajv separately validate the document and actual responses.
- [Shared glossary](docs/DATA_GLOSSARY.md): data location, transmission, access loss, deletion, and backup lifecycle.
- Source TSDoc: exported contracts and failures, including methods of exported interfaces. Name internal invariants when a parser or security check depends on them.

Keep each detailed contract in its owning document and link to it from summaries. Check examples/links against the implementation, remove stale milestone claims, and distinguish manual verification from automated checks in the PR. Generated Next.js declarations should come from the build, not manual edits. `next dev` also maintains the framework-owned block in [AGENTS.md](AGENTS.md); preserve it and consult the installed Next.js guides it points to. Keep project documentation policy here rather than inside that managed block.

## Testing

Add or update meaningful tests when behavior changes. `npm test` runs server-bound tests with the React server condition, then client hook tests in `tests/shares/transcription/client/` in a separate process using React Testing Library and jsdom. Draft-cleanup hook tests in `tests/shares/cleanup/client/` run in a third client process. Keep browser/provider-independent hook tests out of the server-bound test group. Use fictional text and synthetic credentials in fixtures and test output. Do not call live model providers or external services from the default test command.

For UI changes, manually check phone and desktop layouts, keyboard use, and error states. Report manual verification separately from automated tests. CI also runs `npm run test:e2e` after installing Chromium; locally, use the browser setup commands in the README. See the README for the manual checklist.

## Pull requests and merging

Use a focused branch and the PR template's Summary, Validation, and Limitations sections. State what was actually tested and disclose anything unverified. PR titles follow Conventional Commits: `type(optional-scope): description`.

Allowed types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, and `revert`. Single-commit PRs must also have a conventional commit message. Additional review commits need no history rewriting.

Use **Squash and merge** with the validated PR title as the commit title. Follow the [repository settings policy](docs/REPOSITORY_STANDARDS.md#4-repository-settings) once configured. A maintainer reviews and merges; do not enable automatic merging as part of routine implementation work.

## Dependency maintenance

Commit `package-lock.json` and install with `npm ci`. Review dependency changes and merge manually after checks pass. See [shared repository standards](docs/REPOSITORY_STANDARDS.md#7-dependency-and-security-maintenance) for the update schedule, grouping, and security-check policy. Those cross-repository decisions are maintained there rather than repeated here.

## Browser quality checks

`npm run test:e2e` runs mobile and desktop projects for Chromium and WebKit against a production build, with two workers. The harness runs Next on HTTP port 3101 behind a loopback-only HTTPS proxy on port 3100 so every engine exercises production Secure cookies. OpenSSL generates an ephemeral self-signed localhost certificate at startup; certificate files are deleted immediately after loading. Only the isolated browser/API test contexts ignore that test certificate; application cookie security and package/browser download verification are unchanged. Independently created browser contexts must use `ignoreHTTPSErrors: true` for this localhost fixture. Install engines with `npx playwright install --with-deps chromium webkit`; run `npm run build` first. For one engine:

```bash
npm run test:e2e -- --project=mobile-chromium --project=desktop-chromium
npm run test:e2e -- --project=mobile-webkit --project=desktop-webkit
```

WebKit is Safari-engine coverage on Linux, not physical iOS microphone or permission testing. Keep the [device checks](docs/MICROPHONE_TESTING.md) for real audio, interruption and final-word behavior. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` overrides Chromium only; it never changes WebKit's executable.

All browser specs import `test`/`expect` from `tests/e2e/fixtures/test.ts`. Its automatic guard fails on uncaught page exceptions, hydration errors/warnings and unexpected console errors. It records redacted categories rather than raw messages. HTTP resource diagnostics are excluded only when matched to an observed failed document/fetch/XHR response; intentional API failure behavior is asserted in endpoint tests. Missing assets/network failures still fail. The isolated error-page test narrowly allows React's production Server Components failure (including the installed version's minified code #441); other tests have no such exception. Intentional exceptions require a test-local pattern, error kind and written reason. New pages in independently created browser contexts must call the `watchPage` fixture before navigation.

`accessibility.spec.ts` runs axe WCAG A/AA scans on writing, listening, Tidying, editable results, saved previews/expanded thoughts, manual copying, history hover and recipient pages. Fix violations rather than globally disabling rules. Automated scans supplement keyboard, screen-reader and physical-device testing.

The HTML report is written to ignored `playwright-report/`; inspect it with `npx playwright show-report`. CI uploads this directory for failed browser jobs, retained for seven days. Use only fictional fixtures: reports and assertion contexts can contain test text and synthetic link IDs. Traces, screenshots and video are disabled. Never run this suite against real reflections or inject live provider credentials; the isolated server sets `STT_ENABLED=false` and browser provider requests require mocks.

The Checks workflow runs on pull requests and main pushes. PR runs use a concurrency group per PR, avoiding duplicate branch/PR runs. It cancels superseded runs without making the aggregate Verify check report a false failure. Runners are pinned to Ubuntu 24.04 for repeatable browser dependencies. It separates code/contracts from Chromium and WebKit jobs, and keeps the existing `Verify` status as an aggregate gate: both engines and code checks must pass. No branch-protection status rename is required. Browser jobs build their own isolated production app; compiled apps are not retained as artifacts. Provider quality evaluations and OpenAPI compatibility comparisons remain separate future work.
