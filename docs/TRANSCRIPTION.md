# Live transcription deployment

The browser implements OpenAI transcription behind `TranscriptionEngine`, with direct WebRTC audio transport. The Next.js Node BFF only issues short-lived credentials using the official OpenAI SDK. No WebSocket proxy, persistent Amplify connection, audio upload/storage, or separate audio service is required. The existing in-memory share repository still makes this a disposable prototype, including on Amplify.

## Configuration

| Variable                | Purpose                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `STT_ENABLED`           | Exact value `true` enables issuance; otherwise paid transcription fails closed.                  |
| `STT_OPENAI_API_KEY`    | Server-only direct key for local development/cloud workspaces. Never prefix with `NEXT_PUBLIC_`. |
| `STT_OPENAI_SECRET_ARN` | Alternative to the direct key: ARN of a plain-string Secrets Manager secret, read at runtime.    |
| `SESSION_SECRET`        | Existing production signing secret; at least 32 random bytes.                                    |

The direct key takes precedence when both key sources are configured. The secret ARN is nonsecret configuration. No key is read during build. A successful AWS secret read is cached for five minutes per process; redeploy/restart to pick up a rotation immediately. Empty/binary Secrets Manager values are rejected. Failed reads are retried by later requests.

For this cloud workspace, bind `STT_OPENAI_API_KEY` securely in environment settings and allow `api.openai.com`; a proxy-held binding is usable by the server SDK for that destination. Add `STT_ENABLED=true` to enable real recording. Do not copy workspace proxy placeholders into Amplify. Hosted browsers need their own network access to OpenAI WebRTC/HTTPS, independently of this workspace's network settings.

## AWS Amplify hosted preview

1. Create a dedicated OpenAI project/key with access to `gpt-live-transcribe` and the Realtime API. Keep it separate from production projects. Configure project monitoring/alerts and available rate restrictions; an alert/budget is not necessarily a hard spending cap.
2. Store the key as a **plain string** in AWS Secrets Manager. Do not put it into a committed file, a browser variable, or a build command. Configure an Amplify **SSR compute role** for the trusted preview branch with `secretsmanager:GetSecretValue` limited to that secret ARN. If using a customer-managed KMS key, grant `kms:Decrypt` for that key under the appropriate encryption-context conditions. Keep AWS credentials out of application configuration; the SDK uses the compute role.
3. Attach that compute role only to the branch that needs it, rather than granting arbitrary PR previews access to the key. The build service role and SSR compute role are different. The latter is required by runtime secret reads.
4. Supply the nonsecret `STT_OPENAI_SECRET_ARN` and `STT_ENABLED=true` to the **SSR runtime**. Amplify console build variables do not automatically become Next.js runtime variables. Extend the existing build configuration with a small Node command before `npm run build` that copies only those two validated nonsecret values to `.env.production`:

   ```js
   // Run with node during the trusted preview build, before npm run build.
   const fs = require('node:fs');
   const arn = process.env.STT_OPENAI_SECRET_ARN;
   if (
     !arn ||
     !/^arn:aws:secretsmanager:[a-z0-9-]+:\d{12}:secret:[A-Za-z0-9/_+=.@-]+$/.test(
       arn
     )
   ) {
     throw new Error('Configure the transcription secret ARN');
   }
   fs.appendFileSync(
     '.env.production',
     `\nSTT_OPENAI_SECRET_ARN=${arn}\nSTT_ENABLED=true\n`
   );
   ```

   Do not copy the permanent API key into build artifacts or dump environment variables. Preserve the deployment's existing handling of `SESSION_SECRET`. Leave transcription disabled on untrusted branches; enabling a build setting alone does not create secret permissions.

5. Enable Amplify branch access/password protection for this hosted preview **before enabling paid sessions**. An anonymous signed cookie is not user authentication. The endpoint's exact-origin check blocks foreign browser origins, and its five-attempts/minute per-session guard reduces accidental bursts within one process; neither prevents determined callers, new cookies, or abuse across serverless instances. Ephemeral credentials can establish multiple sessions and their session configuration can be changed by a modified client. A public launch requires a separate authenticated, distributed entitlement/quota design. Do not treat client ten-minute limits as hard provider spending limits.
6. Deploy, open the trusted HTTPS preview, establish the normal app session, and record fictional text. Confirm token issuance returns 200 without exposing the permanent key; check the OpenAI project usage dashboard. Verify stop, trailing words, interruptions and physical phones using the README checklist. Do not log credential response bodies, audio, provider event payloads, transcripts, or sensitive upstream errors in CloudWatch/APM/browser tooling.

This change supplies the runtime code and instructions; it does not create AWS resources, attach IAM roles, change Amplify settings, or validate a hosted deployment. It also does not fix existing process-local share persistence across Amplify instances.

