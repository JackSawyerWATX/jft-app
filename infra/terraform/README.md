# Doorknob infrastructure and persistence

This configuration has **not** been deployed. The commands below change resources only when an operator explicitly runs `apply` or associates a compute role. No application, branch, VPC, API Gateway, Lambda, Amplify Data, AppSync, Cognito, access key, or PostgreSQL database is created here.

## Architecture and decisions

The existing Next.js Node Route Handlers dispatch to Hono. Signed HttpOnly cookies carry a verified anonymous owner ID; private handlers supply that owner to `ShareRepository`. The create request still accepts text only. Public UUID links still return only the reading snapshot and text. No login, UI, or public API fields are added.

`src/shares/server/storage/dynamodb-repository.ts` implements the existing four-method interface using AWS SDK v3. One on-demand table stores the existing record plus server-only `expiresAt` (Unix seconds). Its primary key is `id`; the `owner-created-at` GSI partitions by `ownerId` and sorts by ISO UTC `createdAt`. It projects the whole share for one-query history. Queries follow every `LastEvaluatedKey`, including empty filtered pages, and return newest first. Equal creation times retain the database's unspecified tie order; there is no new ordering promise for ties. GetItem is strongly consistent; GSI history is eventually consistent, so a just-saved share may appear after a short delay. The create response and private detail are immediately available.

All repository reads enforce ownership where applicable and seven-day expiry. `expiresAt` is computed as `floor(createdAt milliseconds / 1000) + 604800`, with second precision. A second guard refuses records older than seven days even if an invalid later TTL was stored. Future-dated records are unavailable. Public-link service checks expiry too. No client-provided metadata controls retention. DynamoDB TTL later removes expired records; it can take days. Expired items may still incur storage/query charges until then, but no read path returns them. See [AWS TTL behavior](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html).

Memory remains the default for local use and tests; it prunes expired items on repository operations, without a background timer. It is disposable and not shared across processes. Explicitly select DynamoDB for every deployed branch needing persistence. Selection is lazy so build-time OpenAPI generation does not require AWS access; invalid selection/configuration fails on the first repository operation, and the Amplify preparation command below also validates configuration before build. Neither implementation falls back after a database failure.

The existing interface has no manual deletion operation or deletion endpoint. This change keeps that interface: physical deletion is DynamoDB TTL, and no DeleteItem/UpdateItem permission is granted. Adding user-triggered deletion later requires an owner-conditional operation and a separately reviewed API change. Tests simulate TTL deletion but do not claim to exercise the AWS TTL service. No PITR, backups, streams, or replicated tables are enabled; retained backups would need a separate privacy/retention decision.

Daily readings remain the existing fictional fixture, copied into shares. A daily-content database/feed is outside this request. The earlier `database/` PostgreSQL draft and `scripts/database.mjs`, if present in your local copy, are superseded proposals and are not required or executed by this implementation. No production Postgres migration is assumed.

## Prerequisites and permissions

- Node 24 (`.nvmrc`), `npm ci`, AWS CLI v2, and Terraform 1.17.x. This change was prepared with Terraform 1.17.1 and AWS provider 6.72.0; constraints accept patches in those minor release lines. Commit `.terraform.lock.hcl` files; do not commit state, plan files, backend credentials, or `.terraform/`.
- An existing Amplify SSR app and separate dev/prod branches (prefer separate AWS accounts where possible). Record its app ID and branch names yourself. Terraform does not import or manage them.
- AWS CLI profiles authenticated with temporary credentials. `aws login --profile jft-console --region us-west-2` can reuse an IAM console login; IAM Identity Center users can configure an SSO profile instead. Every example requires selecting an environment explicitly.
- Bootstrap operator: scoped S3 bucket creation/configuration permissions, including PutBucketPublicAccessBlock, PutBucketOwnershipControls, PutBucketVersioning, PutEncryptionConfiguration, PutBucketPolicy, tagging and corresponding reads. Protect that access as infrastructure administration.
- App infrastructure operator: DynamoDB table creation/configuration/tagging/TTL/index/encryption and corresponding reads; IAM role creation/trust policy/tagging, policy creation/versioning/attachment, and matching cleanup permissions for these named resources. Terraform may require list/read calls for discovery; scope write access to the project/environment. The operator is different from the SSR role.
- Role association operator: `amplify:UpdateBranch` (or console equivalent) on the intended existing branch and `iam:PassRole` only on the output compute role with `iam:PassedToService = amplify.amazonaws.com`. Do not give this permission to arbitrary preview code.

