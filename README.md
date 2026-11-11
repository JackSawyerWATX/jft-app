# Doorknob v0.4

Doorknob is a mobile-first recovery reflection app. Read the sample reflection, write a text share, save it through the Next.js Backend for Frontend (BFF), revisit past shares, and optionally send a reading link to another person.

## Getting started

Use Node.js **24 LTS**, pinned in `.nvmrc`:

```bash
nvm use
npm ci
export STT_PROVIDER=soniox
npm run dev
```

`STT_PROVIDER` defaults to `soniox`. Set it explicitly in the environment or ignored `.env.local` to select `soniox` or the retained `openai` alternative.

Open http://localhost:3000. Typing, saving, and tests need no provider credentials: a random session signing secret is generated for the running process. Optionally set `SESSION_SECRET` to a random value of at least 32 bytes in `.env.local`. Never commit secrets or personal recovery text.

For a production-mode local run, create `.env.local` first:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put `STT_PROVIDER=soniox` and the generated `SESSION_SECRET=<generated value>` in `.env.local`, then run:

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

Signed sharing links are optional: saving prepares a URL but never sends it automatically. No raw audio storage, registration, real reading feeds, or harness integration are included. Optional live transcription sends microphone audio to Soniox (or configured OpenAI) only during explicitly started sessions.

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
6. Restart the server and confirm history is empty. Clear cookies and confirm previous shares are inaccessible privately.

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
    transcription/           engine contract, Soniox/OpenAI adapters, audio activity, lifecycle hook
    server/
      operations/            private/public operation contracts and handlers
      app.ts                 operation registration and dispatch
      repository.ts          owner-scoped storage boundary
tests/
  shares/                    schemas, HTTP, repository, session, and date tests
    transcription/           provider adapter and transcript helper tests
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

Tap **Record your share**, allow microphone access, and speak. Audio streams to Soniox by default (or OpenAI when selected); provisional words appear in the existing teleprompter, then corrected, punctuated final segments enter the editable draft. Tap **Stop listening**, wait for finalization and automatic cleanup, review/edit inline, and explicitly **Save privately**. Cleanup adds natural paragraphs and removes obvious hesitation fillers. Recording again appends a paragraph. Refresh starts a fresh draft. There is no browser SpeechRecognition fallback or automatic provider fallback.

Transcription needs HTTPS (localhost works for development), microphone permission, WebRTC, and Web Audio. Permission denial, connection loss, provider failure, leaving the recording screen, hiding the page, and unmount stop capture and release tracks/connections. Finalized words remain; provisional words are discarded on failure. Stop releases the microphone immediately and allows up to five seconds for final results. A timeout shows a notice rather than silently claiming complete transcription. Sessions stop after ten minutes; tap again to append more. At 10,000 Unicode code points, the draft is clipped to the limit and recording is canceled. Typing and saving work without provider access.

Startup requests microphone permission and temporary credentials in parallel. After permission is granted, **Connecting transcription…** replaces the permission message until the data channel opens; only then does **Listening...** appear. **Cancel connection** stops a pending connection. The remaining network/permission time is real; no early audio buffering is introduced.

The microphone accents reflect local sound activity and incoming transcript results, not a clinical or reliable speech detector. Silence detection commits turns after approximately 800 ms; punctuation/finalization can lag provisional text and can change it. Noise can delay boundaries. Real-world accuracy and latency need device testing.

### Automatic paragraphs and filler cleanup

After Stop receives the final words, a loading wheel labeled **Tidying!** above the transcript indicates a text-only cleanup request. It asks OpenAI to add frequent short paragraphs (usually one or two sentences, roughly 20–45 words) for phone reading and remove obvious “um”/“uh” fillers and accidental stutters, while preserving meaningful repetition, names, numbers, uncertainty, negations, and your voice. It must not summarize or add advice or facts. AI can still change meaning: review the result before saving.

