# Túnel de Cloudflare

[![Terraform](https://img.shields.io/badge/Terraform-844FBA?logo=terraform&logoColor=white)](https://developer.hashicorp.com/terraform)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?logo=cloudflare&logoColor=white)](https://www.cloudflare.com/)

Este código declara el túnel administrado remotamente, su ingress HTTPS hacia
Caddy y el registro configurado mediante `app_hostname` (por defecto,
`app.manualito.dev`) dentro de la zona. No contiene credenciales ni se aplica
automáticamente.

## Documentación pública

La documentación de Starlight se publica en <https://docs.manualito.dev>
mediante el Worker de assets estáticos `manualito-docs`. El fichero
`docs/site/wrangler.jsonc` asocia el Worker con ese Custom Domain. Al desplegar,
Cloudflare crea su registro DNS y su certificado. Por eso el dominio no forma
parte de este estado de Terraform.

Cloudflare Workers Builds está conectado al repositorio de GitHub y construye y
publica el site cuando cambia `docs/site/*` en la rama de producción. La
configuración del build es:

| Ajuste | Valor |
|---|---|
| Rama de build y despliegue | `master` |
| Directorio raíz | `docs/site` |
| Comando de build | `pnpm install --frozen-lockfile && pnpm verify` |
| Comando de despliegue | `npx wrangler deploy` |

El workflow `.github/workflows/docs.yml` verifica y construye el site.

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
