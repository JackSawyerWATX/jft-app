locals {
  prefix = "${var.project_name}-${var.environment}"
}

resource "aws_dynamodb_table" "shares" {
  name                        = "${local.prefix}-shares"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "id"
  deletion_protection_enabled = var.deletion_protection

  attribute {
    name = "id"
    type = "S"
  }
  attribute {
    name = "ownerId"
    type = "S"
  }
  attribute {
    name = "createdAt"
    type = "S"
  }

  global_secondary_index {
    name            = "owner-created-at"
    projection_type = "ALL"
    key_schema {
      attribute_name = "ownerId"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "createdAt"
      key_type       = "RANGE"
    }
  }
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
  server_side_encryption {
    enabled = true
  }
  # No PITR/backups: copies must not silently create a long-term journal.
}

# AWS's documented Hosting SSR compute trust principal. Associate only with the
# intended branch; do not attach as an app default shared with untrusted previews.
data "aws_iam_policy_document" "compute_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["amplify.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "compute" {
  name               = "${local.prefix}-ssr-compute"
  assume_role_policy = data.aws_iam_policy_document.compute_trust.json
}

data "aws_iam_policy_document" "shares" {
  statement {
    sid       = "CreateAndReadShares"
    actions   = ["dynamodb:PutItem", "dynamodb:GetItem"]
    resources = [aws_dynamodb_table.shares.arn]
  }
  statement {
    sid       = "QueryOwnerHistory"
    actions   = ["dynamodb:Query"]
    resources = ["${aws_dynamodb_table.shares.arn}/index/owner-created-at"]
  }
  dynamic "statement" {
    for_each = var.stt_openai_secret_arn == null ? [] : [var.stt_openai_secret_arn]
    content {
      sid       = "ExistingOpenAISecret"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [statement.value]
    }
  }
}

resource "aws_iam_policy" "shares" {
  name   = "${local.prefix}-shares"
  policy = data.aws_iam_policy_document.shares.json
}

resource "aws_iam_role_policy_attachment" "shares" {
  role       = aws_iam_role.compute.name
  policy_arn = aws_iam_policy.shares.arn
}
