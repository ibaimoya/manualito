param(
    [ValidateSet("setup", "start", "stop")]
    [string]$Action = "start",

    [ValidateSet("auto", "cpu", "nvidia")]
    [string]$Accelerator = "auto",

    [ValidateSet("auto", "low", "high")]
    [string]$Llm = "auto",

    [ValidateSet("auto", "tesseract", "paddle_cpu", "paddle_gpu")]
    [string]$Ocr = "auto",

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
$script:LogsDir = Join-Path $script:LocalDir "logs"
$script:SelectedEnv = Join-Path $script:LocalDir "selected.env"
$script:ComposeFile = Join-Path $script:Root "compose.yaml"
$script:RootEnv = Join-Path $script:Root ".env"
$script:LlmEnv = Join-Path $script:Root "config\llm.env"
$script:NvidiaCompose = Join-Path $script:Root "deploy\compose\accelerators\nvidia.yaml"
$script:OcrPaddleCpuCompose = Join-Path $script:Root "deploy\compose\ocr\paddle-cpu.yaml"
$script:OcrPaddleGpuCompose = Join-Path $script:Root "deploy\compose\ocr\paddle-gpu.yaml"
$script:LowProfile = Join-Path $script:Root "deploy\profiles\llm\low.env"
$script:HighProfile = Join-Path $script:Root "deploy\profiles\llm\high.env"
$script:LlmVramReserveGb = 1.0
$script:PaddleGpuVramBudgetGb = 3.0
$script:PaddleGpuMinDriver = [version]"522.06"
$script:ManualSelectionRequested = ($Accelerator -ne "auto" -or $Llm -ne "auto" -or $Ocr -ne "auto")

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

# Comprueba si la consola permite una animación simple en la línea actual.
function Test-InteractiveConsole {
    try {
        return (-not [Console]::IsOutputRedirected -and [Console]::BufferWidth -gt 0 -and [Console]::BufferHeight -gt 0)
    } catch {
        return $false
    }
}

# Limpia la pantalla solo cuando la consola puede repintarse de forma fiable.
function Clear-ManualitoScreen {
    if (-not (Test-InteractiveConsole)) {
        return
    }
    try {
        Clear-Host
    } catch {
        try {
            [Console]::Clear()
        } catch {
            return
        }
    }
}

# Ajusta una línea dinámica para que no deje restos visuales al repintar.
function Format-ConsoleLine([string]$Text) {
    $width = 80
    try {
        $width = [Math]::Max(20, [Console]::BufferWidth - 1)
    } catch {
        $width = 80
    }
    $clean = ([string]$Text) -replace "[`r`n`t]", " "
    if ($clean.Length -gt $width) {
        $clean = $clean.Substring(0, [Math]::Max(0, $width - 3)) + "..."
    }
    return $clean.PadRight($width)
}

# Devuelve una barra de actividad indeterminada; no representa porcentaje real.
function Get-ActivityBar([int]$Frame) {
    $width = 30
    $marker = "====>"
    $position = $Frame % ($width - $marker.Length + 1)
    return "[" + (" " * $position) + $marker + (" " * ($width - $marker.Length - $position)) + "]"
}

# Repinta una única línea de actividad mientras Docker trabaja.
function Write-ActivityLine([TimeSpan]$Elapsed, [int]$Frame) {
    if (-not (Test-InteractiveConsole)) {
        return
    }
    $line = "    {0,-22} {1}  {2}" -f "transcurrido", (Format-Elapsed $Elapsed), (Get-ActivityBar $Frame)
    Write-Host -NoNewline ("`r" + (Format-ConsoleLine $line)) -ForegroundColor Gray
}

function Complete-ActivityLine {
    if (Test-InteractiveConsole) {
        Write-Host ""
    }
}

function New-DockerLogPath {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
    return Join-Path $script:LogsDir "$Action-$stamp.log"
}

function Format-ProjectPath([string]$Path) {
    if ($Path.StartsWith($script:Root, [StringComparison]::OrdinalIgnoreCase)) {
        return $Path.Substring($script:Root.Length + 1)
    }
    return $Path
}

# Lee la opción del selector sin añadir caracteres extra a la línea.
function Read-SetupOption {
    Write-Host -NoNewline "[*] " -ForegroundColor Yellow
    Write-Host -NoNewline "Selecciona una opcion: " -ForegroundColor Cyan
    $answer = [Console]::ReadLine()
    if ($null -eq $answer) {
        return ""
    }
    return [string]$answer
}

# Pregunta una confirmación simple para decisiones interactivas.
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

# Ejecuta Docker en segundo plano, guarda todo el log y muestra una actividad estable.
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
    if (-not (Test-Path -LiteralPath $script:LogsDir)) {
        New-Item -ItemType Directory -Path $script:LogsDir -Force | Out-Null
    }
    $dockerLog = New-DockerLogPath
    Write-Field "accion" $Label
    Write-Field "estado" "en curso"
    Write-Field "log" (Format-ProjectPath $dockerLog)
    $stopwatch = [Diagnostics.Stopwatch]::StartNew()
    if (-not (Test-InteractiveConsole)) {
        Write-Field "transcurrido" (Format-Elapsed $stopwatch.Elapsed)
    }
    $job = Start-Job -ScriptBlock {
        param([string]$InnerFilePath, [string[]]$InnerArguments, [string]$InnerLog, [string]$InnerCommand)
        Set-Content -LiteralPath $InnerLog -Value @("# $InnerCommand", "") -Encoding UTF8
        try {
            & $InnerFilePath @InnerArguments 2>&1 | Out-File -LiteralPath $InnerLog -Append -Encoding UTF8
            $code = $LASTEXITCODE
            if ($null -eq $code) {
                $code = 0
            }
            return [int]$code
        } catch {
            $_ | Out-File -LiteralPath $InnerLog -Append -Encoding UTF8
            return 1
        }
    } -ArgumentList $FilePath, $Arguments, $dockerLog, $displayCommand
    $frame = 0
    while ($job.State -eq "Running") {
        Write-ActivityLine $stopwatch.Elapsed $frame
        Start-Sleep -Milliseconds 160
        $frame++
    }
    Wait-Job -Job $job | Out-Null
    $result = @(Receive-Job -Job $job -ErrorAction SilentlyContinue)
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    $stopwatch.Stop()
    Complete-ActivityLine
    $exitCode = 1
    if ($result.Count -gt 0) {
        $rawExitCode = [string]$result[-1]
        if (-not [int]::TryParse($rawExitCode, [ref]$exitCode)) {
            $exitCode = 1
        }
    }
    Write-Field "transcurrido" (Format-Elapsed $stopwatch.Elapsed)
    if ($exitCode -ne 0) {
        Write-Field "estado" "error"
        Write-Fail "$Label fallo con codigo $exitCode. Revisa $(Format-ProjectPath $dockerLog)"
        exit 1
    }
    Write-Field "estado" "listo"
}

