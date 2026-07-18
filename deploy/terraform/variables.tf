variable "cloudflare_api_token" {
  description = "Token API con permisos de edición de Tunnel y DNS."
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Identificador de la cuenta de Cloudflare."
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Identificador de la zona manualito.dev."
  type        = string
}

variable "tunnel_name" {
  description = "Nombre del túnel administrado por Terraform."
  type        = string
  default     = "manualito-app"
}
