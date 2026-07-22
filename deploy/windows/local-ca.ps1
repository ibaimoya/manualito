param(
    [Parameter(Position = 0)]
    [string]$Action
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

try {
    $script:Utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [Console]::InputEncoding = $script:Utf8NoBom
    [Console]::OutputEncoding = $script:Utf8NoBom
    $OutputEncoding = $script:Utf8NoBom
    $PSDefaultParameterValues["*:Encoding"] = "utf8"
} catch {
    # Ajuste oportunista para hosts Windows antiguos.
}

$script:Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$script:ComposeFile = Join-Path $script:Root "compose.yaml"
$script:RootCertificatePath = "/data/caddy/pki/authorities/local/root.crt"
$script:StateFileName = "local-ca-fingerprints.txt"
$script:HealthTimeoutSeconds = 120

function Write-Info([string]$Text) {
    Write-Host -NoNewline "[*] " -ForegroundColor Yellow
    Write-Host $Text -ForegroundColor Cyan
}

function Write-Note([string]$Text) {
    Write-Host -NoNewline "[!] " -ForegroundColor Yellow
    Write-Host $Text -ForegroundColor Yellow
}

function Write-Fail([string]$Text) {
    Write-Host -NoNewline "[!] ERROR: " -ForegroundColor Red
    Write-Host $Text -ForegroundColor Red
}

function Write-Field([string]$Name, [string]$Value) {
    Write-Host ("    {0,-22} {1}" -f $Name, $Value) -ForegroundColor Gray
}

function Stop-Manualito([string]$Message) {
    Write-Fail $Message
    exit 1
}

function Test-Truthy([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $false
    }
    return @("1", "true", "yes", "si", "sí") -contains $Value.Trim().ToLowerInvariant()
}

function Test-SkipStore {
    return Test-Truthy ([string]$env:MANUALITO_LOCAL_CA_SKIP_STORE)
}

function Get-StateFile {
    $base = [string]$env:LOCALAPPDATA
    if ([string]::IsNullOrWhiteSpace($base)) {
        $base = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
    }
    if ([string]::IsNullOrWhiteSpace($base)) {
        Stop-Manualito "No se pudo resolver LocalApplicationData para guardar el estado."
    }
    return Join-Path (Join-Path $base "Manualito") $script:StateFileName
}

function Read-RegisteredFingerprints {
    $stateFile = Get-StateFile
    if (-not (Test-Path -LiteralPath $stateFile)) {
        return @()
    }
    $fingerprints = New-Object "System.Collections.Generic.List[string]"
    foreach ($line in Get-Content -LiteralPath $stateFile) {
        $fingerprint = ([string]$line).Trim().ToUpperInvariant()
        if ([string]::IsNullOrWhiteSpace($fingerprint)) {
            continue
        }
        if ($fingerprint -notmatch "^[0-9A-F]{64}$") {
            Stop-Manualito "El estado de la CA contiene una huella SHA-256 inválida: $stateFile"
        }
        if (-not $fingerprints.Contains($fingerprint)) {
            $fingerprints.Add($fingerprint)
        }
    }
    return @($fingerprints.ToArray())
}

function Write-RegisteredFingerprints([string[]]$Fingerprints) {
    $stateFile = Get-StateFile
    $stateDir = Split-Path -Parent $stateFile
    if (-not (Test-Path -LiteralPath $stateDir)) {
        New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
    }
    $temporary = Join-Path $stateDir ("local-ca-{0}.tmp" -f [guid]::NewGuid().ToString("N"))
    try {
        @($Fingerprints) | Set-Content -LiteralPath $temporary -Encoding ASCII
        Move-Item -LiteralPath $temporary -Destination $stateFile -Force
    } finally {
        Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
}

function Remove-StateFile {
    $stateFile = Get-StateFile
    Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
}

function Invoke-NativeCapture([string]$FilePath, [string[]]$Arguments) {
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = & $FilePath @Arguments 2>&1
        $exitCode = $LASTEXITCODE
        if ($null -eq $exitCode) {
            $exitCode = 0
        }
        return [pscustomobject]@{
            ExitCode = [int]$exitCode
            Output = @($output | ForEach-Object { [string]$_ })
        }
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

function Invoke-NativeChecked([string]$FilePath, [string[]]$Arguments, [switch]$Visible) {
    $result = Invoke-NativeCapture $FilePath $Arguments
    if ($Visible) {
        foreach ($line in $result.Output) {
            if (-not [string]::IsNullOrWhiteSpace($line)) {
                Write-Host "    $line" -ForegroundColor Gray
            }
        }
    }
    if ($result.ExitCode -ne 0) {
        Stop-Manualito "El comando falló con código $($result.ExitCode): $FilePath $($Arguments -join ' ')"
    }
    return $result
}

function Get-DockerPath {
    $docker = Get-Command "docker" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $docker) {
        Stop-Manualito "Docker no está instalado o no está en PATH."
    }
    return $docker.Source
}

function Get-ComposeArguments([string[]]$Tail) {
    return @("compose", "--ansi", "never", "-f", $script:ComposeFile) + $Tail
}

function Get-FrontendHealth([string]$DockerPath) {
    $containerResult = Invoke-NativeCapture $DockerPath (Get-ComposeArguments @("ps", "-q", "frontend"))
    if ($containerResult.ExitCode -ne 0) {
        return $null
    }
    $containerId = @($containerResult.Output | Where-Object {
        -not [string]::IsNullOrWhiteSpace([string]$_)
    } | Select-Object -First 1)
    if ($containerId.Count -eq 0) {
        return $null
    }
    $healthResult = Invoke-NativeCapture $DockerPath @(
        "inspect",
        "--format",
        "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
        ([string]$containerId[0]).Trim()
    )
    if ($healthResult.ExitCode -ne 0) {
        return $null
    }
    return (@($healthResult.Output | Select-Object -First 1) -join "").Trim()
}

function Wait-FrontendHealthy([string]$DockerPath) {
    $health = Get-FrontendHealth $DockerPath
    if ($health -eq "healthy") {
        Write-Info "Caddy ya está sano."
        return
    }

    Write-Info "Arrancando Caddy para leer la CA local."
    [void](Invoke-NativeChecked $DockerPath (Get-ComposeArguments @("up", "-d", "caddy-data-init")))
    [void](Invoke-NativeChecked $DockerPath (Get-ComposeArguments @(
        "up", "-d", "--no-deps", "frontend"
    )))

    $deadline = (Get-Date).AddSeconds($script:HealthTimeoutSeconds)
    do {
        $health = Get-FrontendHealth $DockerPath
        if ($health -eq "healthy") {
            Write-Info "Caddy está sano."
            return
        }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    Stop-Manualito "Caddy no alcanzó el estado healthy en $($script:HealthTimeoutSeconds) segundos."
}

function Export-RootCertificate([string]$DockerPath, [string]$Destination) {
    Write-Info "Extrayendo root.crt desde el volumen de Caddy."
    [void](Invoke-NativeChecked $DockerPath (Get-ComposeArguments @(
        "cp",
        "frontend:$($script:RootCertificatePath)",
        $Destination
    )))
}

function Get-CertificateFingerprint(
    [System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate
) {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        return -join ($sha256.ComputeHash($Certificate.RawData) | ForEach-Object {
            $_.ToString("X2")
        })
    } finally {
        $sha256.Dispose()
    }
}

function Format-Fingerprint([string]$Fingerprint) {
    return [regex]::Replace($Fingerprint, "(..)(?!$)", '$1:')
}

function Read-ValidatedCertificate([string]$Path) {
    $pem = Get-Content -LiteralPath $Path -Raw
    if ([regex]::Matches($pem, "-----BEGIN CERTIFICATE-----").Count -ne 1) {
        Stop-Manualito "root.crt debe contener exactamente un certificado."
    }
    try {
        $certificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $Path
    } catch {
        Stop-Manualito "root.crt no contiene un certificado X.509 válido."
    }
    if ($certificate.Subject -ne $certificate.Issuer) {
        $certificate.Reset()
        Stop-Manualito "root.crt no es autofirmado: sujeto y emisor no coinciden."
    }
    $basicExtension = @($certificate.Extensions | Where-Object {
        $_.Oid.Value -eq "2.5.29.19"
    } | Select-Object -First 1)
    if ($basicExtension.Count -eq 0) {
        $certificate.Reset()
        Stop-Manualito "root.crt no declara las restricciones básicas de una CA."
    }
    $basicConstraints = New-Object `
        System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension
    $basicConstraints.CopyFrom($basicExtension[0])
    if (-not $basicConstraints.CertificateAuthority) {
        $certificate.Reset()
        Stop-Manualito "root.crt no está marcado como CA."
    }
    $chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
    try {
        $chain.ChainPolicy.RevocationMode = `
            [System.Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
        $chain.ChainPolicy.VerificationFlags = `
            [System.Security.Cryptography.X509Certificates.X509VerificationFlags]::AllowUnknownCertificateAuthority
        $valid = $chain.Build($certificate)
        if (-not $valid -or $chain.ChainElements.Count -ne 1) {
            $certificate.Reset()
            Stop-Manualito "root.crt no supera la validación de una CA autofirmada."
        }
    } finally {
        $chain.Reset()
    }
    return $certificate
}

function Get-UserRootCertificates {
    $store = New-Object `
        System.Security.Cryptography.X509Certificates.X509Store `
        -ArgumentList @(
            "Root",
            [System.Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser
        )
    $certificates = New-Object `
        "System.Collections.Generic.List[System.Security.Cryptography.X509Certificates.X509Certificate2]"
    try {
        $store.Open(
            [System.Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly -bor
            [System.Security.Cryptography.X509Certificates.OpenFlags]::OpenExistingOnly
        )
        foreach ($certificate in $store.Certificates) {
            $certificates.Add(
                (New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $certificate)
            )
        }
    } finally {
        $store.Close()
    }
    return @($certificates.ToArray())
}

function Test-CertificateInstalled([string]$Fingerprint, [string[]]$Registered) {
    if (Test-SkipStore) {
        return $Registered -contains $Fingerprint
    }
    $certificates = @(Get-UserRootCertificates)
    try {
        foreach ($certificate in $certificates) {
            if ((Get-CertificateFingerprint $certificate) -eq $Fingerprint) {
                return $true
            }
        }
        return $false
    } finally {
        foreach ($certificate in $certificates) {
            $certificate.Reset()
        }
    }
}

function Get-CertutilPath {
    $certutil = Get-Command "certutil.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $certutil) {
        Stop-Manualito "certutil.exe no está disponible en este Windows."
    }
    return $certutil.Source
}

function Install-Certificate([string]$CertificatePath) {
    if (Test-SkipStore) {
        Write-Info "Instalación omitida por MANUALITO_LOCAL_CA_SKIP_STORE."
        return
    }
    Write-Info "Instalando la CA en CurrentUser\Root."
    [void](Invoke-NativeChecked (Get-CertutilPath) @(
        "-user", "-addstore", "Root", $CertificatePath
    ) -Visible)
}

function Remove-Certificate([string]$Fingerprint) {
    if (Test-SkipStore) {
        Write-Info "Retirada omitida para la huella registrada $(Format-Fingerprint $Fingerprint)."
        return
    }
    $certificates = @(Get-UserRootCertificates)
    $matches = New-Object `
        "System.Collections.Generic.List[System.Security.Cryptography.X509Certificates.X509Certificate2]"
    try {
        foreach ($certificate in $certificates) {
            if ((Get-CertificateFingerprint $certificate) -eq $Fingerprint) {
                $matches.Add($certificate)
            }
        }
        if ($matches.Count -eq 0) {
            Write-Info "La huella registrada ya no está instalada: $(Format-Fingerprint $Fingerprint)."
            return
        }
        foreach ($certificate in $matches) {
            Write-Info "Retirando la huella registrada $(Format-Fingerprint $Fingerprint)."
            [void](Invoke-NativeChecked (Get-CertutilPath) @(
                "-user", "-delstore", "Root", $certificate.Thumbprint
            ) -Visible)
        }
    } finally {
        foreach ($certificate in $certificates) {
            $certificate.Reset()
        }
    }
}

function Invoke-Trust([string]$DockerPath) {
    $temporary = New-TemporaryFile
    $certificate = $null
    try {
        Wait-FrontendHealthy $DockerPath
        Export-RootCertificate $DockerPath $temporary.FullName
        $certificate = Read-ValidatedCertificate $temporary.FullName
        $fingerprint = Get-CertificateFingerprint $certificate
        Write-Info "CA local validada."
        Write-Field "huella SHA-256" (Format-Fingerprint $fingerprint)

        $registered = @(Read-RegisteredFingerprints)
        if ($registered.Count -eq 0) {
            Write-Note "No hay huellas previas registradas; no se retirará ningún certificado existente."
        }
        $manageCurrent = $registered -contains $fingerprint
        $installedBefore = Test-CertificateInstalled $fingerprint $registered
        foreach ($oldFingerprint in @($registered | Where-Object { $_ -ne $fingerprint })) {
            Write-Info "Rotación detectada."
            Remove-Certificate $oldFingerprint
        }

        if ($installedBefore) {
            Write-Info "La CA actual ya está instalada."
            if (-not $manageCurrent) {
                Write-Note "No fue registrada por Manualito; no se asumirá su propiedad."
            }
        } else {
            Install-Certificate $temporary.FullName
            $manageCurrent = $true
        }
        if (-not (Test-SkipStore) -and -not (Test-CertificateInstalled $fingerprint @())) {
            Stop-Manualito "certutil terminó sin dejar instalada la huella esperada."
        }
        if ($manageCurrent) {
            Write-RegisteredFingerprints @($fingerprint)
            Write-Info "Confianza local registrada."
            Write-Field "estado" (Get-StateFile)
        } else {
            Remove-StateFile
            Write-Note "No se ha creado estado local para una CA instalada externamente."
        }
    } finally {
        if ($null -ne $certificate) {
            $certificate.Reset()
        }
        Remove-Item -LiteralPath $temporary.FullName -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-Status([string]$DockerPath) {
    $temporary = New-TemporaryFile
    $certificate = $null
    try {
        Wait-FrontendHealthy $DockerPath
        Export-RootCertificate $DockerPath $temporary.FullName
        $certificate = Read-ValidatedCertificate $temporary.FullName
        $fingerprint = Get-CertificateFingerprint $certificate
        Write-Info "Estado de la CA local."
        Write-Field "huella actual" $fingerprint
        Write-Field "estado local" (Get-StateFile)

        $registered = @(Read-RegisteredFingerprints)
        if ($registered.Count -eq 0) {
            Write-Field "registradas" "ninguna"
            return
        }
        foreach ($registeredFingerprint in $registered) {
            $installed = Test-CertificateInstalled $registeredFingerprint $registered
            Write-Field "huella registrada" $registeredFingerprint
            Write-Field "instalada" $(if ($installed) { "sí" } else { "no" })
        }
    } finally {
        if ($null -ne $certificate) {
            $certificate.Reset()
        }
        Remove-Item -LiteralPath $temporary.FullName -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-Untrust {
    $registered = @(Read-RegisteredFingerprints)
    if ($registered.Count -eq 0) {
        Write-Info "No hay huellas de Manualito registradas."
        Remove-StateFile
        return
    }
    foreach ($fingerprint in $registered) {
        Remove-Certificate $fingerprint
    }
    Remove-StateFile
    Write-Info "Huellas registradas por Manualito retiradas."
}

Push-Location $script:Root
try {
    $normalizedAction = ([string]$Action).Trim().ToLowerInvariant()
    if (@("trust", "status", "untrust") -notcontains $normalizedAction) {
        Stop-Manualito "Uso: local-ca trust|status|untrust"
    }
    Write-Info "Manualito local-ca $normalizedAction."
    switch ($normalizedAction) {
        "trust" { Invoke-Trust (Get-DockerPath) }
        "status" { Invoke-Status (Get-DockerPath) }
        "untrust" { Invoke-Untrust }
    }
} catch {
    Write-Fail $_.Exception.Message
    exit 1
} finally {
    Pop-Location
}