# Lee archivos .env sencillos como pares clave=valor.
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

function Assert-Ocr([string]$Value) {
    if ($Value -ne "tesseract" -and $Value -ne "paddle_cpu" -and $Value -ne "paddle_gpu") {
        Stop-Manualito "OCR invalido '$Value'. Ejecuta setup.bat otra vez."
    }
}

# Ejecuta comandos nativos capturando stderr sin saltarse nuestro manejo de errores.
function Invoke-NativeQuiet([string]$FilePath, [string[]]$Arguments) {
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = & $FilePath @Arguments 2>&1
        return [pscustomobject]@{
            ExitCode = $LASTEXITCODE
            Output = @($output | ForEach-Object { [string]$_ })
        }
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

# Valida que Docker exista, responda y esté usando contenedores Linux.
function Test-Docker {
    Write-Step "Comprobando Docker"
    $docker = Get-Command "docker" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $docker) {
        Stop-Manualito "Docker no está instalado o no está en PATH."
    }
    Write-Field "docker" $docker.Source
    if (-not $DryRun) {
        $dockerInfo = Invoke-NativeQuiet $docker.Source @("info", "--format", "{{.OSType}}")
        if ($dockerInfo.ExitCode -ne 0) {
            Stop-Manualito "Docker no responde. Abre Docker Desktop y vuelve a intentarlo."
        }
        $osType = ($dockerInfo.Output | Select-Object -First 1)
        if ($osType -and $osType.Trim() -ne "linux") {
            Stop-Manualito "Docker está en modo '$($osType.Trim())'. Manualito necesita contenedores Linux."
        }
        Write-Field "engine" "linux"
    }
    $composeResult = Invoke-NativeQuiet $docker.Source @("compose", "version", "--short")
    if (-not $DryRun -and $composeResult.ExitCode -ne 0) {
        Stop-Manualito "Docker Compose no responde."
    }
    $compose = ($composeResult.Output | Select-Object -First 1)
    if ($compose) {
        Write-Field "compose" $compose.Trim()
    }
    return $docker.Source
}

