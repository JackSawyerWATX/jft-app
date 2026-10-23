# Doorknob v0.4

Doorknob is a mobile-first recovery reflection app. Read the sample reflection, write a text share, save it through the Next.js Backend for Frontend (BFF), revisit past shares, and optionally send a reading link to another person.

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

Production requires `SESSION_SECRET` and sets Secure cookies. Missing or short production secrets cause API requests to return a generic 500; the app does not supply a production fallback. A signing-key change invalidates existing cookies. Use HTTPS when hosting; browser handling of Secure cookies on plain HTTP localhost can vary. Use `npm run dev` for ordinary local development.

## Sharing with another person

Save a share, then tap **Share with fellow alcoholic** beneath your thoughts on the card. It opens the device's share sheet directly. Browsers without native sharing copy the link; if clipboard access is unavailable, an inline selectable link field appears. The same button and share icon are available in past-share details. Saving prepares the URL but never sends it to anyone.

Saved and shared detail pages show thoughts in full. Past shares keeps a compact two-line preview. Recipients can read the original reading and thoughts without an account, then choose **Write your own share** to open the homepage. They cannot browse the sender's history. Sharing URLs contain only a cryptographically random UUID. Anyone who learns that UUID can read that share during its lifetime; treat the full URL and share IDs as credentials and never log them. No separate sharing secret is required. Technical lifetime and storage details are in [architecture](docs/ARCHITECTURE.md#public-sharing-boundary).

The reading is a fixed fictional sample dated April 23, 2025, labeled as a sample in the UI. Saved dates and times describe when each share was created, using the viewer’s local time zone. History leads with the user’s thoughts and retains the reading title as context.

A sharing URL is created at save time; anyone holding it can view the share while it remains available. The UI therefore describes browser-session access and link access rather than promising that saving alone keeps a share inaccessible through its URL.

### Manual check across two browser sessions

1. Run `npm run dev`, write fictional text, and **Save privately** in browser A.
2. Tap the share icon. Confirm it opens native sharing or copies the link directly. If both APIs are unavailable, copy from the fallback field.
3. Open the link in a fresh private browser B. Confirm the original reading and written thoughts appear without a login or session cookie.
4. In B, the home page's **Past shares** is empty and the sender's private detail returns 404.
5. In A, open the entry from **Past shares** and tap its icon; it uses the same URL without requesting a new link.
6. Tamper with a URL parameter and confirm the recipient page says **This share is unavailable**. Restart the server and confirm its in-memory shares are gone.

## Writing and reviewing shares

1. Read the reflection and write in the multiline textbox.
2. Choose **Save privately**. Confirmation appears only after the server saves your text.
3. Open **Past shares** to browse newest first, then select an entry to fetch and read it in full.

Blank shares cannot be saved. Text is limited to 10,000 Unicode code points, and the full JSON request is limited to 64 KiB. Oversized-input failures retain the draft for editing. Navigating between views preserves drafts. Failed saves retain your words and show an error. Pending saves disable editing and duplicate submissions. History and detail requests have loading and error feedback; failed history requests can be retried.

The reading and April 23, 2025 date remain deliberate placeholders.

## Persistence and privacy limitations

Shares are sent to the same-origin Next.js server and stored in a process-local Map. Each record has a server-generated UUID, ISO timestamp, `kind: 'text'`, text, reading snapshot, and anonymous owner ID in the server record. Share JSON omits the ownerId field. There is no browser storage persistence or migration of v0.1 test data.

A signed, HttpOnly, SameSite=Lax cookie identifies the anonymous session. It expires after 30 days and is Secure in production. Different browser sessions cannot list or read one another's shares through the private endpoints; a shared UUID link separately grants read access to that share. Missing, invalid or expired cookies automatically start a fresh empty anonymous session. This is disposable prototype behavior: old ownership is never restored from invalid credentials, and previous records may remain in server memory but are inaccessible to the new owner. The signed cookie is readable, not encrypted, and must be treated as a bearer credential. Tabs sharing site cookies share an owner; use separate profiles/cookie jars to test isolation. Cookies do not provide login accounts or recovery. Saving waits for a successful initial session read; initialization failures retain the draft and offer retry. Foreign-origin POSTs are rejected before session creation and never replace the cookie. This prototype now uses Hono’s signed-cookie format; old-format cookies automatically start a fresh empty session. There is no cookie migration.