The cleaned draft remains editable and survives in-app navigation; refresh discards it. While cleanup runs, recording/saving wait, but typing cancels the pending result and keeps your edits. Navigation cancels pending cleanup. Failure, timeout, refusal or invalid output keeps the original and offers **Retry cleanup**. Cleanup never runs on provisional text, microphone cancellation, recording errors, automatic session endings or ordinary typing. It never saves automatically. Owner and recipient detail pages render blank-line-separated text as separate paragraphs, with extra spacing on small screens.

Cleanup retains its independent OpenAI server key and the existing `STT_ENABLED` setting. Restricted keys additionally need **Responses → Request** and access to `gpt-5.4-mini`; an unrestricted key already supplies endpoint permission. The Responses request uses `store:false` and no tools. This does not disable OpenAI's standard abuse-monitoring retention. Builds and tests need no key and make no live cleanup requests.

Published cleanup pricing is $0.75 per million input tokens and $4.50 per million output tokens: approximately **$0.013 for 2,500 input plus 2,500 output tokens**, plus the short instruction text. Shorter drafts cost less. This is additional to audio transcription; each successful explicit Stop with new finalized words requests cleanup of the whole current draft. Source: [GPT-5.4 Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), checked October 25, 2026.

### Local configuration

Dependencies are installed with `npm ci` under Node 24. Tests need no credentials. For real recording, securely set these server-only variables in environment settings or an ignored `.env.local`:

- `STT_ENABLED=true` explicitly enables paid transcription and text cleanup; unset/false keeps it disabled.
- `STT_SONIOX_API_KEY` authorizes local Soniox speech; deployed environments use `STT_SONIOX_SECRET_ARN`.
- `STT_OPENAI_API_KEY` is an independent OpenAI key for cleanup (Responses access) and optional OpenAI speech (Realtime access). Never use a `NEXT_PUBLIC_` prefix, commit the key, print it, or paste it into chat.
- Production still requires the existing `SESSION_SECRET` (at least 32 random bytes).

Only the short-lived credential reaches the browser. It expires after 60 seconds for establishing sessions. Soniox credentials are single-use and enforce a ten-minute active-session cap; the retained OpenAI credential can establish multiple sessions before expiry. Initial transcription configuration is not an enforceable spending boundary against a modified client. The app does not store credentials in browser storage. Do not record credential endpoint response bodies in proxy/APM logs.