# Obtiene la GPU NVIDIA con más VRAM libre para recomendar perfil.
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
        return [pscustomobject]@{ Name = "NVIDIA"; DriverVersion = ""; FreeMb = 0; TotalMb = 0 }
    }
    $nvidiaQuery = Invoke-NativeQuiet $nvidia.Source @("--query-gpu=name,driver_version,memory.free,memory.total", "--format=csv,noheader,nounits")
    $raw = $nvidiaQuery.Output
    if ($nvidiaQuery.ExitCode -ne 0 -or -not $raw) {
        Write-Field "estado" "nvidia-smi no responde"
        return $null
    }
    $best = $null
    foreach ($line in @($raw)) {
        $parts = $line -split ",\s*"
        if ($parts.Count -lt 4) {
            continue
        }
        $free = 0
        $total = 0
        if (-not [int]::TryParse($parts[2], [ref]$free)) { continue }
        if (-not [int]::TryParse($parts[3], [ref]$total)) { continue }
        $gpu = [pscustomobject]@{ Name = $parts[0]; DriverVersion = $parts[1]; FreeMb = $free; TotalMb = $total }
        if ($null -eq $best -or $gpu.FreeMb -gt $best.FreeMb) {
            $best = $gpu
        }
    }
    if ($null -eq $best) {
        Write-Field "estado" "sin datos de memoria"
        return $null
    }
    Write-Field "gpu" $best.Name
    Write-Field "driver" $best.DriverVersion
    Write-Field "vram libre" ("{0:N1} GB / {1:N1} GB" -f ($best.FreeMb / 1024), ($best.TotalMb / 1024))
    return $best
}

# Verifica que Docker pueda usar NVIDIA antes de recomendar ese acelerador.
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

function Test-NvidiaDriverForPaddleGpu([object]$NvidiaInfo) {
    if ($null -eq $NvidiaInfo -or [string]::IsNullOrWhiteSpace([string]$NvidiaInfo.DriverVersion)) {
        return $false
    }
    try {
        return ([version]$NvidiaInfo.DriverVersion -ge $script:PaddleGpuMinDriver)
    } catch {
        return $false
    }
}

function Get-PaddleGpuStatus([bool]$DockerGpu, [object]$NvidiaInfo) {
    if (-not $DockerGpu) {
        return [pscustomobject]@{ Available = $false; Reason = "no disponible: requiere NVIDIA en Docker" }
    }
    if (-not (Test-NvidiaDriverForPaddleGpu $NvidiaInfo)) {
        return [pscustomobject]@{ Available = $false; Reason = "no disponible: driver NVIDIA < 522.06" }
    }
    return [pscustomobject]@{ Available = $true; Reason = "NVIDIA compatible" }
}

# Resuelve los datos del perfil low/high correspondiente.
function Get-LlmProfileValues([string]$LlmSize) {
    $profile = Get-ProfileFile $LlmSize
    Assert-File $profile "perfil LLM $LlmSize"
    return Read-EnvFile $profile
}

# Resuelve el modelo real leyendo el perfil low/high correspondiente.
function Get-LlmModel([string]$LlmSize) {
    $values = Get-LlmProfileValues $LlmSize
    if ($values.ContainsKey("OLLAMA_MODEL") -and -not [string]::IsNullOrWhiteSpace([string]$values["OLLAMA_MODEL"])) {
        return [string]$values["OLLAMA_MODEL"]
    }
    Stop-Manualito "Falta OLLAMA_MODEL en perfil LLM $LlmSize."
}

function Get-LlmEstimatedVramGb([string]$LlmSize) {
    $values = Get-LlmProfileValues $LlmSize
    if (-not $values.ContainsKey("MANUALITO_LLM_VRAM_GB")) {
        Stop-Manualito "Falta MANUALITO_LLM_VRAM_GB en perfil LLM $LlmSize."
    }
    $parsed = 0.0
    $raw = [string]$values["MANUALITO_LLM_VRAM_GB"]
    if (-not [double]::TryParse($raw, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$parsed) -or $parsed -le 0) {
        Stop-Manualito "MANUALITO_LLM_VRAM_GB invalido en perfil LLM $LlmSize."
    }
    return $parsed
}

