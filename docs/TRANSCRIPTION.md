# Live transcription

Soniox (`stt-rt-v6`) is the default. Set `STT_PROVIDER=openai` to retain the existing WebRTC implementation. The server selects the provider at startup and passes its non-secret name to the browser, which needs the matching SDK for direct audio streaming. `/api/transcription/session` checks the browser's `X-STT-Provider`; stale clients receive a safe 503 and should reload. Missing headers retain legacy OpenAI semantics. Unknown, empty or whitespace-padded provider names fail configuration; there is no fallback or reserved provider.

## Runtime configuration

| Variable                                       | Purpose                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `STT_ENABLED`                                  | Exact `true` enables paid speech and existing text cleanup.                                                         |
| `STT_PROVIDER`                                 | `soniox` when absent, or explicitly `soniox` / `openai`. Restart to change.                                         |
| `STT_SONIOX_API_KEY`                           | Local development only; ignored in production.                                                                      |
| `STT_SONIOX_SECRET_ARN`                        | Permanent Soniox plain-string secret, read by the deployed compute role.                                            |
| `STT_OPENAI_API_KEY` / `STT_OPENAI_SECRET_ARN` | Existing independent OpenAI credentials for cleanup and optional OpenAI speech. Direct-key precedence is unchanged. |
| `SESSION_SECRET`                               | Existing stable production signing secret, at least 32 random bytes.                                                |

For local recording, securely put the enable flag and Soniox key in ignored `.env.local`; no AWS credentials are required. Add the OpenAI key for cleanup. Never use `NEXT_PUBLIC_` for credentials. Both providers use `server/secret-key.ts` for cached Secrets Manager access through the normal AWS SDK credential chain. Successful reads cache for five minutes per ARN. Concurrent failed reads share one sanitized error, clear the failed cache entry, and permit retry. Empty/binary secrets fail closed; restart for immediate rotation pickup.

## Run locally

Use Node 24, run `npm ci`, and create an ignored `.env.local` at the repository root:

```dotenv
STT_ENABLED=true
STT_PROVIDER=soniox
STT_SONIOX_API_KEY=replace-with-your-soniox-key
STT_OPENAI_API_KEY=replace-with-your-openai-key
```

The Soniox key needs **Temporary API keys** and **Speech-to-text, real-time** permissions. OpenAI needs Responses access for automatic `gpt-5.4-mini` cleanup. Without the OpenAI key, cleanup fails safely and preserves the original draft. Selecting OpenAI speech additionally requires Realtime access.

Run `npm run dev` and open `http://localhost:3000`. No AWS variables or Secrets Manager ARNs are needed. `SESSION_SECRET` is optional in development; omit it to use the process-generated secret, or generate a stable value with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Production requires a stable signing secret and role-based Soniox secret access; `npm run start` intentionally ignores the direct Soniox development key.

Set `STT_ENABLED=false` to type and save without paid provider calls. The local in-memory store loses shares on restart. Do not run the Amplify environment-preparation script for local development.

## Recording and text ownership

An explicit Record tap invokes the official Soniox recording SDK, which starts microphone acquisition before asynchronously resolving connection configuration. This preserves mobile Safari user activation. The SDK owns capture, temporary in-memory startup buffering, direct WebSocket streaming, graceful Stop and cancellation. No audio is proxied through Amplify or persisted by this application.

The existing endpoint validates the signed anonymous session, exact origin, enable flag and process-local burst limit before requesting a Soniox temporary key. The request fixes `usage_type=transcribe_websocket`, `single_use=true`, `expires_in_seconds=60`, and `max_session_duration_seconds=600`. The server maps Soniox's `api_key` / ISO `expires_at` to the existing `{ value, expires_at }` contract with Unix seconds. The permanent key stays server-only. Credential expiry bounds connection establishment; the separate duration constraint bounds the active stream. The browser selects the model; the temporary-key policy does not pin it.

