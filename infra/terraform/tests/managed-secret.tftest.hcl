# Mocked plans only: no AWS account access or secret values.
mock_provider "aws" {
  # Make the generated ARN available to plan-time permission assertions.
  override_during = plan
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/review-dev-ssr-compute" }
  }
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

run "one_application_role" {
  command = plan
  assert {
    condition     = aws_iam_role_policy.soniox[0].role == aws_iam_role.compute.name && aws_iam_role_policy_attachment.shares.role == aws_iam_role.compute.name
    error_message = "Speech and persistence policies must attach to the same application role."
  }
  assert {
    condition     = output.compute_role_arn == aws_iam_role.compute.arn
    error_message = "The deployment output must select the application role."
  }
  assert {
    condition     = aws_dynamodb_table.shares.ttl[0].enabled == false
    error_message = "Link expiration must not delete private history."
  }
}
