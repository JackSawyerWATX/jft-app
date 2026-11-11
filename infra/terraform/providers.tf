provider "aws" {
  # Use AWS_REGION (or the selected AWS profile), including for S3 state.
  default_tags {
    tags = merge(var.tags, {
      Application = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    })
  }
}

data "aws_region" "current" {}
