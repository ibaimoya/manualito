# Túnel de Cloudflare

Este código declara el túnel administrado remotamente, su ingress HTTPS hacia
Caddy y el registro configurado mediante `app_hostname` (por defecto,
`app.manualito.dev`) dentro de la zona. No contiene credenciales ni se aplica
automáticamente.

## Inputs

| Nombre | Descripción | Default | Sensible |
|---|---|---|---|
| `cloudflare_api_token` | Token API con permisos de edición de Tunnel y DNS. | Obligatorio | Sí |
| `cloudflare_account_id` | Identificador de la cuenta de Cloudflare. | Obligatorio | No |
| `cloudflare_zone_id` | Identificador de la zona de Cloudflare. | Obligatorio | No |
| `app_hostname` | Hostname público de la aplicación. | `app.manualito.dev` | No |
| `tunnel_name` | Nombre del túnel administrado por Terraform. | `manualito-app` | No |

## Outputs

| Nombre | Descripción | Sensible |
|---|---|---|
| `app_hostname` | Nombre público creado en la zona. | No |
| `tunnel_token` | Token para `secrets/tunnel_token.txt`. | Sí |

## Pasos manuales

1. Crea un token API de Cloudflare con permisos para editar Cloudflare Tunnel y
   DNS en la zona, y localiza los identificadores de cuenta y zona.
2. Crea un `terraform.tfvars` local —está gitignorado— con
   `cloudflare_api_token`, `cloudflare_account_id` y `cloudflare_zone_id`.
3. Revisa y aplica la infraestructura:

   ```bash
   terraform init
   terraform fmt -check
   terraform validate
   terraform plan
   terraform apply
   ```

4. Guarda el token devuelto con permisos de usuario y arranca el perfil:

   ```bash
   umask 077
   terraform output -raw tunnel_token > ../../secrets/tunnel_token.txt
   cd ../..
   docker compose --profile tunnel up -d
   ```

No comitees `terraform.tfvars`, el estado ni `secrets/tunnel_token.txt`. El
estado contiene material sensible aunque los outputs se marquen como
`sensitive`.
