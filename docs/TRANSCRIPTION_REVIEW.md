# Transcription code review

The useful boundary is the existing `TranscriptionEngine`, not a provider registry. The editor needs finalized text, replacement interim text, activity and lifecycle callbacks. Provider credentials, audio encoding, transport and wire events belong to adapters.

## Changes made in this review

- Grouped browser OpenAI transport, transcript ordering, protocol and diagnostics under `src/shares/transcription/providers/openai/`.
- Removed the hook's direct OpenAI dependency. `transcription/provider.ts` selects the factory; hook options name the engine override and Stop callback instead of requiring a positional `undefined` argument.
- Grouped server OpenAI issuance, cleanup, credentials and diagnostics under `src/shares/server/providers/openai/`. Shared SDK construction now owns key resolution, disabled SDK logging and retries; operations retain separate deadlines. Environment variable names and Amplify secret lookup are unchanged.
- Separated HTTP access checks from provider session creation. Text cleanup has its own selection module, so switching speech providers need not replace paragraph cleanup.
- Consolidated the two identical burst guards, retaining separate operation buckets and existing limits.
- Extracted bounded OpenAI frame processing and commit accounting from resource lifetime. Repeated acknowledgements for one item no longer settle another outstanding commit.
- Made disposal terminal even before an engine starts. Disposed capability probes cannot later acquire a microphone.

## Replacing transcription

1. Implement `TranscriptionEngine` in `transcription/providers/<provider>/`. Keep transport and provider SDK calls there. Reuse microphone helpers when useful; a provider SDK can own capture instead if its cleanup guarantees are tested.
2. Emit interim as the complete current provisional string, not a delta. Emit each finalized segment exactly once, in audio order, without replaying earlier finals. The hook appends finals and enforces the draft limit. Provider adapters must deduplicate/reorder their own events.
3. `start` must begin acquisition only after the user's explicit action. `stop` stops microphone tracks immediately but allows trailing finals before `ended`. `dispose` cancels pending work, releases all resources and silences callbacks permanently. Errors must use authored, safe messages and preserve already emitted finals. One instance represents one session.
4. Select the adapter in `transcription/provider.ts`. Select its matching server issuer and redacted diagnostics in `server/transcription-provider.ts`. The current credential endpoint returns `{ value, expires_at }`; adapt that endpoint's schema and client parser together if the next provider needs different connection data. Do not force every provider into OpenAI's credential format.
5. Keep permanent keys in server-only configuration. Prefer short-lived browser credentials when supported. A provider that requires a proxy will need a transport compatible with Amplify; changing the factory alone cannot supply that infrastructure.
6. Leave `server/cleanup-provider.ts` alone to retain OpenAI text cleanup. Update deployment/retention/cost docs for the new speech provider and run the contract scenarios and browser suite before comparing costs on devices.

No runtime provider setting, registry, fallback transcript, or multi-provider reconciliation was added. A code-level switch is sufficient for the next experiment.

## Improvements to prioritize next

| Priority                  | Finding                                                                                                                                             | Recommendation                                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High                      | Each successful Stop cleans the entire growing draft again. Repeated short sessions repeatedly bill for and rewrite earlier text, including edits.  | Decide whether cleanup should process only new segments or explicitly selected text. Preserve previous edits and paragraph boundaries; measure quality before changing behavior. |
| High before public access | Burst limits and share storage are process-local. They are neither a distributed spend quota nor durable storage across Amplify instances/restarts. | Keep preview access protected. Before public use, add shared storage and an enforced shared budget/rate boundary appropriate to deployment.                                      |

| Medium | Local RMS/silence detection is a simple amplitude gate, not robust speech detection. Background noise and quiet speech can affect turn boundaries. | Compare supported provider turn detection or a proven VAD only if device tests show a problem; avoid adding a large audio pipeline preemptively. |
| Medium | Cleanup is a probabilistic rewrite even with structured output. Schema validation cannot prove meaning was preserved. | Keep explicit review/save and original-on-failure behavior. Add a small manual evaluation set for negations, recovery language, repetition and names when changing prompts/models. |

## Libraries versus custom code

The official OpenAI SDK already replaces hand-written server request, response and structured-output plumbing. The AWS SDK handles compute-role credentials and Secrets Manager. Existing Zod schemas enforce cleanup/text bounds. These are good dependencies to keep.

The browser adapter now uses `OpenAIRealtimeWebRTC` from the installed official SDK. It replaces custom offer/answer negotiation, connection/channel readiness and subscription cleanup. The app supplies the authenticated SDP exchange and retains ownership of media tracks, protocol ordering/deduplication, Stop draining and local activity. Deterministic tests exercise the real SDK over mocked browser/provider boundaries. Live provider/device validation remains separate.

A query cache, state-machine package, agent framework or generic provider plugin system would add machinery for one cancellable session and one cancellable cleanup request. They are not justified at this size. Do not remove bounded buffers, generation checks, aborts or finalization deadlines merely to reduce line count.

## Follow-up organization refactor

All six follow-up areas are implemented: explicit session ownership with one lifecycle phase, protocol/transport separation, adoption of the SDK WebRTC helper, a composer coordination hook, server folders by responsibility, and immutable provider settings separate from secrets. Classes are reserved for the resource-owning recording session and existing repository; stateless HTTP operations/configuration remain functions/data. See [architecture](ARCHITECTURE.md#recording-ownership-and-lifecycle) for lifecycle transitions and the server map.