See [Amplify setup](docs/TRANSCRIPTION.md#amplify-and-terraform) for server key storage, branch permissions, and preview access protection. See [recording and text ownership](docs/TRANSCRIPTION.md#recording-and-text-ownership) for adapter boundaries.

### Processing, retention, and cost

The app captures microphone audio in memory and transmits it directly to Soniox by default, or OpenAI when selected, while explicitly recording. It does not write audio files, retain raw audio, play audio, or send audio through the share-save endpoint. The selected provider processes audio remotely; this is not local or offline recognition. Unsaved transcription text is held in React memory. After an explicit Stop successfully finalizes new words, the full finalized draft is sent through the BFF to OpenAI for cleanup; it is not written to the share repository. Only an explicit save creates a share. The existing in-memory share storage limitations still apply.

OpenAI's API data is not used to train models by default unless the organization opts in. Standard abuse-monitoring logs may contain customer content and are retained for up to 30 days, subject to documented exceptions. The Realtime endpoint documents no application-state retention. Zero Data Retention/Modified Abuse Monitoring require eligibility and approval; this app does not establish those controls or promise zero provider retention.

For the OpenAI alternative, `gpt-live-transcribe` is listed at **$0.017 per streamed minute**, about **$1.02/hour** or **$0.17 for ten minutes** (official pricing checked October 25, 2026). Check current pricing and your project access before enabling it. Network, AWS hosting, and Secrets Manager charges are additional. No paid live request is part of automated tests.

Soniox audio usage has separate pricing and privacy/retention controls; verify current account terms before use. Application storage policies do not govern provider retention. See [the Soniox deployment runbook](docs/TRANSCRIPTION.md) and infrastructure cost guidance.

Sources: [live transcription](https://developers.openai.com/api/docs/guides/realtime-transcription), [pricing](https://developers.openai.com/api/docs/pricing), [API data controls](https://developers.openai.com/api/docs/guides/your-data).

### Physical iPhone Safari and Android Chrome checks

Use fictional text on a trusted HTTPS Amplify preview, with a configured provider project. Desktop mobile emulation does not validate microphone hardware, iOS permissions, WebRTC networking, or real model accuracy. Record OS/browser versions and approximate time to first words and finalization; do not capture transcript/audio/credentials in test logs.

1. Confirm no microphone prompt or provider session request occurs before tapping Record. Type a sentence, tap Record, allow access, and dictate. Confirm provisional words change and final punctuation appears without duplicate text. Confirm the accents respond and the timer advances.
2. Stop mid-sentence. Check the OS microphone indicator turns off immediately, final words arrive or a clear timeout notice appears, and saving stays blocked until finalization ends. Edit inline, resume recording, and verify a new paragraph. Repeat three times.
3. After Stop, review automatic paragraph/filler cleanup; test editing during cleanup and a failed cleanup. Then save explicitly; check paragraph layout in history/private detail and the sharing link in a second browser session. Refresh an unsaved draft and confirm it starts empty with a reset timer.
4. Test permission denial, missing microphone, permission recovery, silence, long continuous speech, backgrounding, screen lock, a call interruption, network loss, and provider refusal. Confirm capture/connections end, final text remains, and recording never restarts automatically. Disable transcription configuration and confirm typing/saving still work.
5. Navigate to Past shares and away from the app during recording. Confirm the OS microphone indicator clears. Test near 10,000 Unicode code points and verify accepted final text remains within the limit, the microphone stops, and no provisional text is saved.
6. Test the prompter with large text settings, viewport/font changes, scrollback, reduced motion, keyboard focus, VoiceOver/TalkBack, and narrow screens. Compare punctuation and latency in quiet/noisy environments. Try a ten-minute session boundary.

### Diagnostics and automated checks

`?speechDebug=1` enables console-only lifecycle diagnostics, remembered in this tab; `?speechDebug=0` disables them. URL enablement still works when sessionStorage is blocked. Filter for `[Doorknob speech]`. Events include availability, editor/start/end/disposal, results, and sanitized provider failure categories. No transcript, audio, credential, share URL, or raw provider error is logged. Never forward raw WebRTC/provider frames or HTTP credential responses to diagnostics.

`npm run check` validates formatting, lint, OpenAPI, deterministic Node/hook tests, and the production build. After building, run `STT_PROVIDER=openai PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e -- --workers=2`. The Playwright server forces paid credential issuance off even if local settings enable it. Browser tests mock microphone/WebRTC and provider HTTP boundaries while exercising the real engine, hook, teleprompter, editing, saving, history, and sharing. They do not prove live provider availability or physical-device support.

### Startup transcription selection

`STT_PROVIDER` is validated server-side at startup. It defaults to `soniox`; set it to `openai` to select the existing WebRTC provider. See [live transcription deployment](docs/TRANSCRIPTION.md) for Soniox credentials and Terraform setup. The server passes this nonsecret value through runtime page bootstrap, and session requests assert a matching provider. Restart/redeploy when changing configuration. Only Soniox and OpenAI are supported; there is no automatic fallback. Existing OpenAI credentials and cleanup behavior are unchanged.

Soniox browser contracts run separately after building: `STT_PROVIDER=soniox PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e -- tests/e2e/soniox.spec.ts --project=mobile-chromium --project=desktop-chromium`. These exercise the real SDK with synthetic audio and WebSocket boundaries; no Soniox credits are used.
