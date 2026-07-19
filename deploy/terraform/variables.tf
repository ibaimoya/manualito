variable "cloudflare_api_token" {
  description = "Token API con permisos de edición de Tunnel y DNS."
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Identificador de la cuenta de Cloudflare."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.cloudflare_account_id))
    error_message = "cloudflare_account_id debe contener exactamente 32 caracteres hexadecimales en minúsculas."
  }
}

variable "cloudflare_zone_id" {
  description = "Identificador de la zona manualito.dev."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.cloudflare_zone_id))
    error_message = "cloudflare_zone_id debe contener exactamente 32 caracteres hexadecimales en minúsculas."
  }
}

variable "app_hostname" {
  description = "Hostname público de la aplicación."
  type        = string
  default     = "app.manualito.dev"

  validation {
    condition = (
      length(var.app_hostname) <= 253 &&
      can(regex(
        "^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$",
        lower(var.app_hostname),
      ))
    )
    error_message = "app_hostname debe ser un FQDN válido sin esquema, puerto ni punto final."
  }
}

variable "tunnel_name" {
  description = "Nombre del túnel administrado por Terraform."
  type        = string
  default     = "manualito-app"

  validation {
    condition = can(regex(
      "^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$",
      var.tunnel_name,
    ))
    error_message = "tunnel_name debe tener entre 1 y 100 caracteres alfanuméricos, puntos, guiones o guiones bajos, y empezar y terminar con un carácter alfanumérico."
  }
}
