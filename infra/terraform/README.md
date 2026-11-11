# Application infrastructure

This single root/state manages the shares table, its owner/time index, the Amplify SSR compute role, and optional Soniox secret metadata/access. No application or Amplify branch is created. Bootstrap state separately, then review and apply this root manually. GitHub Actions validates and tests Terraform; merging code does not provision resources.

## Configuration

Set the resource/state region once and select the appropriate temporary-credential profile:

```bash
export AWS_REGION=us-west-2
export AWS_PROFILE=doorknob-dev
```

The AWS providers and S3 backend use `AWS_REGION`, or the profile's region when unset. If state intentionally lives elsewhere, initialize with `-backend-config=region=STATE_BUCKET_REGION`. Backends cannot reference Terraform input variables.

`environments/soniox-dev.tfvars` and `soniox-prod.tfvars` explicitly select `project_name`, `environment` and `create_soniox_secret`. Additional optional values belong in ignored `*.local.tfvars` files:

```hcl
# Reuse an existing secret instead of creating its metadata:
create_soniox_secret      = false
stt_soniox_secret_arn     = "arn:aws:secretsmanager:us-west-2:123456789012:secret:existing-soniox-REPLACE"
```

The root manages exactly one SSR compute role, `${project_name}-${environment}-ssr-compute`. Persistence, OpenAI cleanup and optional Soniox permissions all attach to it; `compute_role_arn` is the role to associate with the trusted Amplify branch. If that role already exists, import it into `aws_iam_role.compute` in this same state before applying. There is no separate speech-role override. Review existing policies before adopting a role; never apply competing Terraform states to the same resource.

## Account, secret and permissions

