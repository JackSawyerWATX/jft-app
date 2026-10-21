# Doorknob v0.2

Doorknob is a mobile-first recovery reflection app. Read a daily reflection, write a text share, save it privately through the Next.js Backend for Frontend (BFF), and revisit past shares.

## Getting started

Use Node.js **24 LTS**, pinned in `.nvmrc`:

```bash
nvm use
npm ci
npm run dev
```

Open http://localhost:3000. Local development needs no credentials: a random session signing secret is generated for the running process. Optionally set `SESSION_SECRET` to a random value of at least 32 bytes in `.env.local`. Never commit secrets or personal recovery text.

For a production-mode local run, create `.env.local` first:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the generated value into `.env.local` as `SESSION_SECRET=<generated value>`, then run:

```bash
npm run build
npm start
```

Production requires this secret and sets Secure cookies. Missing or short production secrets cause API requests to return a generic 500; the app does not supply a production fallback. A signing-key change invalidates existing cookies. Use HTTPS when hosting; browser handling of Secure cookies on plain HTTP localhost can vary. Use `npm run dev` for ordinary local development.

## Writing and reviewing shares

1. Read the reflection and write in the multiline textbox.
2. Choose **Save privately**. Confirmation appears only after the server saves your text.
3. Open **Past shares** to browse newest first, then select an entry to fetch and read it in full.

Blank shares cannot be saved. Text is limited to 10,000 Unicode code points, and the full JSON request is limited to 64 KiB. Oversized-input failures retain the draft for editing. Navigating between views preserves drafts. Failed saves retain your words and show an error. Pending saves disable editing and duplicate submissions. History and detail requests have loading and error feedback; failed history requests can be retried.

The reading and April 23, 2025 date remain deliberate placeholders.

## Persistence and privacy limitations

Shares are sent to the same-origin Next.js server and stored in a process-local Map. Each record has a server-generated UUID, ISO timestamp, `kind: 'text'`, text, reading snapshot, and anonymous owner ID in the server record. Share JSON omits the ownerId field. There is no browser storage persistence or migration of v0.1 test data.

A signed, HttpOnly, SameSite=Lax cookie identifies the anonymous session. It expires after 30 days and is Secure in production. Different browser sessions cannot list or read one another's shares. Invalid or expired credentials receive 401. Clear site cookies to start a fresh session if this occurs; **clearing cookies loses access to existing shares**, even while those records remain in server memory. The signed cookie is readable, not encrypted, and must be treated as a bearer credential. Tabs sharing site cookies share an owner; use separate profiles/cookie jars to test isolation. Cookies do not provide login accounts or recovery. Saving waits for a successful initial session read; initialization failures retain the draft and offer retry. Foreign-origin POSTs are rejected before session creation and never replace the cookie. This prototype now uses Hono’s signed-cookie format; clear any cookie from the earlier development implementation if it receives 401. There is no cookie migration.

**This storage is for local development. Restarting the server clears all shares. Multiple processes, replicas, and serverless instances such as Vercel do not share the Map and cannot provide reliable persistence.** No disk storage, database, encryption at rest, backup, account recovery, or durable deployment is provided. Unsaved drafts live only in React memory and disappear on refresh. The development signing secret also resets on process restart unless configured. There is no per-share deletion or expiry job; cookie loss does not remove records from the running Map. See [the data lifecycle](docs/DATA_GLOSSARY.md#app-data-lifecycle).

No public sharing links, audio, transcription, AI, registration, real reading feeds, or harness integration are included.

## Validation

```bash
npm run check
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

`check` runs formatting, lint, Node tests, and a production build including TypeScript validation. Browser tests run separately against a production server on port 3100 with a synthetic signing secret. All test content is fictional. If Chromium is not installed:

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

Omit `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when using Playwright's installed browser. Tests validate the generated OpenAPI document and actual responses with Swagger Parser and Ajv. They cover HTTP headers/methods, stable error codes, input-size boundaries, API validation and metadata, ownership/session credential checks, save/reload/detail flows, ordering, API failures, draft retention, duplicate prevention, loading, and empty history in mobile and desktop Chromium.

Manual checks:

1. Confirm blank text cannot be saved. Navigate between views and confirm an unfinished draft remains.
2. Save a multiline share, refresh, and reopen it from **Past shares**.
3. Open a separate private browser session and confirm its history is empty and the first session's share ID returns 404.
4. Simulate a failed POST in browser developer tools; verify the draft remains with no confirmation.
5. Check phone and desktop layouts, keyboard navigation, and heading focus.
6. Restart the server and confirm history is empty. Clear cookies and confirm previous shares are inaccessible.

## Project layout

```text
src/
  app/                  App Router entry, layout, theme
    api/shares/         Next.js exports for private share operations
    api/openapi.json/   generated OpenAPI 3.1 contract
  components/           app-wide header and footer
  shares/
    share-app.tsx       React state, requests, and screen transitions
    api.ts              browser fetch and response validation
    components/         reading, form, history, and detail presentation
    model.ts            shared Zod schemas, inferred types, and text limit
    reflection-fixture.ts fictional daily reading
    errors.ts           shared stable error codes and envelope
    server/
      operations/       create, list, read contracts and typed handlers
      resource-methods.ts HEAD/OPTIONS/405 handling for share resources
      app.ts            operation registration and dispatch
      openapi.ts        shared contract helpers and metadata
    use-share-history.ts History loading and initial session bootstrap
    dates.ts            saved-date formatting
tests/
  shares/               Node tests for schemas, routes, repository, and dates
  e2e/                  Playwright user flows
```

Open http://localhost:3000/api/openapi.json for the generated contract. TypeScript route/Zod definitions are the source of truth. `npm run openapi:lint` generates ignored `.tmp/openapi.yaml` and checks it with Spectral; CI also uploads the YAML as the `openapi` workflow artifact. Generated YAML is not committed.

See [the private API reference and curl example](docs/API.md), [architecture](docs/ARCHITECTURE.md), [contributor commands](CONTRIBUTING.md#commands), [repository standards](docs/REPOSITORY_STANDARDS.md), and [data glossary](docs/DATA_GLOSSARY.md).

## Installation troubleshooting

This project uses public npm packages and does not require npm login. If `npm ci` returns E401 on a machine configured for a private company registry, try:

```bash
npm ci --registry=https://registry.npmjs.org/
```

A failed installation leaves `next` unavailable, so fix the install before running `npm run dev`. Do not commit registry credentials or change shared company authentication to run this app.

### npm warnings

If npm reports unknown user config `always-auth`, remove only the obsolete
registry-scoped setting from your user configuration:

```bash
npm config delete '//us-npm.pkg.dev/gcp-hopper-cicd/npm-main/:always-auth' --location=user
```

Keep registry URLs and authentication tokens intact. This setting lives outside
this repository and cannot be fixed by reinstalling project dependencies.

ESLint stays on version 9 because the React, import, and accessibility plugins in
Next.js's lint configuration do not support ESLint 10 yet. npm may report that
ESLint 9 is deprecated; moving to 10 currently produces peer dependency conflicts.

The `allowScripts` policy permits native tool setup for esbuild, fsevents (macOS),
and unrs-resolver, and denies Scarf's analytics postinstall. npm versions supporting
this policy can install without asking to approve these packages individually.

As of October 18, 2026, npm audit reports six high-severity findings from one
unpatched `braces` dependency chain in the development ESLint and Spectral tooling. The latest
published braces version is 3.0.3, which remains affected. Do not use
`npm audit fix --force`: its proposed Next.js lint configuration downgrade is not
a compatible fix for this project. Revisit when the upstream tooling is patched.