function Get-LlmRecommendedFreeMb([string]$LlmSize) {
    return [int][Math]::Ceiling((Get-LlmEstimatedVramGb $LlmSize + $script:LlmVramReserveGb) * 1024)
}

function Format-LlmVram([string]$LlmSize) {
    return "~{0:N1} GB" -f (Get-LlmEstimatedVramGb $LlmSize)
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

function Write-MenuOption([string]$Key, [string]$Choice, [string]$Description, [int]$ChoiceWidth = 38) {
    $line = "    {0,-6} {1,-$ChoiceWidth}" -f $Key, $Choice
    if (-not [string]::IsNullOrWhiteSpace($Description)) {
        $line += " $Description"
    }
    Write-Host $line -ForegroundColor Gray
}

function Write-OcrSelectionHeader([string]$SelectedAccelerator, [string]$SelectedLlm) {
    Clear-ManualitoScreen
    Write-Title "Manualito setup"
    Write-Step "Modo seleccionado"
    Write-Field "modo" (Format-Selection $SelectedAccelerator $SelectedLlm)
    Write-Field "vram llm" (Format-LlmVram $SelectedLlm)
}

function Write-SetupExecutionHeader([object]$Selection) {
    Clear-ManualitoScreen
    Write-Title "Manualito setup"
    Write-Step "Seleccion final"
    Write-Field "modo" (Format-Selection $Selection.Accelerator $Selection.Llm)
    Write-Field "vram llm" (Format-LlmVram $Selection.Llm)
    Write-Field "ocr" $Selection.Ocr
    Write-Field "config" "deploy\local\selected.env"
    if ($Selection.Accelerator -ne $Selection.RecommendedAccelerator -or $Selection.Llm -ne $Selection.RecommendedLlm -or $Selection.Ocr -ne $Selection.RecommendedOcr) {
        Write-Field "aviso" "seleccion manual"
    }
    if ($Selection.Accelerator -eq "cpu" -and $Selection.Llm -eq "high") {
        Write-Field "aviso" "CPU/RAM; puede ser muy lento"
    }
    if ($Selection.Ocr -eq "paddle_cpu") {
        Write-Field "aviso ocr" "muy fiable, pero lento"
    }
    if ($Selection.Ocr -eq "paddle_gpu") {
        Write-Field "aviso ocr" "requiere Paddle CUDA y VRAM libre"
    }
}

function Get-OcrRecommendation([string]$SelectedAccelerator, [string]$LlmSize, [object]$NvidiaInfo, [object]$PaddleGpuStatus) {
    if ($SelectedAccelerator -ne "nvidia") {
        return [pscustomobject]@{ Mode = "tesseract"; Detail = "el modo cpu no solicita GPU a Docker" }
    }
    if (-not $PaddleGpuStatus.Available) {
        return [pscustomobject]@{ Mode = "tesseract"; Detail = $PaddleGpuStatus.Reason }
    }
    if ($null -eq $NvidiaInfo -or $NvidiaInfo.FreeMb -le 0) {
        return [pscustomobject]@{ Mode = "tesseract"; Detail = "no hay una medida real de VRAM libre" }
    }
    $remainingGb = ($NvidiaInfo.FreeMb / 1024.0) - (Get-LlmEstimatedVramGb $LlmSize)
    if ($remainingGb -ge $script:PaddleGpuVramBudgetGb) {
        return [pscustomobject]@{ Mode = "paddle_gpu"; Detail = ("quedan ~{0:N1} GB tras el LLM seleccionado" -f $remainingGb) }
    }
    return [pscustomobject]@{ Mode = "tesseract"; Detail = ("quedan ~{0:N1} GB tras el LLM seleccionado; PaddleGPU pide ~{1:N1} GB de margen" -f $remainingGb, $script:PaddleGpuVramBudgetGb) }
}

# Dibuja y procesa el selector interactivo de acelerador y modelo.
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

function Read-OcrSelection([string]$RecommendedOcr, [object]$PaddleGpuStatus, [string]$RecommendationDetail) {
    Write-Step "Seleccion de OCR"
    Write-MenuOption "Enter" $RecommendedOcr "<- recomendada" 14
    Write-MenuOption "1" "tesseract" "maxima compatibilidad" 14
    Write-MenuOption "2" "paddle_cpu" "muy fiable, pero lento" 14
    if ($PaddleGpuStatus.Available) {
        Write-MenuOption "3" "paddle_gpu" "mejor OCR esperado; requiere margen de VRAM" 14
    } else {
        Write-MenuOption "3" "paddle_gpu" $PaddleGpuStatus.Reason 14
    }
    Write-MenuOption "5" "exit" "salir sin cambios" 14
    if ($RecommendedOcr -eq "paddle_gpu") {
        Write-Note "paddle_gpu se recomienda porque $RecommendationDetail; Tesseract sigue siendo la opcion conservadora."
    } else {
        Write-Note "Tesseract recomendado: $RecommendationDetail."
    }

    while ($true) {
        $answer = Read-SetupOption
        $answer = $answer.Trim().ToLowerInvariant()
        if ($answer -eq "" -or $answer -eq "r") {
            return $RecommendedOcr
        }
        if ($answer -eq "1" -or $answer -eq "tesseract") {
            return "tesseract"
        }
        if ($answer -eq "2" -or $answer -eq "paddle_cpu") {
            return "paddle_cpu"
        }
        if ($answer -eq "3" -or $answer -eq "paddle_gpu") {
            if ($PaddleGpuStatus.Available) {
                return "paddle_gpu"
            }
            Write-Note "paddle_gpu no esta disponible: $($PaddleGpuStatus.Reason)."
            continue
        }
        if ($answer -eq "5" -or $answer -eq "exit" -or $answer -eq "salir" -or $answer -eq "q") {
            Exit-Manualito "Setup cancelado. No se han aplicado cambios."
        }
        Write-Note "Opcion no valida. Pulsa Enter para usar la recomendada."
    }
}

# Calcula la recomendación final mezclando autodetección y flags manuales.
function Resolve-Selection([bool]$DockerGpu, [object]$NvidiaInfo) {
    $recommendedAccelerator = "cpu"
    $recommendedLlm = "low"
    $paddleGpuStatus = Get-PaddleGpuStatus $DockerGpu $NvidiaInfo
    if ($DockerGpu -and $null -ne $NvidiaInfo) {
        if ($NvidiaInfo.FreeMb -ge (Get-LlmRecommendedFreeMb "high")) {
            $recommendedAccelerator = "nvidia"
            $recommendedLlm = "high"
        } elseif ($NvidiaInfo.FreeMb -ge (Get-LlmRecommendedFreeMb "low")) {
            $recommendedAccelerator = "nvidia"
            $recommendedLlm = "low"
        }
    }
    $recommendedOcrInfo = Get-OcrRecommendation $recommendedAccelerator $recommendedLlm $NvidiaInfo $paddleGpuStatus

    $finalAccelerator = $recommendedAccelerator
    $finalLlm = $recommendedLlm
    $finalOcrInfo = $recommendedOcrInfo
    $finalOcr = $recommendedOcrInfo.Mode

    Write-Step "Configuracion recomendada"
    Write-Field "recomendada" (Format-Selection $recommendedAccelerator $recommendedLlm)
    Write-Field "vram llm" (Format-LlmVram $recommendedLlm)
    Write-Field "ocr" $recommendedOcrInfo.Mode

    if ($script:ManualSelectionRequested -or $UseRecommended -or $DryRun) {
        if ($Accelerator -ne "auto") { $finalAccelerator = $Accelerator }
        if ($Llm -ne "auto") { $finalLlm = $Llm }
        if ($finalAccelerator -eq "cpu" -and $Llm -eq "auto") { $finalLlm = "low" }
        $finalOcrInfo = Get-OcrRecommendation $finalAccelerator $finalLlm $NvidiaInfo $paddleGpuStatus
        $finalOcr = $finalOcrInfo.Mode
        if ($Ocr -ne "auto") { $finalOcr = $Ocr }
    } else {
        $choice = Read-SetupSelection $recommendedAccelerator $recommendedLlm $DockerGpu
        $finalAccelerator = $choice.Accelerator
        $finalLlm = $choice.Llm
        $finalOcrInfo = Get-OcrRecommendation $finalAccelerator $finalLlm $NvidiaInfo $paddleGpuStatus
        Write-OcrSelectionHeader $finalAccelerator $finalLlm
        $finalOcr = Read-OcrSelection $finalOcrInfo.Mode $paddleGpuStatus $finalOcrInfo.Detail
    }

    $showSelectionMessages = ($script:ManualSelectionRequested -or $UseRecommended -or $DryRun -or $SkipBuild)
    if ($showSelectionMessages) {
        Write-Step "Configuracion seleccionada"
        Write-Field "seleccionada" (Format-Selection $finalAccelerator $finalLlm)
        Write-Field "vram llm" (Format-LlmVram $finalLlm)
        Write-Field "ocr" $finalOcr
    }
    if ($finalAccelerator -ne $recommendedAccelerator -or $finalLlm -ne $recommendedLlm -or $finalOcr -ne $recommendedOcrInfo.Mode) {
        if ($showSelectionMessages) {
            Write-Note "Configuracion manual distinta de la recomendada."
        }
    }
    if ($finalAccelerator -eq "cpu" -and $finalLlm -eq "high") {
        if ($showSelectionMessages) {
            Write-Note "$(Format-Selection "cpu" "high") usa CPU/RAM; perfil experimental, puede ser muy lento."
        }
    }
    if ($finalAccelerator -eq "nvidia" -and $null -eq $NvidiaInfo) {
        Stop-Manualito "Has forzado NVIDIA, pero nvidia-smi no esta disponible."
    }
    if ($finalAccelerator -eq "nvidia" -and -not $DockerGpu) {
        if ($showSelectionMessages) {
            Write-Note "Has forzado NVIDIA aunque Docker no ha validado --gpus all."
        }
    }
    if ($finalOcr -eq "paddle_cpu") {
        if ($showSelectionMessages) {
            Write-Note "paddle_cpu es muy fiable, pero puede ser bastante lento."
        }
    }
    if ($finalOcr -eq "paddle_gpu" -and -not $paddleGpuStatus.Available) {
        if ($DryRun) {
            Write-Note "Has elegido paddle_gpu, pero $($paddleGpuStatus.Reason)."
        } else {
            Stop-Manualito "Has elegido paddle_gpu, pero $($paddleGpuStatus.Reason)."
        }
    }
    if ($finalOcr -eq "paddle_gpu" -and $paddleGpuStatus.Available -and $finalOcrInfo.Mode -ne "paddle_gpu") {
        if ($showSelectionMessages) {
            Write-Note "Has elegido paddle_gpu aunque $($finalOcrInfo.Detail)."
        }
    }

    return [pscustomobject]@{
        Accelerator = $finalAccelerator
        Llm = $finalLlm
        Ocr = $finalOcr
        RecommendedAccelerator = $recommendedAccelerator
        RecommendedLlm = $recommendedLlm
        RecommendedOcr = $recommendedOcrInfo.Mode
    }
}

# Persiste la selección para que start.bat use exactamente el mismo perfil.
function Save-Selection([object]$Selection, [switch]$Quiet) {
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
        "MANUALITO_RECOMMENDED_OCR_MODE=$($Selection.RecommendedOcr)",
        "MANUALITO_SETUP_VERSION=1"
    )
    if (-not $DryRun) {
        $lines | Set-Content -LiteralPath $script:SelectedEnv -Encoding ASCII
        if ($Quiet) {
            return
        }
        if ($selectionExists) {
            Write-Ok "Seleccion actualizada:"
        } else {
            Write-Ok "Seleccion guardada:"
        }
    } elseif ($Quiet) {
        return
    } else {
        Write-Ok "Seleccion calculada:"
    }
    Write-Field "archivo" "deploy\local\selected.env"
}

