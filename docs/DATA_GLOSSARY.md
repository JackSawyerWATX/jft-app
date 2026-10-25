# Data glossary

Use these terms consistently across `jft-app` and `jft-harness`. App-specific session/persistence terms below describe Doorknob v0.3; they do not introduce a shared schema, integration, or harness storage policy.

| Term                 | Meaning                                                                                                       | Location and lifecycle                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reflection / reading | The prompt a person responds to; saved shares retain the associated snapshot                                  | App: fictional hardcoded source copy, rendered by the UI and copied into each server record                                                                    |
| Draft                | A person's unsaved response                                                                                   | App: React memory only; retained across in-app screens and failed saves; discarded on refresh, leaving the mounted app, or a confirmed save                    |
| Share                | A saved response and its original reading snapshot; saving does not mean sending it to another person         | App: sent to the same-origin BFF and stored in an owner-scoped process Map; returned to its owner on request; erased on server restart                         |
| Anonymous session    | A server-generated owner identity authenticated by a signed cookie, without an account                        | App: shared by requests/tabs with the same site cookie jar; expires after an absolute 30 days                                                                  |
| Session cookie       | Bearer credential containing the owner UUID, expiry, and HMAC signature                                       | Browser cookie storage, HttpOnly/SameSite=Lax and Secure in production; sent to the same host; not encrypted, not share content, and never committed or logged |
| Owner ID             | UUID used to associate a private share with a verified anonymous session                                      | Server record and signed cookie payload; omitted as a field from share JSON; knowing an ID alone does not authorize a request                                  |
| Signing secret       | Server key for issuing/verifying session cookies; not a public sharing token                                  | App server environment or development process memory; never exposed to the frontend; changing it invalidates existing cookies                                  |
| Journal entry        | A dated record supplied to the harness                                                                        | Harness: input fixture records; distinct from the app's share schema                                                                                           |
| Fictional fixture    | Invented test/example data, never a real person's recovery history                                            | Both: committed test/example files; normal Git history retains them                                                                                            |
| Trace                | A harness execution record that may contain complete input text, questions, model responses, and tool results | Harness: local generated files; retention is manual, and traces must not be committed                                                                          |

## Public sharing terms

- **Sharing link**: a URL containing only the server-generated, cryptographically random UUIDv4, `/s/{id}`. The UUID is a bearer credential: anyone who learns it can read that share's original reading and text for seven days from its stored creation time. It does not authorize owner history. The server prepares one URL while saving and keeps it in the same in-memory share record; there are no separate signatures, sharing secrets, token records, or recipient tracking.
- **Expiration**: rejects subsequent reads; it neither deletes the share nor erases a recipient's copy. Fixed at seven days from saving. No immediate individual-link revocation exists.

## App data lifecycle

1. Writing updates React state only. Legacy browser-stored drafts are removed on page load. The app sends the draft to the same-origin BFF when the person chooses **Save privately**.
2. The server validates the input and signed session, attaches metadata/current reading, and stores an owner-associated record in process memory. A lost response can make the client uncertain whether a write occurred; see [failed-write semantics](API.md#retention-and-failed-write-semantics).
3. The server returns a share without an `ownerId` field. History/detail requests send the cookie, check ownership, and return that owner's records to browser memory for display. Saving does not send the share to another person. Save-time UUID links allow anyone holding one to fetch only that reading snapshot and text; no harness or model provider is involved.
4. Access loss and deletion are different events:

| Event                                      | Effect on access                                                                          | Effect on data                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Refresh or tab close                       | A valid cookie still permits fetching saved shares                                        | Refresh starts an empty draft and reset recorder; server records and saved history remain |
| Clear site cookies                         | A new request gets a different owner; prior shares become inaccessible                    | Existing server records remain in the running Map                                         |
| Cookie expiry or signing-key change        | A fresh empty owner is issued; no account recovery exists                                 | Records remain in memory; there is no automatic expiry/deletion job                       |
| Restart/replace the Node process           | A valid configured-key cookie can still authenticate, but its old records no longer exist | All shares in that process are lost; an ephemeral development key also resets             |
| Route a request to another process/replica | Only records in that process can be found                                                 | Maps are separate; no synchronization or durable backing store exists                     |

There is no per-share delete endpoint, backup, disk storage, encryption at rest, or migration/import of v0.1 test data. The Map retains records until process exit and is unsuitable for reliable serverless/multi-instance persistence. Clearing cookies is not a deletion mechanism. UUID public links grant bearer access until expiration or loss of the underlying record. They are stored only in the share record and are not individually revocable; clearing owner cookies does not invalidate them. Recipients can forward links or retain copies; expiry cannot recall content. Future share deletion will invalidate all links, but no delete endpoint exists in v0.3.

## Documentation rules

- Say **save privately** for session-scoped server persistence. Explain that this sends text to the app server; use **send to another person** only when that actually occurs.
- Label invented examples **fictional**. Do not describe fixtures as anonymized personal data.
- Explain storage location, transmission, deletion, and backup behavior wherever a new data flow is introduced. Distinguish loss of access from removal of data.
- Keep real recovery text, questions, traces, credentials, cookie jars, and screenshots containing personal text out of Git, fixtures, CI logs, and PRs.
- “Private” describes session ownership checks. It does not promise encryption at rest, durable storage, account authentication, or recovery. Cookie signing supplies integrity, not confidentiality.

[API reference](API.md) owns HTTP/cookie usage and failure semantics. [Architecture](ARCHITECTURE.md) owns the server/client boundaries. The harness's provider and trace behavior remains documented in its own README; this glossary does not establish a shared retention system.

## Speech input data

Browser-managed speech recognition may send microphone audio to a browser vendor or recognition service; local/offline processing is not guaranteed. Doorknob itself does not record, upload, or store audio. Provisional recognition text exists only in component memory and is discarded when recognition ends. Final segments become ordinary editable draft text and remain only in React memory until explicitly saved; refresh discards the unsaved draft. Only Save privately sends that text to the BFF; saved dictated shares have the same text model, retention, owner history, and sharing-link behavior as typed shares. Navigation/unmount aborts recognition; no background recording or automatic saving is provided.
