param(
    [ValidateSet("setup", "start", "stop")]
    [string]$Action = "start",

    [ValidateSet("auto", "cpu", "nvidia")]
    [string]$Accelerator = "auto",

    [ValidateSet("auto", "low", "high")]
    [string]$Llm = "auto",

    [switch]$UseRecommended,
    [switch]$DryRun,
    [switch]$SkipBuild
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
$script:LocalDir = Join-Path $script:Root "deploy\local"
$script:SelectedEnv = Join-Path $script:LocalDir "selected.env"
$script:ComposeFile = Join-Path $script:Root "compose.yaml"
$script:RootEnv = Join-Path $script:Root ".env"
$script:LlmEnv = Join-Path $script:Root "config\llm.env"
$script:NvidiaCompose = Join-Path $script:Root "deploy\compose\accelerators\nvidia.yaml"
$script:LowProfile = Join-Path $script:Root "deploy\profiles\llm\low.env"
$script:HighProfile = Join-Path $script:Root "deploy\profiles\llm\high.env"
$script:DockerLog = Join-Path $script:LocalDir "last-docker.log"
$script:DockerOutLog = Join-Path $script:LocalDir "last-docker.out.log"
$script:DockerErrLog = Join-Path $script:LocalDir "last-docker.err.log"
$script:DockerExitLog = Join-Path $script:LocalDir "last-docker.exit.log"
$script:HighVramMb = 9216
$script:LowVramMb = 3072
$script:ManualSelectionRequested = ($Accelerator -ne "auto" -or $Llm -ne "auto")

function Write-Rule {
    Write-Host ("=" * 72) -ForegroundColor DarkGray
}

function Write-Title([string]$Text) {
    Write-Host ""
    Write-Rule
    $padding = [Math]::Max(0, [int][Math]::Floor((72 - $Text.Length) / 2))
    Write-Host ((" " * $padding) + $Text) -ForegroundColor Cyan
    Write-Rule
}

function Write-Step([string]$Text) {
    if (-not $Text.EndsWith(":")) {
        $Text = $Text + ":"
    }
    Write-Host -NoNewline "[*] " -ForegroundColor Yellow
    Write-Host $Text -ForegroundColor Cyan
}

function Write-Ok([string]$Text) {
    Write-Host -NoNewline "[*] " -ForegroundColor Yellow
    Write-Host $Text -ForegroundColor Green
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

function Exit-Manualito([string]$Message) {
    Write-Ok $Message
    exit 0
}

function Assert-File([string]$Path, [string]$Name) {
    if (-not (Test-Path -LiteralPath $Path)) {
        Stop-Manualito "No encuentro $Name en $Path"
    }
}

function ConvertTo-DisplayCommand([string[]]$Parts) {
    return ($Parts | ForEach-Object {
        if ($_ -match "\s") { '"' + $_ + '"' } else { $_ }
    }) -join " "
}

function Format-Elapsed([TimeSpan]$Elapsed) {
    if ($Elapsed.TotalHours -ge 1) {
        return "{0:00}:{1:00}:{2:00}" -f [int]$Elapsed.TotalHours, $Elapsed.Minutes, $Elapsed.Seconds
    }
    return "{0:00}:{1:00}" -f $Elapsed.Minutes, $Elapsed.Seconds
}

function Test-LiveConsole {
    try {
        return (-not [Console]::IsOutputRedirected -and [Console]::BufferWidth -gt 0 -and [Console]::BufferHeight -gt 0)
    } catch {
        return $false
    }
}

function Format-LiveLine([string]$Text) {
    $width = 80
    try {
        $width = [Math]::Max(20, [Console]::BufferWidth - 1)
    } catch {
        $width = 80
    }
    $escape = [char]27
    $clean = ([string]$Text) -replace "$escape\[[0-9;?]*[ -/]*[@-~]", ""
    $clean = $clean -replace "[`r`n`t]", " "
    if ($clean.Length -gt $width) {
        $clean = $clean.Substring(0, [Math]::Max(0, $width - 3)) + "..."
    }
    return $clean.PadRight($width)
}

function Get-RecentDockerLines([string[]]$Paths, [int]$Count) {
    $lines = @()
    foreach ($path in $Paths) {
        if (Test-Path -LiteralPath $path) {
            $lines += Get-Content -LiteralPath $path -Tail $Count -ErrorAction SilentlyContinue
        }
    }
    $lines = @($lines | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
    if ($lines.Count -gt $Count) {
        return @($lines | Select-Object -Last $Count)
    }
    return @($lines)
}

function Write-LiveDockerBlock([int]$Top, [string]$State, [TimeSpan]$Elapsed, [string[]]$Lines) {
    $safeLines = @()
    if ($null -ne $Lines) {
        $safeLines = @($Lines | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
    }
    try {
        $lineCount = 6
        [Console]::SetCursorPosition(0, $Top)
        Write-Host (Format-LiveLine ("    {0,-22} {1}" -f "estado", $State)) -ForegroundColor Gray
        Write-Host (Format-LiveLine ("    {0,-22} {1}" -f "transcurrido", (Format-Elapsed $Elapsed))) -ForegroundColor Gray
        Write-Host (Format-LiveLine "") -ForegroundColor Gray
        Write-Host (Format-LiveLine "    Ejecucion de Docker:") -ForegroundColor Gray
        for ($i = 0; $i -lt $lineCount; $i++) {
            $line = ""
            if ($i -lt $safeLines.Count) {
                $line = [string]$safeLines[$i]
            }
            Write-Host (Format-LiveLine ("    > " + $line)) -ForegroundColor DarkGray
        }
        [Console]::SetCursorPosition(0, $Top + 4 + $lineCount)
    } catch {
        return
    }
}

function Write-DockerTail([string[]]$Lines) {
    $safeLines = @()
    if ($null -ne $Lines) {
        $safeLines = @($Lines | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
    }
    if ($safeLines.Count -eq 0) {
        return
    }
    Write-Host "    Ejecucion de Docker:" -ForegroundColor Gray
    foreach ($line in $safeLines) {
        Write-Host ("    > " + [string]$line) -ForegroundColor DarkGray
    }
}

function Set-CursorVisibleSafe([bool]$Visible) {
    try {
        [Console]::CursorVisible = $Visible
    } catch {
        return
    }
}

function Read-SetupOption {
    Write-Host -NoNewline "[*] " -ForegroundColor Yellow
    Write-Host -NoNewline "Selecciona una opcion: " -ForegroundColor Cyan
    $answer = [Console]::ReadLine()
    if ($null -eq $answer) {
        return ""
    }
    return [string]$answer
}

function Read-YesNo([string]$Question) {
    while ($true) {
        Write-Host -NoNewline "[*] " -ForegroundColor Yellow
        Write-Host -NoNewline "$Question (s/n): " -ForegroundColor Green
        $answer = [Console]::ReadLine()
        if ($null -eq $answer) {
            return $false
        }
        $normalized = ([string]$answer).Trim().ToLowerInvariant()
        if ($normalized -eq "s" -or $normalized -eq "si" -or $normalized -eq "y" -or $normalized -eq "yes") {
            return $true
        }
        if ($normalized -eq "n" -or $normalized -eq "no") {
            return $false
        }
        Write-Note "Responde s o n."
    }
}

function Invoke-External([string]$Label, [string]$FilePath, [string[]]$Arguments) {
    Write-Step $Label
    $displayCommand = ConvertTo-DisplayCommand (@($FilePath) + $Arguments)
    if ($DryRun) {
        Write-Field "accion" $Label
        Write-Field "modo" "dry-run"
        return
    }
    if (-not (Test-Path -LiteralPath $script:LocalDir)) {
        New-Item -ItemType Directory -Path $script:LocalDir -Force | Out-Null
    }
    Write-Field "accion" $Label
    Write-Field "log" "deploy\local\last-docker.log"
    $stopwatch = [Diagnostics.Stopwatch]::StartNew()
    $liveConsole = Test-LiveConsole
    $liveTop = 0
    $previousCursorVisible = $null
    if ($liveConsole) {
        try {
            $previousCursorVisible = [Console]::CursorVisible
            Set-CursorVisibleSafe $false
        } catch {
            $previousCursorVisible = $null
        }
        $liveTop = [Console]::CursorTop
        Write-LiveDockerBlock $liveTop "en curso" $stopwatch.Elapsed @()
    } else {
        Write-Field "estado" "en curso"
        Write-Field "transcurrido" (Format-Elapsed $stopwatch.Elapsed)
    }
    Remove-Item -LiteralPath $script:DockerOutLog, $script:DockerErrLog, $script:DockerExitLog -Force -ErrorAction SilentlyContinue
    $job = Start-Job -ScriptBlock {
        param([string]$InnerFilePath, [string[]]$InnerArguments, [string]$OutLog, [string]$ErrLog, [string]$ExitLog)
        & $InnerFilePath @InnerArguments 1> $OutLog 2> $ErrLog
        $code = $LASTEXITCODE
        if ($null -eq $code) {
            $code = 0
        }
        Set-Content -LiteralPath $ExitLog -Value ([string]$code) -Encoding ASCII
    } -ArgumentList $FilePath, $Arguments, $script:DockerOutLog, $script:DockerErrLog, $script:DockerExitLog
    while ($job.State -eq "Running") {
        Start-Sleep -Milliseconds 500
        if ($liveConsole) {
            $recent = @(Get-RecentDockerLines @($script:DockerOutLog, $script:DockerErrLog) 6)
            Write-LiveDockerBlock $liveTop "en curso" $stopwatch.Elapsed $recent
        }
    }
    Wait-Job -Job $job | Out-Null
    Receive-Job -Job $job -ErrorAction SilentlyContinue | Out-Null
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    $stopwatch.Stop()
    $exitCode = 1
    if (Test-Path -LiteralPath $script:DockerExitLog) {
        $rawExitCode = Get-Content -LiteralPath $script:DockerExitLog -TotalCount 1 -ErrorAction SilentlyContinue
        if (-not [int]::TryParse([string]$rawExitCode, [ref]$exitCode)) {
            $exitCode = 1
        }
    }
    $merged = @()
    if (Test-Path -LiteralPath $script:DockerOutLog) {
        $merged += Get-Content -LiteralPath $script:DockerOutLog
    }
    if (Test-Path -LiteralPath $script:DockerErrLog) {
        $merged += Get-Content -LiteralPath $script:DockerErrLog
    }
    $merged = @("# $displayCommand", "") + $merged
    $merged | Set-Content -LiteralPath $script:DockerLog -Encoding ASCII
    Remove-Item -LiteralPath $script:DockerOutLog, $script:DockerErrLog, $script:DockerExitLog -Force -ErrorAction SilentlyContinue
    if ($null -ne $previousCursorVisible) {
        Set-CursorVisibleSafe $previousCursorVisible
    }
    if ($exitCode -ne 0) {
        if ($liveConsole) {
            Write-LiveDockerBlock $liveTop "error" $stopwatch.Elapsed @(Get-RecentDockerLines @($script:DockerLog) 6)
        } else {
            Write-Field "estado" "error"
            Write-Field "transcurrido" (Format-Elapsed $stopwatch.Elapsed)
        }
        Write-Fail "$Label fallo con codigo $exitCode"
        if ((-not $liveConsole) -and (Test-Path -LiteralPath $script:DockerLog)) {
            Write-DockerTail @(Get-Content -LiteralPath $script:DockerLog -Tail 24)
        }
        if ((Test-LiveConsole) -and (Test-Path -LiteralPath $script:DockerLog) -and (Read-YesNo "Quieres abrir el log completo")) {
            Start-Process -FilePath "notepad.exe" -ArgumentList ('"' + $script:DockerLog + '"') -ErrorAction SilentlyContinue
        }
        exit 1
    }
    if ($liveConsole) {
        Write-LiveDockerBlock $liveTop "listo" $stopwatch.Elapsed @(Get-RecentDockerLines @($script:DockerLog) 6)
    } else {
        Write-Field "estado" "listo"
        Write-Field "transcurrido" (Format-Elapsed $stopwatch.Elapsed)
        Write-DockerTail @(Get-RecentDockerLines @($script:DockerLog) 6)
    }
}

function Read-EnvFile([string]$Path) {
    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $values
    }
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if ($trimmed -eq "" -or $trimmed.StartsWith("#")) {
            continue
        }
        $parts = $trimmed.Split("=", 2)
        if ($parts.Count -eq 2) {
            $values[$parts[0].Trim()] = $parts[1].Trim()
        }
    }
    return $values
}

function Get-RequiredValue([hashtable]$Values, [string]$Key) {
    if (-not $Values.ContainsKey($Key) -or [string]::IsNullOrWhiteSpace([string]$Values[$Key])) {
        Stop-Manualito "Falta $Key en deploy\local\selected.env. Ejecuta setup.bat otra vez."
    }
    return [string]$Values[$Key]
}

function Assert-Accelerator([string]$Value) {
    if ($Value -ne "cpu" -and $Value -ne "nvidia") {
        Stop-Manualito "Acelerador invalido '$Value'. Ejecuta setup.bat otra vez."
    }
}

function Test-Tool([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Test-Docker {
    Write-Step "Comprobando Docker"
    $docker = Get-Command "docker" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $docker) {
        Stop-Manualito "Docker no esta instalado o no esta en PATH."
    }
    Write-Field "docker" $docker.Source
    if (-not $DryRun) {
        $osType = (& $docker.Source info --format "{{.OSType}}" 2>$null)
        if ($LASTEXITCODE -ne 0) {
            Stop-Manualito "Docker no responde. Abre Docker Desktop y vuelve a intentarlo."
        }
        if ($osType -and $osType.Trim() -ne "linux") {
            Stop-Manualito "Docker esta en modo '$($osType.Trim())'. Manualito necesita contenedores Linux."
        }
        Write-Field "engine" "linux"
    }
    $compose = (& $docker.Source compose version --short 2>$null)
    if (-not $DryRun -and $LASTEXITCODE -ne 0) {
        Stop-Manualito "Docker Compose no responde."
    }
    if ($compose) {
        Write-Field "compose" $compose.Trim()
    }
    return $docker.Source
}

function Get-NvidiaInfo {
    Write-Step "Buscando NVIDIA"
    $nvidia = Get-Command "nvidia-smi" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $nvidia) {
        Write-Field "estado" "no detectada"
        return $null
    }
    if ($DryRun) {
        Write-Field "nvidia-smi" $nvidia.Source
        Write-Field "estado" "detectada (sin medir en dry-run)"
        return [pscustomobject]@{ Name = "NVIDIA"; FreeMb = 0; TotalMb = 0 }
    }
    $raw = & $nvidia.Source --query-gpu=name,memory.free,memory.total --format=csv,noheader,nounits 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $raw) {
        Write-Field "estado" "nvidia-smi no responde"
        return $null
    }
    $best = $null
    foreach ($line in @($raw)) {
        $parts = $line -split ",\s*"
        if ($parts.Count -lt 3) {
            continue
        }
        $free = 0
        $total = 0
        if (-not [int]::TryParse($parts[1], [ref]$free)) { continue }
        if (-not [int]::TryParse($parts[2], [ref]$total)) { continue }
        $gpu = [pscustomobject]@{ Name = $parts[0]; FreeMb = $free; TotalMb = $total }
        if ($null -eq $best -or $gpu.FreeMb -gt $best.FreeMb) {
            $best = $gpu
        }
    }
    if ($null -eq $best) {
        Write-Field "estado" "sin datos de memoria"
        return $null
    }
    Write-Field "gpu" $best.Name
    Write-Field "vram libre" ("{0:N1} GB / {1:N1} GB" -f ($best.FreeMb / 1024), ($best.TotalMb / 1024))
    return $best
}

function Test-DockerGpu([string]$DockerPath, [object]$NvidiaInfo) {
    if ($null -eq $NvidiaInfo) {
        return $false
    }
    Write-Step "Comprobando NVIDIA en Docker"
    if ($DryRun) {
        Write-Field "estado" "saltado en dry-run"
        return $false
    }
    $stdout = New-TemporaryFile
    $stderr = New-TemporaryFile
    try {
        $process = Start-Process -FilePath $DockerPath `
            -ArgumentList @("run", "--rm", "--gpus", "all", "hello-world") `
            -NoNewWindow -Wait -PassThru `
            -RedirectStandardOutput $stdout.FullName `
            -RedirectStandardError $stderr.FullName
        if ($process.ExitCode -eq 0) {
            Write-Field "estado" "GPU NVIDIA disponible en Docker"
            return $true
        }
    } finally {
        Remove-Item -LiteralPath $stdout.FullName, $stderr.FullName -Force -ErrorAction SilentlyContinue
    }
    Write-Field "estado" "Docker no ha validado --gpus all"
    Write-Note "Se usara cpu salvo que fuerces NVIDIA manualmente."
    return $false
}

function Get-LlmModel([string]$LlmSize) {
    $profile = Get-ProfileFile $LlmSize
    if (-not (Test-Path -LiteralPath $profile)) {
        return "modelo-desconocido"
    }
    $values = Read-EnvFile $profile
    if ($values.ContainsKey("OLLAMA_MODEL") -and -not [string]::IsNullOrWhiteSpace([string]$values["OLLAMA_MODEL"])) {
        return [string]$values["OLLAMA_MODEL"]
    }
    return "modelo-desconocido"
}

function Format-LlmChoice([string]$LlmSize) {
    return "$LlmSize ($(Get-LlmModel $LlmSize))"
}

function Format-Selection([string]$SelectedAccelerator, [string]$LlmSize) {
    return "$SelectedAccelerator + $(Format-LlmChoice $LlmSize)"
}

function Format-MenuSelection([string]$SelectedAccelerator, [string]$LlmSize) {
    return "{0,-6} + {1,-4} ({2})" -f $SelectedAccelerator, $LlmSize, (Get-LlmModel $LlmSize)
}

function Write-MenuOption([string]$Key, [string]$Choice, [string]$Description) {
    $line = "    {0,-6} {1,-38}" -f $Key, $Choice
    if (-not [string]::IsNullOrWhiteSpace($Description)) {
        $line += " $Description"
    }
    Write-Host $line -ForegroundColor Gray
}

function Read-SetupSelection([string]$RecommendedAccelerator, [string]$RecommendedLlm, [bool]$DockerGpu) {
    Write-Step "Seleccion de modo"
    Write-MenuOption "Enter" (Format-MenuSelection $RecommendedAccelerator $RecommendedLlm) "<- recomendada"
    Write-MenuOption "1" (Format-MenuSelection "cpu" "low") "maxima compatibilidad"
    Write-MenuOption "2" (Format-MenuSelection "cpu" "high") "CPU/RAM; perfil experimental, puede ser muy lento"
    if ($DockerGpu) {
        Write-MenuOption "3" (Format-MenuSelection "nvidia" "low") "mayor velocidad"
        Write-MenuOption "4" (Format-MenuSelection "nvidia" "high") "perfil de referencia; mejor calidad esperada"
    }
    Write-MenuOption "5" "exit" "salir sin cambios"
    Write-Note "Usa la recomendada salvo que sepas exactamente que estas cambiando."

    while ($true) {
        $answer = Read-SetupOption
        $answer = $answer.Trim().ToLowerInvariant()
        if ($answer -eq "" -or $answer -eq "r") {
            return [pscustomobject]@{ Accelerator = $RecommendedAccelerator; Llm = $RecommendedLlm }
        }
        if ($answer -eq "1") {
            return [pscustomobject]@{ Accelerator = "cpu"; Llm = "low" }
        }
        if ($answer -eq "2") {
            return [pscustomobject]@{ Accelerator = "cpu"; Llm = "high" }
        }
        if ($DockerGpu -and $answer -eq "3") {
            return [pscustomobject]@{ Accelerator = "nvidia"; Llm = "low" }
        }
        if ($DockerGpu -and $answer -eq "4") {
            return [pscustomobject]@{ Accelerator = "nvidia"; Llm = "high" }
        }
        if ($answer -eq "5" -or $answer -eq "exit" -or $answer -eq "salir" -or $answer -eq "q") {
            Exit-Manualito "Setup cancelado. No se han aplicado cambios."
        }
        Write-Note "Opcion no valida. Pulsa Enter para usar la recomendada."
    }
}

function Resolve-Selection([bool]$DockerGpu, [object]$NvidiaInfo) {
    $recommendedAccelerator = "cpu"
    $recommendedLlm = "low"
    if ($DockerGpu -and $null -ne $NvidiaInfo) {
        if ($NvidiaInfo.FreeMb -ge $script:HighVramMb) {
            $recommendedAccelerator = "nvidia"
            $recommendedLlm = "high"
        } elseif ($NvidiaInfo.FreeMb -ge $script:LowVramMb) {
            $recommendedAccelerator = "nvidia"
            $recommendedLlm = "low"
        }
    }

    $finalAccelerator = $recommendedAccelerator
    $finalLlm = $recommendedLlm

    Write-Step "Configuracion recomendada"
    Write-Field "recomendada" (Format-Selection $recommendedAccelerator $recommendedLlm)
    Write-Field "ocr" "tesseract"

    if ($script:ManualSelectionRequested -or $UseRecommended -or $DryRun) {
        if ($Accelerator -ne "auto") { $finalAccelerator = $Accelerator }
        if ($Llm -ne "auto") { $finalLlm = $Llm }
        if ($finalAccelerator -eq "cpu" -and $Llm -eq "auto") { $finalLlm = "low" }
    } else {
        $choice = Read-SetupSelection $recommendedAccelerator $recommendedLlm $DockerGpu
        $finalAccelerator = $choice.Accelerator
        $finalLlm = $choice.Llm
    }

    Write-Step "Configuracion seleccionada"
    Write-Field "seleccionada" (Format-Selection $finalAccelerator $finalLlm)
    Write-Field "ocr" "tesseract"
    if ($finalAccelerator -ne $recommendedAccelerator -or $finalLlm -ne $recommendedLlm) {
        Write-Note "Configuracion manual distinta de la recomendada."
    }
    if ($finalAccelerator -eq "cpu" -and $finalLlm -eq "high") {
        Write-Note "$(Format-Selection "cpu" "high") usa CPU/RAM; perfil experimental, puede ser muy lento."
    }
    if ($finalAccelerator -eq "nvidia" -and $null -eq $NvidiaInfo) {
        Stop-Manualito "Has forzado NVIDIA, pero nvidia-smi no esta disponible."
    }
    if ($finalAccelerator -eq "nvidia" -and -not $DockerGpu) {
        Write-Note "Has forzado NVIDIA aunque Docker no ha validado --gpus all."
    }

    return [pscustomobject]@{
        Accelerator = $finalAccelerator
        Llm = $finalLlm
        Ocr = "tesseract"
        RecommendedAccelerator = $recommendedAccelerator
        RecommendedLlm = $recommendedLlm
    }
}

function Save-Selection([object]$Selection) {
    if (-not (Test-Path -LiteralPath $script:LocalDir)) {
        New-Item -ItemType Directory -Path $script:LocalDir -Force | Out-Null
    }
    $selectionExists = Test-Path -LiteralPath $script:SelectedEnv
    $lines = @(
        "# Generado por setup.bat. No editar salvo que sepas lo que haces.",
        "MANUALITO_ACCELERATOR=$($Selection.Accelerator)",
        "MANUALITO_LLM_SIZE=$($Selection.Llm)",
        "MANUALITO_OCR_MODE=$($Selection.Ocr)",
        "MANUALITO_RECOMMENDED_ACCELERATOR=$($Selection.RecommendedAccelerator)",
        "MANUALITO_RECOMMENDED_LLM_SIZE=$($Selection.RecommendedLlm)",
        "MANUALITO_SETUP_VERSION=1"
    )
    if (-not $DryRun) {
        $lines | Set-Content -LiteralPath $script:SelectedEnv -Encoding ASCII
        if ($selectionExists) {
            Write-Ok "Seleccion actualizada:"
        } else {
            Write-Ok "Seleccion guardada:"
        }
    } else {
        Write-Ok "Seleccion calculada:"
    }
    Write-Field "archivo" "deploy\local\selected.env"
}

function Get-ProfileFile([string]$LlmSize) {
    if ($LlmSize -eq "low") { return $script:LowProfile }
    if ($LlmSize -eq "high") { return $script:HighProfile }
    Stop-Manualito "LLM invalido: $LlmSize"
}

function Get-ComposePrefix([object]$Selection) {
    Assert-Accelerator $Selection.Accelerator
    $profile = Get-ProfileFile $Selection.Llm
    Assert-File $script:RootEnv ".env"
    Assert-File $script:LlmEnv "config\llm.env"
    Assert-File $script:ComposeFile "compose.yaml"
    Assert-File $profile "perfil LLM $($Selection.Llm)"
    $args = @("--env-file", $script:RootEnv, "--env-file", $script:LlmEnv, "--env-file", $profile, "-f", $script:ComposeFile)
    if ($Selection.Accelerator -eq "nvidia") {
        Assert-File $script:NvidiaCompose "override NVIDIA"
        $args += @("-f", $script:NvidiaCompose)
    }
    return $args
}

function Invoke-Compose([string]$DockerPath, [object]$Selection, [string[]]$ComposeTail) {
    $prefix = Get-ComposePrefix $Selection
    Invoke-External "docker compose $($ComposeTail -join ' ')" $DockerPath (@("compose") + $prefix + $ComposeTail)
}

function Invoke-DockerCaptureLines([string]$DockerPath, [object]$Selection, [string[]]$ComposeTail) {
    $prefix = Get-ComposePrefix $Selection
    $arguments = @("compose") + $prefix + $ComposeTail
    if ($DryRun) {
        return @()
    }
    $output = @(& $DockerPath $arguments 2>$null)
    if ($LASTEXITCODE -ne 0) {
        return @()
    }
    return @($output | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
}

function Invoke-DockerCapture([string]$DockerPath, [object]$Selection, [string[]]$ComposeTail) {
    $output = @(Invoke-DockerCaptureLines $DockerPath $Selection $ComposeTail)
    if ($output.Count -eq 0) {
        return $null
    }
    return [string]$output[0]
}

function Get-RunningLlmModel([string]$DockerPath, [object]$Selection) {
    return Invoke-DockerCapture $DockerPath $Selection @("exec", "-T", "llm", "printenv", "OLLAMA_MODEL")
}

function Load-Selection {
    if (-not (Test-Path -LiteralPath $script:SelectedEnv)) {
        return $null
    }
    $values = Read-EnvFile $script:SelectedEnv
    $selectedAccelerator = Get-RequiredValue $values "MANUALITO_ACCELERATOR"
    $selectedLlm = Get-RequiredValue $values "MANUALITO_LLM_SIZE"
    Assert-Accelerator $selectedAccelerator
    return [pscustomobject]@{
        Accelerator = $selectedAccelerator
        Llm = $selectedLlm
        Ocr = Get-RequiredValue $values "MANUALITO_OCR_MODE"
    }
}

function Get-ExistingSelectionForCompose {
    $selection = Load-Selection
    if ($null -ne $selection) {
        return $selection
    }
    return [pscustomobject]@{ Accelerator = "cpu"; Llm = "low"; Ocr = "tesseract" }
}

function Get-RunningManualitoServices([string]$DockerPath, [object]$Selection) {
    return @(Invoke-DockerCaptureLines $DockerPath $Selection @("ps", "--status=running", "--services"))
}

function Resolve-RunningManualitoBeforeVram([string]$DockerPath) {
    if ($DryRun) {
        return
    }
    $selection = Get-ExistingSelectionForCompose
    $runningServices = @(Get-RunningManualitoServices $DockerPath $selection)
    if ($runningServices.Count -eq 0) {
        return
    }

    Write-Step "Manualito ya esta en ejecucion"
    Write-Field "servicios" ($runningServices -join ", ")
    Write-Note "Puede ocupar VRAM y hacer que la recomendacion sea mas conservadora."

    if ($script:ManualSelectionRequested -or $UseRecommended) {
        Write-Note "No se parara automaticamente porque has usado parametros de setup."
        return
    }

    if (Read-YesNo "Quieres pararlo antes de medir VRAM") {
        Invoke-Compose $DockerPath $selection @("down")
    } else {
        Write-Note "La recomendacion usara la VRAM libre actual."
    }
}

function Invoke-Setup([string]$DockerPath) {
    Resolve-RunningManualitoBeforeVram $DockerPath
    $nvidia = Get-NvidiaInfo
    $dockerGpu = Test-DockerGpu $DockerPath $nvidia
    $selection = Resolve-Selection $dockerGpu $nvidia
    Save-Selection $selection
    if ($SkipBuild) {
        Write-Note "Build saltado por -SkipBuild."
        return $selection
    }
    Invoke-Compose $DockerPath $selection @("up", "--build", "--no-start")
    if ($DryRun) {
        Write-Ok "Comando de setup preparado"
    } else {
        Write-Ok "Setup preparado."
    }
    return $selection
}

function Invoke-Start([string]$DockerPath) {
    $selection = Load-Selection
    if ($null -eq $selection) {
        Write-Note "Primera ejecucion detectada: lanzando setup antes de arrancar."
        $selection = Invoke-Setup $DockerPath
    }
    Write-Step "Arrancando Manualito"
    Write-Field "modo" (Format-Selection $selection.Accelerator $selection.Llm)
    Write-Field "ocr" $selection.Ocr
    Invoke-Compose $DockerPath $selection @("up", "-d")
    if ($DryRun) {
        Write-Ok "Comando de arranque preparado"
    } else {
        Write-Ok "Manualito listo:"
        Write-Field "api" "http://localhost:8000"
        Write-Field "app" "http://localhost:5173"
        Write-Field "flower" "http://localhost:5555"
        Write-Field "mailpit" "http://localhost:8025"
        Write-Field "openapi" "http://localhost:8000/docs"
        Write-Ok "LLM:"
        $runningModel = Get-RunningLlmModel $DockerPath $selection
        if ([string]::IsNullOrWhiteSpace($runningModel)) {
            Write-Field "modelo" "no verificado"
        } else {
            Write-Field "modelo" $runningModel
        }
    }
}

function Invoke-Stop([string]$DockerPath) {
    $selection = Load-Selection
    if ($null -eq $selection) {
        $selection = [pscustomobject]@{ Accelerator = "cpu"; Llm = "low"; Ocr = "tesseract" }
        Write-Note "No hay selected.env; parando con cpu + low."
    }
    Invoke-Compose $DockerPath $selection @("down")
    if ($DryRun) {
        Write-Ok "Comando de parada preparado"
    } else {
        Write-Ok "Manualito parado"
    }
}

Push-Location $script:Root
try {
    Write-Title "Manualito $Action"
    Assert-File $script:ComposeFile "compose.yaml"
    $dockerPath = Test-Docker
    switch ($Action) {
        "setup" {
            [void](Invoke-Setup $dockerPath)
            if (-not $DryRun -and -not $SkipBuild) {
                if (Read-YesNo "Quieres arrancar Manualito ahora?") {
                    Invoke-Start $dockerPath
                } else {
                    Write-Ok "Ejecuta start.bat cuando quieras."
                }
            }
        }
        "start" { Invoke-Start $dockerPath }
        "stop" { Invoke-Stop $dockerPath }
    }
} catch {
    Write-Fail $_.Exception.Message
    exit 1
} finally {
    Pop-Location
}
