provider "aws" {
  region = var.aws_region
  default_tags {
    tags = merge(var.tags, {
      Application = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    })
  }
}
