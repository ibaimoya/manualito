locals {
  zone = {
    id   = var.cloudflare_zone_id
    name = "manualito.dev"
  }

  app_hostname = var.app_hostname
}

resource "cloudflare_dns_record" "app" {
  zone_id = local.zone.id
  name    = local.app_hostname
  content = "${cloudflare_zero_trust_tunnel_cloudflared.manualito.id}.cfargotunnel.com"
  type    = "CNAME"
  ttl     = 1
  proxied = true
}
