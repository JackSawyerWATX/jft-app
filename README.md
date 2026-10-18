# Doorknob v0.1

Doorknob is a mobile-first recovery reflection app. Read a daily reflection, write a text share, save it privately in this browser, and revisit past shares.

## Getting started

Use Node.js **24 LTS**, pinned in `.nvmrc` and required by `package.json`:

```bash
nvm use
npm ci
npm run dev
```

Open http://localhost:3000. No credentials or environment variables are required.

For a production run:

```bash
npm run build
npm start
```

## Writing and reviewing shares

1. Read the reflection and write in the multiline textbox.
2. Choose **Save privately** to see the confirmation and saved text.
3. Open **Past shares** to browse newest first, then select an entry to read it in full.

Blank or whitespace-only shares cannot be saved. Navigating between views preserves an unfinished draft. A failed save keeps the draft and shows an error; malformed stored history is never silently replaced.

The reading and April 23, 2025 date are deliberately hardcoded. The reflection body is original placeholder copy.

## Storage and limitations

Shares live in localStorage under `doorknob.shares.v1`, scoped to the current browser and origin. Each record contains a unique ID, ISO creation timestamp, text, a reflection snapshot, and an explicit `kind: 'text'` discriminator.

Clearing site data removes shares. Browser storage is not encrypted or backed up. Drafts stay in memory until saved and are lost on refresh. Simultaneous writes in multiple tabs are not transactional.

This milestone includes no audio, transcription, AI, authentication, database, server endpoints, or sharing with other people.

## Validation

```bash
npm run check
```

GitHub Actions runs the same `npm run check` command after `npm ci` on pull requests and pushes to `main`. See [contributor commands](CONTRIBUTING.md#commands) for its steps. The Next.js build includes TypeScript validation. Tests require no credentials or external services.

Unit tests cover share creation, validation, ordering, and storage failures. Playwright tests cover save/reload persistence, full-share reading, ordering, draft retention, and storage errors in mobile and desktop Chromium. CI runs them after `check`.

To run browser tests locally:

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

Playwright starts its own production server on port 3100. Browser tests are separate from `npm test` and `npm run check` because they require a browser installation. All test content is fictional.

Manual checks:

1. Confirm blank and whitespace-only input cannot be saved.
2. Save a multiline share. Check the confirmation and full text.
3. Refresh, open **Past shares**, and reopen the entry. Save another and confirm newest-first ordering.
4. Check phone and desktop layouts and keyboard navigation.
5. Block site storage or simulate a quota error. Confirm an error appears and the draft remains without a success confirmation.
6. Set `doorknob.shares.v1` to malformed JSON in browser storage. Reload and confirm the error appears and saving does not overwrite the existing value.

## Project layout

Source and tests are grouped by responsibility, with direct imports and no barrel files or path aliases.

```text
src/
  app/                  page.tsx, layout.tsx, globals.css — route entry and theme
  components/           app-wide header and footer
  shares/
    share-app.tsx       client state and screen transitions
    components/         reading, form, history, and detail presentation
    model.ts            share records, creation, and validation
    storage.ts          validated localStorage reads and writes
    dates.ts            saved-date formatting
tests/
  shares/               unit tests for data and persistence
  e2e/                  Playwright tests for user flows
docs/
  ARCHITECTURE.md       responsibilities, tradeoffs, and official guidance
.github/workflows/      verification, title validation, and security scans
```

See [the architecture](docs/ARCHITECTURE.md) for data flow and implementation decisions, including the [intended mobile direction](docs/ARCHITECTURE.md#intended-mobile-direction).

## Contributing and repository standards

See [CONTRIBUTING.md](CONTRIBUTING.md) for commands, formatting, documentation, and PR conventions. [Shared repository standards](docs/REPOSITORY_STANDARDS.md) records the seven workflow decisions and the copy plan for `jft-harness`, including GitHub settings that still require configuration. [The data glossary](docs/DATA_GLOSSARY.md) defines terminology shared by both repositories.

Dependabot proposes weekly npm and GitHub Actions updates. Dependency Review checks newly introduced high/critical vulnerabilities, and CodeQL scans TypeScript. These workflows do not configure branch protection or repository security features by themselves.

## Installation troubleshooting

This project uses public npm packages and does not require npm login. If `npm ci` returns E401 on a machine configured for a private company registry, try:

```bash
npm ci --registry=https://registry.npmjs.org/
```

A failed installation leaves `next` unavailable, so fix the install before running `npm run dev`. Do not commit registry credentials or change shared company authentication to run this app.