# Devuelve el .env del perfil LLM elegido.
function Get-ProfileFile([string]$LlmSize) {
    if ($LlmSize -eq "low") { return $script:LowProfile }
    if ($LlmSize -eq "high") { return $script:HighProfile }
    Stop-Manualito "LLM invalido: $LlmSize"
}

# Construye la parte común de docker compose con envs y overrides.
function Get-ComposePrefix([object]$Selection) {
    Assert-Accelerator $Selection.Accelerator
    Assert-Ocr $Selection.Ocr
    $profile = Get-ProfileFile $Selection.Llm
    Assert-File $script:RootEnv ".env"
    Assert-File $script:LlmEnv "config\llm.env"
    Assert-File $script:ComposeFile "compose.yaml"
    Assert-File $profile "perfil LLM $($Selection.Llm)"
    $args = @("--ansi", "never", "--progress", "plain", "--env-file", $script:RootEnv, "--env-file", $script:LlmEnv, "--env-file", $profile, "-f", $script:ComposeFile)
    if ($Selection.Accelerator -eq "nvidia") {
        Assert-File $script:NvidiaCompose "override NVIDIA"
        $args += @("-f", $script:NvidiaCompose)
    }
    if ($Selection.Ocr -eq "paddle_cpu") {
        Assert-File $script:OcrPaddleCpuCompose "override OCR Paddle CPU"
        $args += @("-f", $script:OcrPaddleCpuCompose)
    }
    if ($Selection.Ocr -eq "paddle_gpu") {
        Assert-File $script:OcrPaddleGpuCompose "override OCR Paddle GPU"
        $args += @("-f", $script:OcrPaddleGpuCompose)
    }
    return $args
}

