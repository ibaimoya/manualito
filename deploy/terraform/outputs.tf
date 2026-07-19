output "app_hostname" {
  description = "Nombre público creado en la zona."
  value       = var.app_hostname
}

output "tunnel_token" {
  description = "Token para secrets/tunnel_token.txt."
  value       = data.cloudflare_zero_trust_tunnel_cloudflared_token.manualito.token
  sensitive   = true
}
