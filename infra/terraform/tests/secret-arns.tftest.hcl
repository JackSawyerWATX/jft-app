# Mocked provider: these plans never contact an AWS account.
mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  project_name         = "review-test"
  environment          = "dev"
  create_soniox_secret = false
}

run "optional_secrets_absent" {
  command = plan
}

run "valid_secret_arn" {
  command = plan
  variables {
    stt_soniox_secret_arn = "arn:aws:secretsmanager:us-west-2:123456789012:secret:soniox-test"
  }
  assert {
    condition     = aws_iam_role_policy.soniox[0].role == "review-test-dev-ssr-compute"
    error_message = "Grant access on the existing environment role only."
  }
  assert {
    condition     = one(data.aws_iam_policy_document.soniox[0].statement).resources == toset([var.stt_soniox_secret_arn])
    error_message = "Scope access to the exact configured Soniox secret."
  }
  assert {
    condition     = one(data.aws_iam_policy_document.soniox[0].statement).actions == toset(["secretsmanager:GetSecretValue"])
    error_message = "Grant only the secret read action."
  }
}

run "malformed_soniox_arn" {
  command = plan
  variables {
    stt_soniox_secret_arn = "invalid"
  }
  expect_failures = [var.stt_soniox_secret_arn]
}

run "wrong_secret_service" {
  command = plan
  variables {
    stt_soniox_secret_arn = "arn:aws:s3:us-west-2:123456789012:bucket:wrong-service"
  }
  expect_failures = [var.stt_soniox_secret_arn]
}
