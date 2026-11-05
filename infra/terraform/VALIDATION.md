# Implementation verification

Verified in an isolated working copy with Node 24.22.1 and locked npm dependencies. The source baseline matches repository main at `5735cf719363b3970eda7041d6a7af031066a3be` apart from checkout line endings. No AWS resource creation, deployment, cloud plan, state bootstrap, or role association was performed.

| Check                                                                                 | Result                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing and new Node suites (`npm test`)                                             | 103 tests passed, including both repository contracts and the Amplify environment helper                                                                      |
| Focused repository/HTTP/public-link rerun with `SHARE_PERSISTENCE=dynamodb` inherited | 12 tests passed; test preloader forces memory and DynamoDB tests use an injected command-aware fake                                                           |
| Next route type generation and TypeScript (`next typegen`, `tsc --noEmit`)            | Passed                                                                                                                                                        |
| Full ESLint (`npm run lint`)                                                          | Passed                                                                                                                                                        |
| Changed-file ESLint                                                                   | Passed                                                                                                                                                        |
| OpenAPI generation and Spectral (`npm run openapi:lint`)                              | Passed; no warnings or errors                                                                                                                                 |
| Formatting of changed application files and deployment guide                          | Passed                                                                                                                                                        |
| Aggregate `npm run check`                                                             | Stops at repository-wide formatting: 142 files reported. Formatting warnings also reproduce against unchanged Desktop source; unrelated files were left alone |
| Terraform 1.17.1 init, backend disabled                                               | Passed in application and bootstrap roots; AWS provider 6.72.0, signed provider downloads and generated lockfiles                                             |
| Terraform recursive format check                                                      | Passed                                                                                                                                                        |
| Terraform validate                                                                    | Both roots passed without warnings after using current GSI `key_schema` syntax                                                                                |

The standard Turbopack production build failed while starting the existing CSS transformation worker (`globals.css`, child process exited before connection), including outside the sandbox. A standard Webpack verification attempt stalled during compilation. The default application build settings were not changed as a workaround. Browser end-to-end tests and a completed browser-bundle inspection remain pending a successful production build.

The storage modules and their AWS imports use `server-only`; Next.js rejects importing those modules into Client Components. Type checking and the existing API/OpenAPI suites passed, but they do not replace the outstanding deployment/build and browser checks. AWS service-side TTL deletion, compute-role credentials, live GSI visibility, and the Hosting adapter require development-environment smoke tests before production. AWS's documented Next.js support matrix currently lists versions through 15, while this source uses 16.4.3; see the [deployment guide](README.md).

Files changed are grouped as follows:

- `infra/terraform/`: version/provider/backend configuration, table, IAM role/policy/attachment, environment examples, protected state-bucket bootstrap, dependency locks, deployment and validation documentation.
- `.github/workflows/terraform.yml`: backend-free validation for both Terraform roots; no AWS credentials, plan or apply.
- `src/shares/server/storage/`: DynamoDB implementation, configuration selection, server-only TTL metadata and expiry enforcement in memory.
- `src/shares/server/application/read-public-share.ts`: additional public lifetime guard, with the same response projection.
- `scripts/prepare-persistence-env.mjs`, `infra/runtime.env.example`: validated non-secret SSR configuration.
- `tests/shares/dynamodb-repository.test.ts`, `tests/quality/persistence-env.test.ts`, `tests/fixtures/local-persistence.mjs`, `playwright.config.ts`: repository/API/expiry/failure/configuration tests and credential-free test selection.
- `package.json`, `package-lock.json`: AWS SDK v3 DynamoDB dependencies and test preload.
- `.gitignore`, `.prettierignore`, `eslint.config.mjs`: exclude Terraform state/plans/provider downloads while retaining provider lockfiles.
- `README.md`, `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/DATA_GLOSSARY.md`: persistence and seven-day retention documentation.

There is no existing manual delete operation to preserve. The repository interface remains unchanged and TTL performs eventual deletion; tests simulate that service-side removal rather than granting unnecessary DeleteItem access or adding a new public API.