# Ejecuta docker compose con la selección activa.
function Invoke-Compose([string]$DockerPath, [object]$Selection, [string[]]$ComposeTail) {
    $prefix = Get-ComposePrefix $Selection
    Invoke-External "docker compose $($ComposeTail -join ' ')" $DockerPath (@("compose") + $prefix + $ComposeTail)
}

# Captura salida corta de compose para comprobaciones internas.
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

# Devuelve la primera línea útil de una captura de Docker.
function Invoke-DockerCapture([string]$DockerPath, [object]$Selection, [string[]]$ComposeTail) {
    $output = @(Invoke-DockerCaptureLines $DockerPath $Selection $ComposeTail)
    if ($output.Count -eq 0) {
        return $null
    }
    return [string]$output[0]
}

# Consulta el modelo que realmente tiene cargado el contenedor LLM.
function Get-RunningLlmModel([string]$DockerPath, [object]$Selection) {
    return Invoke-DockerCapture $DockerPath $Selection @("exec", "-T", "llm", "printenv", "OLLAMA_MODEL")
}

# Carga la selección guardada por setup.bat.
function Load-Selection {
    if (-not (Test-Path -LiteralPath $script:SelectedEnv)) {
        return $null
    }
    $values = Read-EnvFile $script:SelectedEnv
    $selectedAccelerator = Get-RequiredValue $values "MANUALITO_ACCELERATOR"
    $selectedLlm = Get-RequiredValue $values "MANUALITO_LLM_SIZE"
    $selectedOcr = Get-RequiredValue $values "MANUALITO_OCR_MODE"
    Assert-Accelerator $selectedAccelerator
    Assert-Ocr $selectedOcr
    return [pscustomobject]@{
        Accelerator = $selectedAccelerator
        Llm = $selectedLlm
        Ocr = $selectedOcr
    }
}

