locals {
  lowercase_letters = "abcdefghijklmnopqrstuvwxyz"
  digits            = "0123456789"
}

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
    condition = (
      length(var.project_name) >= 2 &&
      length(var.project_name) <= 30 &&
      strcontains(local.lowercase_letters, substr(var.project_name, 0, 1)) &&
      alltrue([
        for character in split("", var.project_name) :
        strcontains("${local.lowercase_letters}${local.digits}-", character)
      ])
    )
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

// this keeps the same validation without regex

validation {
    condition = var.stt_openai_secret_arn == null ? true : alltrue([
      for parts in [split(":", var.stt_openai_secret_arn)] : try(
        parts[0] == "arn" &&
        parts[1] != "" &&
        parts[2] == "secretsmanager" &&
        parts[3] != "" &&
        length(parts[4]) == 12 &&
        alltrue([
          for character in split("", parts[4]) :
          strcontains(local.digits, character)
        ]) &&
        parts[5] == "secret" &&
        join(":", slice(parts, 6, length(parts))) != "",
        false
      )
    ])
    error_message = "Use a complete existing Secrets Manager secret ARN."
  }
}