**This storage is for local development. Restarting the server clears all shares. Multiple processes, replicas, and serverless instances such as Vercel do not share the Map and cannot provide reliable persistence.** No disk storage, database, encryption at rest, backup, account recovery, or durable deployment is provided. Unsaved drafts live only in React memory. Refreshing, closing the tab, or leaving the mounted app starts a fresh share. In-app Today/Past shares navigation and failed saves retain the current draft until refresh or a successful save. Older stored drafts are discarded on page load. The development signing secret also resets on process restart unless configured. There is no per-share deletion or expiry job; cookie loss does not remove records from the running Map. See [the data lifecycle](docs/DATA_GLOSSARY.md#app-data-lifecycle).

Signed sharing links are optional: saving prepares a URL but never sends it automatically. No audio recording or storage, AI, registration, real reading feeds, or harness integration are included.

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
  app/                       Next.js pages, API entry points, layout, theme
  components/                app-wide header and footer
  shares/
    share-app.tsx            draft ownership, requests, screen transitions
    api.ts                   browser fetch and response validation
    model.ts                 shared schemas, types, and text limit
    dates.ts, errors.ts      shared date formatting and error contracts
    composer/
      share-form.tsx         transcription and explicit saving coordination
      live-transcript.tsx    inline transcript editing and scroll following
      save-share-button.tsx  explicit save action
      recording/             microphone control, status, clock, icon, accents
    history/                 history hook, list, and list items
    detail/                  saved-share detail, sharing action, thoughts text
    reflection/              reading presentation and fictional fixture
    transcription/           engine contract, browser adapter, lifecycle hook
    server/
      operations/            private/public operation contracts and handlers
      app.ts                 operation registration and dispatch
      repository.ts          owner-scoped storage boundary
tests/
  shares/                    schemas, HTTP, repository, session, and date tests
    transcription/           browser adapter and transcript helper tests
      client/                DOM setup and provider-independent React hook tests
  e2e/                       Playwright user flows
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

## Speak your share

On Today’s Reflection, tap **Record your share**, allow microphone access, and speak. The control shows when access is pending or the microphone is listening. Final words appear in the editable textbox; **Still recognizing** shows provisional words that are never saved or persisted. Tap **Stop listening**, review and edit, then **Save privately**. Recording again adds a paragraph to the same draft. Automatic browser stops retain final text and allow another explicit start. Navigation cancels recognition. At 10,000 Unicode code points, dictation stops and retains the accepted draft; shorten it to add more.

The browser’s standard or prefixed Web Speech API supplies recognition in your browser language (en-US fallback). Support and behavior vary across Chrome, Safari, operating systems, and device settings. Continuous/interim options are requests, not guarantees. Silence, calls, backgrounding, time limits, permission settings, and network/service failures can end recognition. Unsupported browsers retain normal typing and saving. Recognition generally needs HTTPS (localhost is suitable for local development); API presence does not guarantee service availability.

**Privacy:** your browser may send microphone audio to its vendor or an online speech service. Offline/local processing is not guaranteed. Doorknob does not capture, upload, or store raw audio. Only finalized words enter the in-memory draft; only an explicit save sends text to Doorknob’s BFF. Review [draft and share retention](docs/DATA_GLOSSARY.md) before using sensitive text.

### Physical iPhone and Android checks

Use fictional recovery text and a trusted HTTPS development deployment reachable by the phone. A desktop LAN HTTP URL is not equivalent to localhost on the phone. No deployment or audio service is configured by this milestone.

1. On iPhone Safari and Android Chrome, note OS/browser versions and open Today’s Reflection. Confirm no microphone prompt appears until tapping Record.
2. Type a sentence, grant microphone permission, dictate, observe listening/provisional text, then stop. Confirm final words appear once, earlier typing remains, and saving waits for stop/finalization.
3. Edit words, record again, and verify the new paragraph appends. Refresh after stopping to confirm a fresh, empty draft and reset timer; dictate again before saving. Save privately; check history, open the share, and open its link in a separate private browser.
4. Test denial, later permission recovery, silence with no words, long pauses, network interruption, switching apps, a call interruption if practical, and leaving for Past shares while listening. Confirm the microphone stops and finalized text survives; restart only with another tap.
5. Test a browser without recognition and confirm typing/saving work. Check narrow layout, large text settings, keyboard focus, and VoiceOver/TalkBack announcements. Test near the text limit with fictional text.

Automated Node and mobile/desktop Playwright tests use deterministic API mocks, never a real microphone or live recognition service. Physical-device behavior must be checked separately. See [the replaceable engine contract](docs/ARCHITECTURE.md#speech-input).

### Diagnosing speech recognition

Open the app with `?speechDebug=1` (for example `https://your-doorknob-host/?speechDebug=1`), open browser developer tools → Console, enable **Info** messages, and filter for `[Doorknob speech]`. Enable **Preserve log** to keep navigation events. The switch is remembered only in this tab's sessionStorage; visit `?speechDebug=0` to turn it off. When storage is blocked, keep `?speechDebug=1` in the URL. The setting is resolved when the recording experience mounts, rather than on each speech event. No rebuild or server environment variable is required. On iPhone Safari use Safari's remote Web Inspector from a Mac; Android Chrome supports remote inspection from desktop Chrome.

Reproduce the problem and inspect the progression:

- `availability` reports API support/prefix, HTTPS secure-context status, online status, and page visibility.
- `editor-start` → `start-requested` → `start-returned` means the app reached the browser API. `start-failed` identifies constructor/configuration/start failures with an allowlisted exception name. A missing `recognition-start` after `start-returned` means the browser has not confirmed listening; check its permission prompt and site/OS microphone settings.
- `recognition-start`, `audio-start`, `sound-start`, and `speech-start` show the browser's reported progress from recognition startup to microphone audio and speech detection. Browsers may omit some of these events; absence alone does not prove a failure.
- `results` shows result/segment counts and duplicate final suppression. `final-committed` shows a final segment reaching the editor; provisional/final text is never printed. `editor-state` traces lifecycle changes.
- `recognition-error` includes only a known code: `not-allowed`/`service-not-allowed` suggests permission/policy or service restrictions, `audio-capture` a microphone problem, `network` a browser speech-service connection failure, and `no-speech` no recognized speech. Unknown values become `unknown`; raw messages and exceptions are omitted.
- `stop-requested`, `recognition-end` (with whether stop was requested), `stop-timeout`, `dispose`, `editor-unmount`, connectivity, and visibility events help diagnose interruption and cleanup. Session numbers and elapsed milliseconds correlate browser events; capability-only checks also receive session numbers. Lifecycle/commit logs use the editor's separate session counter.

Diagnostics are off by default and written only to your browser console. They contain no transcript/draft text, audio, share IDs, URLs, credentials, or raw error messages, and are not uploaded by Doorknob. You can copy the filtered diagnostics when reporting a problem. Recognition API presence and online status do not guarantee a working vendor service. No BFF speech request is expected: browser-managed recognition happens outside Doorknob's save endpoint.

### Recording screen

The large circular microphone starts and pauses speech recognition. Its ring and side accents brighten when the browser reports speech or delivers recognized words; they are speech activity cues, not a measured audio waveform or volume meter. Browser support for speech-activity events varies, so result updates also briefly illuminate the accents. The timer counts time spent listening across sessions in the current editor view, not the duration of an audio recording. No additional microphone capture or audio storage is used.

Below the microphone, a bounded teleprompter shows the current share and provisional words in italics. It follows new text without scrolling the page. Scroll upward to read earlier words; scroll back to the bottom to resume following. The transcript itself supports typing and corrections, without a separate editing section. Refresh starts fresh; drafts are not recovered from browser storage. Provisional words remain excluded from the draft and save payload. The accents respect reduced-motion preferences.

The teleprompter uses `react-textarea-autosize` to keep existing words visible when the viewport size or fonts change. It continues to follow new words while preserving deliberate scrollback. The engine hook accepts a replacement factory selected once per mount for future streaming providers; provider-independent hook tests run with React Testing Library and jsdom as development-only dependencies.

Silence (`no-speech`) ends recognition normally and keeps finalized words; microphone capture failures suggest checking the microphone and browser settings. Late listening callbacks cannot restart a session that is stopping. The lifecycle tests include root-level React Strict Mode setup/cleanup replay and resource cleanup on unmount.
