variable "aws_region" {
  type        = string
  description = "Region of the shares table and existing Amplify deployment."
}

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
  default     = "doorknob"
  description = "Resource name prefix."
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,29}$", var.project_name))
    error_message = "Use 2-30 lowercase letters, digits or hyphens, starting with a letter."
  }
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
    condition     = var.stt_openai_secret_arn == null ? true : can(regex("^arn:[^:]+:secretsmanager:[^:]+:[0-9]{12}:secret:.+$", var.stt_openai_secret_arn))
    error_message = "Use a complete existing Secrets Manager secret ARN."
  }
}