1. Create separate Soniox dev/prod projects/keys with billing and usage monitoring. Restrict each key to **Temporary API keys** and **Speech-to-text, real-time** (`transcribe_websocket`); omit unrelated products. Check [current permissions documentation](https://docs.soniox.com/authentication/api-key-permissions).
2. By explicit environment choice, Terraform creates metadata for `${project_name}-${environment}-soniox-api-key`, using default tags and AWS-managed encryption. It creates no secret version and reads no value into state. Alternatively, reference one existing ARN. Creating and referencing simultaneously fails; disabling creation without an ARN omits Soniox access.
3. After reviewed apply, populate the **plain-string** value separately using Secrets Manager's secure console editor. Never pass keys as Terraform arguments, variables, outputs, shell history, committed files or build settings.
4. The inline Soniox policy grants only `secretsmanager:GetSecretValue` on the configured secret. It does not replace existing role policies or manage OpenAI access. OpenAI cleanup permission belongs to the existing deployment/persistence infrastructure ; retain that grant exactly once. Customer-managed KMS secrets additionally require a separately reviewed exact-key `kms:Decrypt` grant and key policy.

No static AWS keys are used. The runtime AWS SDK uses the compute-role credential chain. The shared secret loader caches successful reads for five minutes per process/ARN; restart for immediate rotation pickup.

## Bootstrap remote state once per environment

`bootstrap/` creates a private, encrypted, versioned S3 bucket with TLS-only access, public access blocked and destruction protection. If already managed, reuse its bootstrap state and bucket. Bootstrap state starts in protected local storage outside Git.

```bash
export TF_DATA_DIR="$PWD/.tmp/bootstrap-dev"
terraform -chdir=infra/terraform/bootstrap init
terraform -chdir=infra/terraform/bootstrap plan -var=environment=dev -var=bucket_name=REPLACE-WITH-UNIQUE-DEV-BUCKET -state="$PWD/.tmp/bootstrap-dev.tfstate" -out=bootstrap-dev.tfplan
# Operator reviews the account, region, bucket and plan before applying.
terraform -chdir=infra/terraform/bootstrap apply -state="$PWD/.tmp/bootstrap-dev.tfstate" bootstrap-dev.tfplan
```

Copy `environments/dev.s3.tfbackend.example` to its ignored matching backend file and supply the actual bucket. Production uses its own profile, bucket/backend key, data directory and variables. Native S3 locking requires no lock table. State operators need scoped S3 key/prefix access, including Get/Put/Delete on `.tflock`; routine state deletion is unnecessary. Commit provider lockfiles, never state, plans or credentials.

## Validate, review and apply manually

Credential-free checks include mocked-provider tests:

```bash
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform init -backend=false -input=false
terraform -chdir=infra/terraform validate
terraform -chdir=infra/terraform test
terraform -chdir=infra/terraform/bootstrap init -backend=false -input=false
terraform -chdir=infra/terraform/bootstrap validate
```

For a deployment, initialize the selected remote backend and inspect a saved plan:

```bash
export TF_DATA_DIR="$PWD/.tmp/terraform-dev"
terraform -chdir=infra/terraform init -reconfigure -backend-config=environments/dev.s3.tfbackend
terraform -chdir=infra/terraform plan -var-file=environments/dev.tfvars -var-file=environments/dev.local.tfvars -out=dev.tfplan
# Operator reviews exact account, environment, resources and permissions.
terraform -chdir=infra/terraform apply dev.tfplan
terraform -chdir=infra/terraform output stt_soniox_secret_arn
```

Omit the local var file if unnecessary. Use matching prod files/profile/data directory for production. Keep saved plans private and remove them afterward. CI performs validation only, never automatic apply.

## Amplify runtime and rollout

Associate the existing role only with the intended trusted branch, using the console or a manually reviewed command:

```bash
aws amplify update-branch --app-id REPLACE_APP_ID --branch-name REPLACE_TRUSTED_BRANCH --compute-role-arn REPLACE_ROLE_ARN
```

Use the `compute_role_arn` output for that association. The operator needs scoped `amplify:UpdateBranch` and `iam:PassRole`; runtime code gets neither. Do not make a secret-capable role an app-wide default for untrusted previews. The build service role is distinct from the SSR compute role.

Set server-only runtime settings `STT_ENABLED=true`, `STT_PROVIDER=soniox`, `STT_SONIOX_SECRET_ARN=<output ARN>` and the existing `STT_OPENAI_SECRET_ARN` for cleanup. Preserve stable session signing and existing application permissions. Run `node --import tsx scripts/prepare-runtime-env.ts` from the repository root before `npm run build`; it edits only allowlisted non-secret assignments in `.env.production` and preserves unrelated source using dotenvx's source editor. Permanent API keys must not enter Amplify build variables/artifacts. `STT_SONIOX_API_KEY` is local-only and ignored in production.

Use [the runtime guide](../../docs/TRANSCRIPTION.md) for application configuration, token/lifecycle behavior and physical-device/provider release checks. Neither local validation nor a code merge establishes a live AWS deployment or live transcription test.

## Costs, monitoring and rollback

Consult current Soniox audio pricing. Secrets Manager adds per-secret/month and request charges; state S3 adds storage/version/request costs. Existing Amplify and OpenAI cleanup charges continue. Monitor issuance counts, failures, concurrency and provider usage without logging speech or credentials. Anonymous cookies/process-local limits are insufficient for public spending protection; distributed quotas, concurrency/abuse controls and provider controls are required. Alerts may not stop spending. Review provider retention independently from application storage policy.

To switch speech back, set `STT_PROVIDER=openai`, retain its independent credentials/permission, rebuild/redeploy and reload clients. Cleanup already uses OpenAI. Set `STT_ENABLED=false` to disable both paid operations. Already issued Soniox keys can connect during their 60-second lifetime; active streams have the ten-minute cap. For incident response, verify the provider's revocation semantics before relying on parent-key revocation to stop active streams.

Keep secret metadata and shared role/state resources during rollback. Managed secrets have `prevent_destroy` and a 30-day recovery window; changing creation to false intentionally blocks accidental deletion. Removing metadata or rotating live keys requires a separate reviewed operator action. No application persistence resources should change in a speech rollback.

## Persistence and retention

Choose matching `environments/dev.tfvars` or `prod.tfvars`, backend, profile and data directory. Set `create_soniox_secret` deliberately, or pass an existing ARN in a private local var file. Preserve/import existing managed role/table resources into this same state before applying; never apply the speech and persistence snapshots as separate stacks. The output `runtime_environment` supplies `SHARE_PERSISTENCE=dynamodb`, `DYNAMODB_TABLE_NAME` and `DYNAMODB_REGION`.

Run `node --import tsx scripts/prepare-runtime-env.ts` once before `npm run build`. It validates persistence and speech settings before changing `.env.production`, edits only allowlisted nonsecret assignments, preserves unrelated settings (including existing session-secret delivery), and clears stale managed values. Keep `SESSION_SECRET` stable and delivered through the deployment's existing secure mechanism. The helper never copies provider keys, AWS credentials or signing secrets from the build environment. See [transcription configuration](../../docs/TRANSCRIPTION.md) for speech settings.

Public links expire after seven days; owner history and underlying records do not. The table disables legacy `expiresAt` TTL, and new writes omit it. Review/apply that change before deploying this retention policy against any existing table; previously deleted records cannot be recovered, and in-flight service deletions may continue after disabling TTL. There is no manual delete endpoint, backup or account recovery. See [data lifecycle](../../docs/DATA_GLOSSARY.md#app-data-lifecycle).

For local database tests, start DynamoDB Local on port 8000 and run `DYNAMODB_LOCAL_ENDPOINT=http://localhost:8000 npm run test:dynamodb`. The shared repository contract covers both adapters; the integration suite additionally exercises pagination/order/conditional writes. Default `npm test` requires no database or provider credentials. Database-backed HTTP tests cover owner isolation, public-link expiry, retained private access and response projection. GSI visibility checks use bounded polling; immediate read-after-write assertions apply only to detail reads.

Before rollout, test the actual Amplify adapter, runtime role credentials, stable cookies, owner isolation, public-link expiration and delayed history visibility in development. A passing local build does not establish hosting compatibility. No live AWS validation is claimed here.

DynamoDB is on-demand; request and retained table/index storage costs grow with usage. Check current regional rates. There is no retention-based storage bound. Rolling back to memory hides durable history and makes new saves disposable; it is not a migration. Preserve the table and stable signing key during compatible code rollbacks. Table destruction permanently deletes private history; production deletion protection must be deliberately disabled in a reviewed plan first.

## Bounded history

The API returns at most 20 shares by default (maximum requested limit 50). The client follows `X-Next-Cursor` only after an explicit Load more action; a database size boundary can produce a smaller page. Cursors are private positions, not authorization credentials. Each query reconstructs its owner partition from the verified session. See [the API contract](../../docs/API.md#list-private-shares) for request/response details. Pagination is not a consistent snapshot across concurrent writes or index propagation; the UI deduplicates repeated IDs and refresh starts again from the newest page.
