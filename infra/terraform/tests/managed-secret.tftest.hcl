# Mocked plans only: no AWS account access or secret values.
mock_provider "aws" {
  # Make the generated ARN available to plan-time permission assertions.
  override_during = plan
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:us-west-2:123456789012:secret:managed-test" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
}

variables {
  project_name         = "review"
  environment          = "dev"
  create_soniox_secret = true
}

run "managed_metadata" {
  command = plan
  assert {
    condition     = length(aws_secretsmanager_secret.soniox) == 1 && aws_secretsmanager_secret.soniox[0].name == "review-dev-soniox-api-key"
    error_message = "Expected environment-specific managed metadata."
  }
  assert {
    condition     = one(data.aws_iam_policy_document.soniox[0].statement).resources == toset([aws_secretsmanager_secret.soniox[0].arn])
    error_message = "Expected permission on the managed secret only."
  }
}

run "conflicting_sources" {
  command = plan
  variables {
    stt_soniox_secret_arn = "arn:aws:secretsmanager:us-west-2:123456789012:secret:external-test"
  }
  expect_failures = [aws_secretsmanager_secret.soniox[0]]
}

run "existing_role_override" {
  command = plan
  variables {
    amplify_compute_role_name = "existing-reviewed-role"
  }
  assert {
    condition     = aws_iam_role_policy.soniox[0].role == "existing-reviewed-role"
    error_message = "Expected explicit existing role selection."
  }
}