Soniox results contain incremental finals and a replacement provisional suffix. `providers/soniox/protocol.ts` concatenates final fragments in provider order and emits `final(text, 'verbatim')`; the editor inserts a paragraph for a new recording but preserves subsequent fragment whitespace and punctuation. OpenAI retains the default space-separated segment behavior. No word segmentation or last-word buffer is necessary. The SDK filters control tokens. Timestamp/text identity suppresses repeated timed finals without suppressing repeated words at different times; untimed finals follow the provider's incremental contract.

`stop()` immediately releases capture and permits trailing finals. Stop before connection cancels. Disposal silences callbacks and invokes SDK cancellation, including late permission cleanup. Shared policy in `transcription/session-config.ts` supplies startup (20 seconds), finalization (5 seconds) and session (10 minutes) limits. OpenAI's RTP drain delay stays inside its adapter. Page hiding/exiting and external microphone muting interrupt recording. Each new session uses a new engine and credential. Typed/final text stays editable after errors; provisional guesses are discarded.

`server/transcription-diagnostics.ts` owns redacted server reporting for both providers. Do not log provider bodies, raw exceptions, credentials, speech or audio. OpenAI's optional `?speechDebug=1` transport counters describe its WebRTC path; they do not describe Soniox. Disable diagnostics with `?speechDebug=0`.

## Cleanup remains independent

`server/cleanup-provider.ts` keeps OpenAI `gpt-5.4-mini`, structured output, reasoning off, `store:false`, no tools and existing deadlines. Successful explicit Stop sends the finalized draft, including typed text, through the BFF for cleanup. Failure preserves the original. A Soniox key cannot authorize cleanup: retain the existing OpenAI credentials and compute-role permission. No translation, summarization or feedback is added.

## Amplify and Terraform

Follow [the infrastructure runbook](../infra/terraform/README.md) for dev/prod state, Secrets Manager, existing-role permissions, manual plan/apply, cost and rollback procedures. Run `node scripts/prepare-transcription-env.mjs` from the repository root before the trusted Amplify build. It uses dotenvx's source editor to update only the four non-secret speech settings in `.env.production`, preserving unrelated values, comments, quoting and multiline source. Missing flags use their runtime defaults; absent secret ARNs are written empty to clear stale build configuration. Invalid input leaves the file untouched. API keys are never copied from the build environment. Local `.env.local` development needs no preparation script.

## Release checks and public access

Automated tests use synthetic provider/microphone boundaries; they do not establish actual recognition quality, latency or physical-device behavior. Before release, use fictional speech on iPhone Safari and Android Chrome: allow/deny permissions, cancel during connection, interrupt with calls/backgrounding, speak hesitant/repeated words and punctuation, Stop and verify trailing results, edit and record again, exercise cleanup success/failure, save and open a recipient link. Verify the OS microphone indicator clears and test the ten-minute cap. Smoke-test OpenAI selection too.

Anonymous cookies establish ownership, not authenticated spending entitlement. Exact-origin checks and per-process throttles do not stop scripted abuse, new cookies or distributed concurrency. Before public access, implement distributed quotas/concurrency limits and abuse/spending controls. Monitor Soniox audio and OpenAI cleanup usage separately; alerts are not guaranteed hard caps.

Confirm each provider's current retention, region and contractual privacy controls before sending recovery reflections. Application storage policies do not govern provider retention, and no zero-retention guarantee is established here.

Official references: [direct stream](https://docs.soniox.com/guides/direct-stream), [Web recording SDK](https://docs.soniox.com/sdk/web-SDK/stt/realtime-transcription), [SDK reference](https://docs.soniox.com/sdk/web-SDK/reference), [temporary keys](https://docs.soniox.com/authentication/temporary-api-keys), [key permissions](https://docs.soniox.com/authentication/api-key-permissions), [temporary-key API](https://docs.soniox.com/api-reference/auth/create_temporary_api_key).
