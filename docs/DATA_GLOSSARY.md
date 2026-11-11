# Data glossary

Use these terms consistently across `jft-app` and `jft-harness`. App-specific session/persistence terms below describe Doorknob v0.3; they do not introduce a shared schema, integration, or harness storage policy.

| Term                 | Meaning                                                                                                       | Location and lifecycle                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reflection / reading | The prompt a person responds to; saved shares retain the associated snapshot                                  | App: fictional hardcoded source copy, rendered by the UI and copied into each server record                                                                    |
| Draft                | A person's unsaved response                                                                                   | App: React memory only; retained across in-app screens and failed saves; discarded on refresh, leaving the mounted app, or a confirmed save                    |
| Share                | A saved response and its original reading snapshot; saving does not mean sending it to another person         | App: sent to the BFF and stored in memory or explicitly selected DynamoDB; retained without automatic deletion; public links expire after seven days           |
| Anonymous session    | A server-generated owner identity authenticated by a signed cookie, without an account                        | App: shared by requests/tabs with the same site cookie jar; expires after an absolute 30 days                                                                  |
| Session cookie       | Bearer credential containing the owner UUID, expiry, and HMAC signature                                       | Browser cookie storage, HttpOnly/SameSite=Lax and Secure in production; sent to the same host; not encrypted, not share content, and never committed or logged |
| Owner ID             | UUID used to associate a private share with a verified anonymous session                                      | Server record and signed cookie payload; omitted as a field from share JSON; knowing an ID alone does not authorize a request                                  |
| Signing secret       | Server key for issuing/verifying session cookies; not a public sharing token                                  | App server environment or development process memory; never exposed to the frontend; changing it invalidates existing cookies                                  |
| Journal entry        | A dated record supplied to the harness                                                                        | Harness: input fixture records; distinct from the app's share schema                                                                                           |
| Fictional fixture    | Invented test/example data, never a real person's recovery history                                            | Both: committed test/example files; normal Git history retains them                                                                                            |
| Trace                | A harness execution record that may contain complete input text, questions, model responses, and tool results | Harness: local generated files; retention is manual, and traces must not be committed                                                                          |

## Public sharing terms

- **Sharing link**: a URL containing only the server-generated, cryptographically random UUIDv4, `/s/{id}`. The UUID is a bearer credential: anyone who learns it can read that share's original reading and text for seven days from its stored creation time. It does not authorize owner history. The server prepares one URL while saving and keeps it in the same stored share record; there are no separate signatures, sharing secrets, token records, or recipient tracking.
- **Retention**: Private records have no automatic deletion deadline. Public-link expiration does not remove records or revoke private access. Memory is cleared on restart; DynamoDB survives restarts. Cookie loss does not delete records. No account recovery, manual deletion, or backup is provided.

## App data lifecycle

1. Writing updates React state only. Legacy browser-stored drafts are removed on page load. After successful explicit recording Stop, the finalized draft is sent through the same-origin BFF to OpenAI for paragraph/filler cleanup without storing a share. **Save privately** separately sends the reviewed text to the BFF for storage.
2. The server validates the input and signed session, attaches metadata/current reading, and stores an owner-associated record in the configured repository (memory by default, DynamoDB by explicit selection). A lost response can make the client uncertain whether a write occurred; see [failed-write semantics](API.md#retention-and-failed-write-semantics).
3. The server returns a share without an `ownerId` field. History/detail requests send the cookie, check ownership, and return that owner's records to browser memory for display. Saving does not send the share to another person. Save-time UUID links allow anyone holding one to fetch only that reading snapshot and text; no harness or model provider is involved.
4. Access loss and deletion are different events:

| Event                                    | Effect on access                                     | Effect on data                                    |
| ---------------------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| Refresh/tab close                        | Valid cookie permits private reads                   | Draft clears; saved shares remain                 |
| Cookie loss/expiry or signing-key change | Private history cannot be recovered                  | Records remain; public links expire independently |
| Seven days after saving                  | Public links expire; private reads remain authorized | No automatic deletion                             |
| Restart/replace server                   | Stable signing key preserves owner identity          | Memory clears; DynamoDB remains                   |
| Another replica                          | Same cookie/owner checks                             | Memory Maps are isolated; DynamoDB is shared      |

No manual delete endpoint, backup or account recovery is provided. Link expiration cannot recall recipient copies.

## Documentation rules

- Say **save privately** for session-scoped server persistence. Explain that this sends text to the app server; use **send to another person** only when that actually occurs.
- Label invented examples **fictional**. Do not describe fixtures as anonymized personal data.
- Explain storage location, transmission, deletion, and backup behavior wherever a new data flow is introduced. Distinguish loss of access from removal of data.
- Keep real recovery text, questions, traces, credentials, cookie jars, and screenshots containing personal text out of Git, fixtures, CI logs, and PRs.
- “Private” describes session ownership checks. It does not promise encryption at rest, durable storage, account authentication, or recovery. Cookie signing supplies integrity, not confidentiality.

[API reference](API.md) owns HTTP/cookie usage and failure semantics. [Architecture](ARCHITECTURE.md) owns the server/client boundaries. The harness's provider and trace behavior remains documented in its own README; this glossary does not establish a shared retention system.

## Speech data

- **Live audio**: microphone audio captured only after an explicit Record action and streamed directly to OpenAI over WebRTC. No raw audio files, playback, browser audio storage, or BFF audio persistence are added. Browser/OS/network/provider processing still occurs.
- **Provisional transcript**: transient provider deltas displayed in the teleprompter; corrections replace them. They are never included in the draft or save request, and are discarded on end/error/refresh.
- **Final transcript**: the authoritative completed audio segment, appended once to React draft state in audio order. It becomes a share only through explicit saving. Finalized draft text survives recording errors and in-app navigation; refresh discards unsaved words.
- **Provider retention**: separate from Doorknob storage. OpenAI API content is not used for training by default unless opted in. Standard abuse-monitoring logs may retain customer content for up to 30 days, subject to documented exceptions; Realtime documents no application-state retention. Approved account-level retention controls are not enabled or guaranteed by this app. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).
- **Ephemeral credential**: an in-memory browser bearer credential obtained from the BFF after Record. Its 60-second connection-creation expiry does not stop existing sessions or prevent reuse before expiry. Never log/cache it or treat its initial configuration as a strict spending boundary.

## Cleanup data

After explicit Stop successfully finalizes new words, the whole finalized draft is sent through the BFF to OpenAI Responses for light copyediting. The current draft is held in React memory only; successful cleanup replaces it, and failure preserves the original. Pending cleanup is canceled by editing/navigation/unmount and cannot overwrite newer words. Refresh discards the unsaved draft. No provisional text, raw audio or saved share is sent by cleanup, and no repository write occurs. Only explicit Save stores the reviewed draft. Responses uses `store:false` rather than requesting a stored Response; standard provider abuse-monitoring retention still applies. AI may change meaning, so review before saving.
