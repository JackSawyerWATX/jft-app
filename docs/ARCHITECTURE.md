# Architecture

Doorknob groups code by responsibility, with the share feature kept together. Next.js route files are entry points; browser state, presentation, and persistence have separate owners. There is no global state library, service framework, or external integration.

## Responsibilities

- **`src/app/page.tsx`** is the server-rendered route entry. It renders the interactive share experience without a content-injection prop.
- **`src/app/layout.tsx`** supplies page metadata and the shared stylesheet.
- **`public/doorknob-logo.svg`** owns the brand artwork. Screens reference the asset through Next.js Image; the small decorative lock stays behind a named `LockIcon` component. Drawing coordinates stay outside screen and form markup.
- **`src/app/globals.css`** supplies the ivory and navy palette, serif typography, responsive spacing, and focus styles alongside Tailwind utilities.
- **`src/shares/share-app.tsx`** is the client boundary. It owns the current screen, draft, history, loading/error feedback, and heading focus. History is explicitly loading, loaded, or failed; an unreadable history is never presented as an empty one. The screen state carries a share only for saved/detail views, so those views cannot exist without the record they display.
- **`src/components/`** owns the app-wide header and footer.
- **`src/shares/components/`** contains the reading, form, history, and detail presentation components. Props express their inputs and callbacks; they do not access storage. Each history item owns its preview and date formatting. The form owns its save-error markup and generated accessibility IDs; history-loading errors remain at the application level. The share controller composes the reading directly. Components imported by the client boundary run as part of its client tree without redundant `use client` directives.
- **`src/shares/model.ts`** owns the fixed reading, versioned storage key, creation, and Zod schemas. Share and reflection types are inferred from those schemas, keeping the TypeScript and runtime contracts together. Unknown fields are preserved for forward compatibility; invalid records still fail without overwriting history. It has no dependency on React or browser storage.
- **`src/shares/storage.ts`** reads and writes validated history. It accepts the small storage API it needs, so error behavior can be tested without a browser. Browser storage is accessed only after mounting or in event handlers.
- **`src/shares/dates.ts`** formats saved timestamps in the reader's local time zone and reading calendar dates in UTC, preventing calendar dates from moving to the previous day.
- **`tests/shares/`** verifies data and persistence contracts. **`tests/e2e/`** checks real user flows in mobile and desktop Chromium.

## Save and read flow

1. The client reads `doorknob.shares.v1` after mounting. Parsing validates every record and orders history by creation timestamp, newest first.
2. Saving trims the draft and rejects empty text. The new record receives a UUID, ISO timestamp, and a copy of the reading.
3. Persistence reads history again immediately before writing to retain recent saves from other tabs when possible. localStorage does not provide transactional writes, so simultaneous saves across tabs can still race.
4. Only a successful storage write updates the in-memory history, clears the draft, and opens the confirmation view.
5. Selecting a history entry opens its full text and original reading snapshot. View changes focus the heading; the form references its help and error messages for assistive technology. Muted text and placeholders use a color with at least 4.5:1 contrast on the ivory background, and the header navigation has a 44px minimum height.

Storage access, parsing, quota, or serialization failures show an error. Failed saves retain the draft. Invalid history is not replaced by an empty array, preventing a subsequent save from silently destroying unreadable records. There is no automatic repair or migration in this milestone.

## Data contract

A share contains `id`, `createdAt`, `kind`, `reflection`, and `text`. The reflection snapshot contains its own ID, date, title, and body, so changing the daily reading does not alter past shares. `kind: 'text'` makes the current record type explicit without unused audio or transcript fields. The versioned storage key leaves room for a deliberate future migration. `tests/fixtures/shares-v1.json` is a fixed fictional compatibility example, independent of the current creator function. Keep it readable as the app evolves; changes that reject existing valid records need a deliberate migration and compatibility tests, not a silent key change or history reset.

## Tradeoffs and boundaries

Views use in-memory navigation without separate URLs or browser-history entries. This keeps draft ownership simple for the current milestone. Refreshing returns to the writing view while saved shares remain available through history. Unsaved drafts are not persisted. If deep links or browser Back navigation become requirements, use Next.js routes rather than adding a second custom routing system.

