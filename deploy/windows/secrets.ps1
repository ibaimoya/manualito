param(
    [Parameter(Mandatory = $true)]
    [string]$Directory,
    [switch]$DatabaseExists,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$names = @("postgres_user", "postgres_password", "redis_password", "flower_basic_auth", "resend_api_key", "tunnel_token")

function Assert-SecretPath([string]$Path, [bool]$IsDirectory) {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($null -eq $item) { return }
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "La ruta $Path no puede ser un enlace."
    }
    if ($item.PSIsContainer -ne $IsDirectory) {
        throw "Tipo de archivo incorrecto en $Path."
    }
    if (-not $IsDirectory -and [string]::IsNullOrWhiteSpace([IO.File]::ReadAllText($Path))) {
        throw "El secreto $($item.Name) no puede estar vacío."
    }
}

function Protect-SecretPath([string]$Path, [bool]$IsDirectory) {
    $inheritance = [Security.AccessControl.InheritanceFlags]::None
    $sections = [Security.AccessControl.AccessControlSections]::Access
    if ($IsDirectory) {
        $acl = [IO.Directory]::GetAccessControl($Path, $sections)
        $inheritance = [Security.AccessControl.InheritanceFlags]"ContainerInherit, ObjectInherit"
    } else {
        $acl = [IO.File]::GetAccessControl($Path, $sections)
    }
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in $acl.Access) { $acl.RemoveAccessRuleSpecific($rule) }
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
    foreach ($sid in @($owner.Value, "S-1-5-18", "S-1-5-32-544")) {
        $identity = New-Object Security.Principal.SecurityIdentifier $sid
        $rule = New-Object Security.AccessControl.FileSystemAccessRule(
            $identity, "FullControl", $inheritance, "None", "Allow"
        )
        $acl.AddAccessRule($rule)
    }
    if ($IsDirectory) {
        [IO.Directory]::SetAccessControl($Path, $acl)
    } else {
        [IO.File]::SetAccessControl($Path, $acl)
    }
}

function New-SecretValue([string]$Name) {
    if ($Name -eq "postgres_user") { return "manualito" }
    $bytes = New-Object byte[] 32
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    $value = [BitConverter]::ToString($bytes).Replace("-", "").ToLowerInvariant()
    if ($Name -eq "flower_basic_auth") { return "admin:$value" }
    return $value
}

Assert-SecretPath $Directory $true
foreach ($name in $names) {
    Assert-SecretPath (Join-Path $Directory "$name.txt") $false
}
if ($DatabaseExists -and (
    -not (Test-Path -LiteralPath (Join-Path $Directory "postgres_user.txt")) -or
    -not (Test-Path -LiteralPath (Join-Path $Directory "postgres_password.txt"))
)) {
    throw "Ya existe el volumen de Postgres. Restaura sus archivos de usuario y contraseña antes de continuar."
}
if ($DryRun) {
    Write-Host "Se crearían los secretos que falten sin sustituir los existentes."
    return
}

[void][IO.Directory]::CreateDirectory($Directory)
Protect-SecretPath $Directory $true
foreach ($name in $names[0..3]) {
    $path = Join-Path $Directory "$name.txt"
    if (Test-Path -LiteralPath $path) { continue }
    $bytes = [Text.Encoding]::ASCII.GetBytes((New-SecretValue $name) + "`n")
    $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
}
foreach ($name in $names) {
    $path = Join-Path $Directory "$name.txt"
    if (Test-Path -LiteralPath $path) { Protect-SecretPath $path $false }
}
