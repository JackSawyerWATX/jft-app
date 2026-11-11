variable "environment" {
  type        = string
  description = "Explicit environment. Use separate backends and credentials for production."

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be dev or prod."
  }
}

variable "project_name" {
  type        = string
  description = "Resource name prefix, explicitly supplied by the selected environment."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional resource tags."
}

variable "deletion_protection" {
  type        = bool
  default     = true
  description = "Protect the table from deletion; intentionally disable before destroying it."
}

variable "stt_openai_secret_arn" {
  type        = string
  default     = null
  nullable    = true
  description = "Optional existing Secrets Manager ARN used by STT_OPENAI_SECRET_ARN. Does not create or read a secret."

  validation {
    condition = var.stt_openai_secret_arn == null ? true : try(
      provider::aws::arn_parse(var.stt_openai_secret_arn).service == "secretsmanager" &&
      provider::aws::arn_parse(var.stt_openai_secret_arn).region != "" &&
      length(provider::aws::arn_parse(var.stt_openai_secret_arn).account_id) == 12 &&
      startswith(provider::aws::arn_parse(var.stt_openai_secret_arn).resource, "secret:") &&
      length(trimprefix(provider::aws::arn_parse(var.stt_openai_secret_arn).resource, "secret:")) > 0,
      false
    )
    error_message = "Use a complete existing Secrets Manager secret ARN."
  }
}