Official references: [Amplify SSR compute roles](https://docs.aws.amazon.com/amplify/latest/userguide/amplify-SSR-compute-role.html), [SSR environment variables](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-environment-variables.html), [OpenAI client secrets](https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create), [live transcription](https://developers.openai.com/api/docs/guides/realtime-transcription), [pricing](https://developers.openai.com/api/docs/pricing), [data controls](https://developers.openai.com/api/docs/guides/your-data).

## Diagnosing a credential endpoint 503

For local development, put `STT_OPENAI_API_KEY` and `STT_ENABLED=true` in `.env.local` beside `package.json`, then restart `npm run dev`. The key's **Realtime → Request** permission covers the `/v1/realtime/client_secrets` operation used here; unrelated Responses, text-to-speech, and List models permissions are not needed by this operation. Project billing and access to the configured transcription model must also be available.

A browser-side 503 is intentionally generic. Read the **server terminal** (or server logs on Amplify) for `[Doorknob transcription]`:

- `disabled`: `STT_ENABLED` was not exactly `true` in the server process.
- `missing_key`: neither a direct key nor a Secrets Manager ARN was configured.
- `invalid_secret_arn` / `secret_unavailable`: check the configured ARN and SSR compute role.
- `provider_request_failed`: the accompanying HTTP status and allowlisted code distinguish key rejection (401), permission denial (403), unavailable model (often 404/`model_not_found`), quota/rate limits (429), or request validation (400). The safe parameter name can identify a configuration field without revealing its value.
- `server_or_connection_failure`: check server connectivity and session-signing configuration.

Diagnostics never include raw provider messages, exceptions, request bodies, response bodies, tokens, key values, or transcripts. Unknown provider codes/parameters are printed as `unknown`. You can share the diagnostic category/status/code without sharing your key. Do not enable verbose SDK HTTP logging or paste `.env.local` contents.

### Credential succeeds but no words appear

Open the app with `?speechDebug=1`, enable **Info** messages in the browser developer console, and filter for `[Doorknob speech]`. This is browser-side logging; the server terminal cannot observe the direct WebRTC audio stream. Record fictional words for about five seconds, pause, then Stop. Share the filtered diagnostic lines, not raw Network responses or provider frames.

- `credential-response` should report 200.
- `webrtc-answer-response` should report a successful HTTP status, followed by `webrtc-answer-applied` and `data-channel-open`.
- `provider-session` should identify transcription mode and the expected model. Unknown mode/model is recorded only as `other`.
- `webrtc-audio-sent` reports outbound audio packet/byte totals every two seconds while diagnostics are enabled. Increasing totals establish that audio packets leave the browser, not that the provider recognizes speech. No audio, candidate addresses or track IDs are logged.
- `microphone-activity` reports local sound detection. `provider-event` reports allowlisted event types and character counts, never the words themselves. Delta/completed events with positive counts show transcription is arriving.
- `audio-turn-commit` reports a silence/stop commit. `provider-error` reports only allowlisted codes. A failed handshake, non-increasing audio totals, no provider transcript events, and missing finalization are distinct observations; do not infer the cause from the absence of the old server error alone.

Visit `?speechDebug=0` afterward to disable diagnostics. Outbound packet sampling stops when the session is disposed and does not run when diagnostics are disabled.

## Automatic draft cleanup after Stop

The same server-only key now also calls `/v1/responses` for `gpt-5.4-mini` paragraph/filler cleanup after successful explicit Stop. An unrestricted key covers endpoint permissions; restricted keys need Responses Request as well as Realtime Request. No additional AWS secret or deployment service is required. `STT_ENABLED=true` enables both operations. Cleanup has its own bounded process-local burst guard and uses `store:false`, structured output, reasoning off, and no tools. A model-access/provider failure leaves the original editable and saveable. Safe failures appear as `[Doorknob cleanup]` with the same redaction policy.

The full unsaved finalized draft is sent through the BFF before explicit saving, including typed text already in that draft. Review remains important because AI may alter meaning despite instructions. See README for expected additional text-model cost and review behavior. Test with fictional spoken filler text, multiple topics, intentional repetition and negations; verify names/numbers and meaning against the original, exercise editing and failure, then save and inspect paragraph layout in owner and recipient views. Automated tests mock all provider calls and do not validate live editing quality.

## Waiting for microphone versus connecting

Waiting for microphone access now describes the native permission/device phase only. Connecting transcription means the microphone is granted but the remote transport is not ready. Cancel connection stops capture and cancels startup. Credential fetching overlaps the permission wait, and SDP/local ICE preparation overlaps credential loading. Both requests begin only after the recording tap. There is no prefetch on page load, raw audio buffering, credential cache, or early Listening indicator.

With `?speechDebug=1`, compare `microphone-permission-granted.elapsedMs` and `data-channel-open.elapsedMs` (since the tap) against `credential-response.elapsedMs`, `webrtc-offer-created.elapsedMs` and `webrtc-answer-response.elapsedMs` (duration of their own phases). This separates slow native permission/device startup, BFF/provider credential latency, remote SDP/model setup and ICE/data-channel establishment. No fixed real-world speedup is claimed by mocked concurrency tests.

Cleanup failures now distinguish `cleanup_not_completed` (with `max_output_tokens`/`content_filter` when supplied), `cleanup_refused`, `missing_cleanup_output`, and `invalid_cleanup_output`. Provider connection/timeouts have separate safe categories. Original draft preservation and retry behavior are unchanged; raw response text and parser errors are never logged.
