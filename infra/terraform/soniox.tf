locals {
  project_prefix = "${var.project_name}-${var.environment}"
}

# Metadata only: no secret version/data source may put key material in state.
resource "aws_secretsmanager_secret" "soniox" {
  count                   = var.create_soniox_secret ? 1 : 0
  name                    = "${local.project_prefix}-soniox-api-key"
  description             = "Permanent Soniox key for server-issued temporary realtime credentials"
  recovery_window_in_days = 30
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = var.stt_soniox_secret_arn == null
      error_message = "Set create_soniox_secret=false to use an existing Soniox secret."
    }
  }
}

locals {
  soniox_secret_arn = var.create_soniox_secret ? aws_secretsmanager_secret.soniox[0].arn : var.stt_soniox_secret_arn
}

data "aws_iam_policy_document" "soniox" {
  count = var.create_soniox_secret || var.stt_soniox_secret_arn != null ? 1 : 0
  statement {
    sid       = "ReadSonioxCredential"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [local.soniox_secret_arn]
  }
}

resource "aws_iam_role_policy" "soniox" {
  count  = var.create_soniox_secret || var.stt_soniox_secret_arn != null ? 1 : 0
  name   = "${local.project_prefix}-soniox-secret"
  role   = aws_iam_role.compute.name
  policy = data.aws_iam_policy_document.soniox[0].json
}

output "stt_soniox_secret_arn" {
  value       = local.soniox_secret_arn
  description = "Server-only STT_SONIOX_SECRET_ARN. This is metadata, never key material."
}