# Usa una selección mínima para poder ejecutar compose antes del primer setup.
function Get-ExistingSelectionForCompose {
    $selection = Load-Selection
    if ($null -ne $selection) {
        return $selection
    }
    return [pscustomobject]@{ Accelerator = "cpu"; Llm = "low"; Ocr = "tesseract" }
}

# Lista servicios de Manualito que siguen arrancados.
function Get-RunningManualitoServices([string]$DockerPath, [object]$Selection) {
    return @(Invoke-DockerCaptureLines $DockerPath $Selection @("ps", "--status=running", "--services"))
}

# Evita medir VRAM con Manualito consumiendo GPU salvo que el usuario lo acepte.
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

# Prepara configuración, guarda selección y deja las imágenes construidas.
function Invoke-Setup([string]$DockerPath) {
    Resolve-RunningManualitoBeforeVram $DockerPath
    $nvidia = Get-NvidiaInfo
    $dockerGpu = Test-DockerGpu $DockerPath $nvidia
    $selection = Resolve-Selection $dockerGpu $nvidia
    Save-Selection $selection -Quiet:(-not $DryRun -and -not $SkipBuild)
    if ($SkipBuild) {
        Write-Note "Build saltado por -SkipBuild."
        return $selection
    }
    Write-SetupExecutionHeader $selection
    Invoke-Compose $DockerPath $selection @("up", "--build", "--no-start")
    if ($DryRun) {
        Write-Ok "Comando de setup preparado"
    } else {
        Write-Ok "Setup preparado."
    }
    return $selection
}

# Arranca Manualito con la selección guardada o lanza setup si falta.
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

# Detiene Manualito con el mismo conjunto de compose usado para arrancar.
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
                    exit 42
                } else {
                    Write-Ok "Manualito queda preparado. Abre start.bat para arrancarlo."
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
