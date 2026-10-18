# Data glossary

Use these terms consistently across `jft-app` and `jft-harness`. This vocabulary describes each repository's data without introducing a shared schema or integration.

| Term                 | Meaning                                                                                                       | Location and lifecycle                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Reflection / reading | The prompt or reading a person responds to                                                                    | App: hardcoded source copy; a snapshot is stored with each share                      |
| Draft                | A person's unsaved response                                                                                   | App: React memory only; lost on refresh or tab close                                  |
| Share                | A person's saved response and its reading snapshot; saving does not mean sending it to anyone                 | App: localStorage in the current browser and origin; removed by clearing site data    |
| Journal entry        | A dated record supplied to the harness                                                                        | Harness: input fixture records; distinct from the app's share schema                  |
| Fictional fixture    | Invented test or example data, never a real person's recovery history                                         | Both: committed test/example files; normal Git history retains them                   |
| Trace                | A harness execution record that may contain complete input text, questions, model responses, and tool results | Harness: local generated files; retention is manual, and traces must not be committed |

## Documentation rules

- Say **save privately** for local app persistence. Use **send** only when data actually goes to another person or service.
- Label invented examples **fictional**. Do not describe fixtures as anonymized personal data.
- Explain storage location, transmission, deletion, and backup behavior wherever a new data flow is introduced.
- Keep real recovery text, questions, traces, credentials, and screenshots containing personal text out of Git, test fixtures, CI logs, and PRs.
- “Private” describes the app's current local storage behavior, not encryption, account isolation, or a security guarantee.

The current app sends no share text to the harness or a model provider. The harness's provider and trace behavior must remain documented in its own README; this glossary does not establish a shared privacy policy or retention system.
