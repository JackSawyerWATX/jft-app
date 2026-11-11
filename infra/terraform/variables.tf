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
