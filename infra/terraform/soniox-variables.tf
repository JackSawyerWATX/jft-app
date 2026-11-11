variable "create_soniox_secret" {
  type        = bool
  description = "Create environment-specific secret metadata only. Provision its value separately. Set false when referencing an existing secret."
}

variable "stt_soniox_secret_arn" {
  type        = string
  default     = null
  description = "Existing Soniox secret ARN; mutually exclusive with create_soniox_secret. Never supply a secret value."
  validation {
    condition = var.stt_soniox_secret_arn == null ? true : try(
      provider::aws::arn_parse(var.stt_soniox_secret_arn).service == "secretsmanager" &&
      startswith(provider::aws::arn_parse(var.stt_soniox_secret_arn).resource, "secret:"),
      false
    )
    error_message = "Use a complete Secrets Manager secret ARN."
  }
}

variable "amplify_compute_role_name" {
  type        = string
  default     = null
  description = "Existing trusted Amplify SSR role. Defaults to #27's project-environment-ssr-compute name. This PR never creates a role."
}