State access: grant `s3:ListBucket` on the environment's state bucket, restricted to the state key prefix; `s3:GetObject` and `s3:PutObject` on the exact state key; and `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on the exact `<key>.tflock`. Do not grant DeleteObject on the state itself for routine operation. State version recovery needs additional deliberate administrator permissions. SSE-S3 needs no KMS permissions. See [HashiCorp's S3 backend permissions](https://developer.hashicorp.com/terraform/language/backend/s3#permissions-required).

## Bootstrap remote state once per environment

The independent `bootstrap/` root creates a private, versioned S3 bucket with SSE-S3 encryption, public access blocked, bucket-owner-enforced ownership, and a deny policy for non-TLS requests. It is not invoked by normal application infrastructure commands. Its bucket is protected from Terraform destruction and never force-emptied. Bootstrap state is initially local: keep it in protected storage outside Git and back it up securely. It contains infrastructure metadata, not transcript data.

PowerShell, from the repository root. Replace bucket names with globally unique names you control. Choose `dev` or `prod`; do not reuse a bucket or state directory accidentally:

```powershell
$environmentName = 'dev'
$profileName = 'jft-console'
$regionName = 'us-west-2'
$bucketName = 'REPLACE-WITH-GLOBALLY-UNIQUE-DEV-STATE-BUCKET'
if ($environmentName -notin @('dev', 'prod')) { throw 'Select dev or prod' }
$env:AWS_PROFILE = $profileName
aws sts get-caller-identity --profile $profileName
# Verify the account and region before continuing.
$env:TF_DATA_DIR = Join-Path (Get-Location) ".tmp/terraform-bootstrap-$environmentName"
$bootstrapState = Join-Path (Get-Location) ".tmp/bootstrap-$environmentName.tfstate"
terraform -chdir=infra/terraform/bootstrap init -input=false
terraform -chdir=infra/terraform/bootstrap plan "-state=$bootstrapState" "-var=environment=$environmentName" "-var=aws_region=$regionName" "-var=bucket_name=$bucketName" -out="bootstrap-$environmentName.tfplan"
# Review the plan. Run this only after explicit approval:
terraform -chdir=infra/terraform/bootstrap apply "-state=$bootstrapState" "bootstrap-$environmentName.tfplan"
```

Keep the saved plan private and remove it after use; it is ignored by Git. Use a distinct `bootstrapState` and bucket for production. Never rerun bootstrap with a missing existing bootstrap state and assume it is a new bucket.

## Initialize and plan the application environment

Copy `environments/dev.s3.tfbackend.example` to `environments/dev.s3.tfbackend` (or the prod equivalents), replacing the bucket placeholder. The backend examples specify distinct state keys; using distinct buckets/accounts strengthens isolation. Actual backend files are ignored. Do not put credentials in backend configs. `encrypt = true` and native `use_lockfile = true` are fixed in `backend.tf`; no lock table is needed. Stay in the default workspace; environment isolation uses backend files, not workspaces.

Review the matching `environments/<environment>.tfvars` before proceeding. Both examples use Oregon (`us-west-2`) as a starting point, not as a claim about your live deployment. Production deletion protection is on. Naming is `doorknob-<environment>-shares` and `doorknob-<environment>-ssr-compute`; change `project_name` before first deployment if needed.

```powershell
$environmentName = 'dev' # Choose explicitly; use matching profile/backend/variables.
$profileName = 'jft-console'
if ($environmentName -notin @('dev', 'prod')) { throw 'Select dev or prod' }
$env:AWS_PROFILE = $profileName
aws sts get-caller-identity --profile $profileName
$env:TF_DATA_DIR = Join-Path (Get-Location) ".tmp/terraform-$environmentName"
terraform -chdir=infra/terraform init -input=false -reconfigure "-backend-config=environments/$environmentName.s3.tfbackend"
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform validate
terraform -chdir=infra/terraform plan "-var-file=environments/$environmentName.tfvars" -out="$environmentName.tfplan"
# Review exact account, region, names, IAM permissions, and changes.
# Run only after explicit approval, particularly for prod:
terraform -chdir=infra/terraform apply "$environmentName.tfplan"
terraform -chdir=infra/terraform output
```

If your existing OpenAI provider uses `STT_OPENAI_SECRET_ARN`, set `stt_openai_secret_arn` to that exact existing ARN in a private `*.local.tfvars` file and pass that file as a second `-var-file` to `plan`. Terraform only grants GetSecretValue; it never reads or creates the secret. For a customer-managed KMS key, separately preserve a narrowly scoped `kms:Decrypt` permission on its exact key ARN and the corresponding key policy. Review all current compute-role permissions before replacing that role; do not accidentally break session-secret delivery or other existing integrations. No broad Secrets Manager, KMS, or CloudWatch permission is added to this new role. Hosting's existing build/service/log role remains unchanged.

## Connect the existing Amplify branch

1. Record the previous branch compute-role ARN and configuration for rollback. Inspect whether the role is shared by other branches and which provider/secret permissions it currently carries.
2. In Amplify, open the **existing app → App settings → IAM roles → Compute role → Edit**. Set a branch-specific compute role override to the Terraform `compute_role_arn` for that environment. Leave the default role for other branches unchanged. Do not attach production data access as an app-wide default or to untrusted pull-request previews. See [AWS compute-role instructions](https://docs.aws.amazon.com/amplify/latest/userguide/amplify-SSR-compute-role.html).
3. This role uses the documented `amplify.amazonaws.com` trust principal. The trust policy itself is not restricted to one app/branch; association is controlled by administrative PassRole/UpdateBranch access. Restrict those operator permissions and review branch settings. No account IDs or credentials are hardcoded. Additional SourceArn restrictions require verifying the exact context keys supplied by Hosting in your account before tightening the trust policy.
4. Set **branch-specific** build environment variables from Terraform's `runtime_environment` output: `SHARE_PERSISTENCE=dynamodb`, `DYNAMODB_TABLE_NAME=<output>`, and `DYNAMODB_REGION=<region>`. Use `DYNAMODB_REGION` because Amplify reserves names starting with `AWS`. Never add AWS access keys or use `NEXT_PUBLIC_` for these values.
5. Merge the following into the existing Amplify console build specification, without overwriting its existing secret/provider/build settings. No new `amplify.yml` is supplied because this source snapshot has none and the live build specification was not inspected:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - nvm install 24
        - nvm use 24
        - npm ci
    build:
      commands:
        - node scripts/prepare-persistence-env.mjs
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
```

The helper copies only the three non-secret persistence settings into `.env.production`. It validates an explicit DynamoDB selection before build. It does not copy credentials or session/provider secrets. Retain your existing secure delivery of a stable `SESSION_SECRET` (32+ bytes), required by the current authentication code; if that is not configured, do not roll out this persistence change until it is. A signing-key change loses anonymous ownership and cannot be repaired by the database. The SDK automatically retrieves temporary credentials from the assigned compute role. See [AWS SSR environment-variable behavior](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-environment-variables.html).

6. Deploy to the development branch first. Using fictional text, save, refresh, reopen, check a second browser cannot see the first browser's private history, and test the public link. Inspect runtime errors without logging share IDs, cookie values, or transcripts. Check delayed GSI visibility is acceptable.
7. Confirm compatibility before production: this repo uses Next.js 16.4.3 and Node 24. AWS currently documents Hosting Next.js support through 15 ([support matrix](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html)); its [runtime guide](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-supported-features.html) lists Node 24 support. This change does not downgrade Next.js, import the app, or prove the live deployment supports Next 16. Test Route Handlers, server-only SDK credential resolution and public recipient routes on your existing adapter. There is no reliance on Edge runtimes, streaming, or background functions.

## Local development and validation

Default `SHARE_PERSISTENCE=memory` needs neither AWS credentials nor Docker. `infra/runtime.env.example` lists the non-secret options. There is no mandatory DynamoDB Local dependency. All SDK tests use a command-aware fake client; no AWS calls are made by the test suite.

```powershell
npm ci
npm run check
npm run test:e2e
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform init -backend=false -input=false
terraform -chdir=infra/terraform validate
terraform -chdir=infra/terraform/bootstrap init -backend=false -input=false
terraform -chdir=infra/terraform/bootstrap validate
```

Use a fresh local `TF_DATA_DIR` for backend-free checks if a real remote backend was previously initialized. No `plan`, `apply`, bootstrap, role association, or live account lookup is performed by the validation workflow. The PR workflow validates both roots with read-only repository permissions and no AWS credentials. A cloud plan workflow is deliberately deferred until an operator provisions/reviews an environment-specific GitHub OIDC trust and state-reading/lock-writing policy. No static GitHub AWS secrets or automatic apply are included.

## Rollback, retention, and deletion

Rolling code back does not restore expired content. Keep the table, TTL, stable session secret, IAM role, and DynamoDB selection while rolling back application code where compatible. Switching to memory hides durable shares and makes new saves disposable; it is an emergency degradation, not a data migration or restoration. No data is migrated from process-local Maps. Never disable application expiry as a rollback strategy.

TTL is eventual deletion, not an exact seven-day erasure guarantee. Copies held by recipients or existing external logs/backups are outside this application's deletion control. If exact scheduled erasure is required, this design needs a separate reviewed deletion mechanism. No backups were added to quietly retain content longer.

Before infrastructure destruction, stop new writes and detach branch compute-role associations. Disabling deletion protection and destroying the table permanently removes all remaining shares, including unexpired ones. For prod, first review a plan setting `deletion_protection=false`, then review a separate destroy plan for the explicitly selected backend/environment. Never use an unreviewed `destroy -auto-approve`. Keep the state bucket/version history for recovery of infrastructure metadata. Its bootstrap `prevent_destroy` protection requires deliberate code review to remove; do not empty it as ordinary application cleanup.

## Cost estimate

For the DynamoDB Standard example rates in US East (N. Virginia), AWS lists approximately $0.625/million write request units, $0.125/million read request units, and $0.25/GB-month storage. Region and pricing can differ; verify [current AWS rates](https://aws.amazon.com/dynamodb/pricing/) before deploying. These are usage estimates, not an account bill or free-tier guarantee.

For example, 10,000 monthly shares billed at 2 KiB each require roughly 40,000 write units including the ALL-projection GSI (~$0.025). Another 100,000 read units are ~$0.0125. A seven-day steady-state table plus index is roughly 0.01 GB (~$0.0025/month), before TTL deletion lag, metadata overhead, or larger readings. Light use should cost well under $1/month for this table, but abuse, long text, large history queries and higher traffic can raise costs. There is no new minimum instance charge, NAT gateway, customer KMS key, or PITR fee.

The state bucket adds small S3 storage/request/version charges. IAM roles/policies have no separate charge. Existing Amplify build/SSR/transfer, CloudWatch logs, Secrets Manager and OpenAI transcription/cleanup charges are separate and may dominate. No budgets or spend controls were deployed; existing process-local paid-operation throttles are not a distributed spending limit.