The daily reading is fixed. System serif fonts avoid external font requests. Storage is limited to the current origin and device, without encryption, backup, accounts, or synchronization.

Keep components at meaningful UI boundaries. Do not extract every heading, button, or wrapper into a generic component. Introduce a shared component only when repeated behavior or styling warrants an owner. Local state is sufficient here; no context provider, reducer framework, or server-state library is needed.

## Verification

[CONTRIBUTING.md](../CONTRIBUTING.md#commands) owns verification commands and lint/format conventions. The ESLint configuration matches Next.js 15. Its production build checks TypeScript, so no second type check is included in `check`.

`npm run test:e2e` runs Playwright against the production build on port 3100, with isolated storage per test. It covers persistence, full-share reading, newest-first ordering, empty input, heading focus, draft retention, quota failures and successful retry, denied browser storage, and malformed history on mobile and desktop Chromium. CI installs Chromium and runs this after `check`. Firefox, Safari, and complete accessibility conformance are not covered by these tests.

## Guidance behind this organization

Reviewed against official documentation:

- [Next.js project structure](https://nextjs.org/docs/app/getting-started/project-structure): keep framework entry points and feature ownership clear; Next.js does not mandate a universal folder tree.
- [Next.js server and client components](https://nextjs.org/docs/app/getting-started/server-and-client-components): browser APIs and interaction belong behind a client boundary. This small feature composes its own reading rather than adding a server-content prop for minimal benefit.
- [React state structure](https://react.dev/learn/choosing-the-state-structure): group state that changes together and avoid contradictory or redundant state.
- [Next.js 15 ESLint configuration](https://nextjs.org/docs/15/app/api-reference/config/eslint): use framework, hooks, accessibility, and TypeScript rules appropriate to the installed version.
- [W3C form instructions](https://www.w3.org/WAI/tutorials/forms/instructions/): provide labels and associate supporting instructions with controls.

These principles inform this small app; they do not require a design system, global state manager, new server layer, or features from later milestones.

## Intended mobile direction

The long-term goal is an iPhone/Android experience. React Native with Expo is the intended option to evaluate for a native client, rather than treating this Next.js UI as directly portable. Validate recording and playback on real iOS and Android devices before committing to that stack. This is an architectural direction, not a mobile implementation or a promise of unchanged screen reuse.

Preserve the small boundaries already present:

- Share/reading schemas and record logic stay independent of React and browser storage. Stable UUIDs, ISO creation timestamps, and separate reading calendar dates can transfer to another client. Verify UUID generation against the chosen mobile runtime rather than assuming its globals match the browser.
- Browser persistence stays in `storage.ts`. Mobile persistence will need its own implementation; do not stretch the synchronous localStorage API into a universal abstraction in advance.
- HTML components, Tailwind styles, Next.js routes, and browser navigation remain web-specific. Native screens can reuse concepts and suitable data logic, not the markup unchanged.
- When recordings are introduced, store audio separately and reference files from records. Do not add audio fields or encode recordings into share JSON in this milestone.
- Before people rely on native local storage, decide backup, recovery, deletion, device migration, and any synchronization policy. Packaging the app does not supply those behaviors.

Keep `src/` and the current single application. There is no BFF now; a server-rendered Next.js entry point does not introduce one. Add a clear server boundary when actual backend behavior exists, and consider a separately deployed BFF only when web/mobile requirements warrant it. Extract a shared package only after a second client demonstrates real reuse. No mobile SDK, empty app skeleton, monorepo, or shared storage framework is needed for this PR.

## Temporary dependency override

Next.js 15.5.28 pins PostCSS 8.4.31, which is affected by [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) and [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849). The scoped npm override uses PostCSS `^8.5.30` for Next.js, staying on PostCSS major 8 and resolving both reported ranges. Production build and browser tests verify this combination. Remove the override once the selected Next.js release depends on a patched version directly; do not suppress the dependency check.
