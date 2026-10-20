#Requires -Version 5.1
<#
  PCA Setup - Bootstrap para Windows
  Executa em maquina limpa (sem Git, Java, Node ou Maven instalados).
  Requer apenas PowerShell, que ja vem no Windows.
#>
[CmdletBinding()]
param(
  [string] $JavaVersion = "21",
  [switch] $SkipProvision,
  [switch] $SkipBuild,
  [switch] $SkipDatabase,
  [switch] $ForceEnv
)

$ErrorActionPreference = "Stop"

# ---------- Config ----------
$Org       = "projeto-ong-amar"
$Workspace = Join-Path $HOME "projeto-ong-amar"
$Repos = @(
  @{ Name = "backend";        Repo = "projeto-ong-amar-backend";        Setup = $true },
  @{ Name = "frontend";       Repo = "projeto-ong-amar-frontend";       Setup = $true },
  @{ Name = "banco-de-dados"; Repo = "projeto-ong-amar-banco-de-dados"; Setup = $false }
)

# ---------- Output helpers ----------
function Write-Info    { param($m) Write-Host "> $m" -ForegroundColor Cyan }
function Write-Ok      { param($m) Write-Host "OK $m" -ForegroundColor Green }
function Write-Warn    { param($m) Write-Host "!  $m" -ForegroundColor Yellow }
function Write-Err     { param($m) Write-Host "X  $m" -ForegroundColor Red }
function Write-Title   { param($m) Write-Host "`n== $m ==" -ForegroundColor Blue }
function Write-High    { param($m) Write-Host $m -ForegroundColor Magenta }
function Write-Dim     { param($m) Write-Host $m -ForegroundColor DarkGray }

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object Security.Principal.WindowsPrincipal $id).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-Cmd { param($c) return [bool](Get-Command $c -ErrorAction SilentlyContinue) }

function Update-SessionPath {
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
              [System.Environment]::GetEnvironmentVariable('Path', 'User')
}

# ---------- Provisioning ----------
function Get-SystemPackageManager {
  if (Test-Cmd "winget") { return "winget" }
  if (Test-Cmd "choco")  { return "choco"  }
  if (Test-Cmd "scoop")  { return "scoop"  }
  return $null
}

function Install-Package {
  param(
    [string] $WingetId,
    [string] $ChocoPkg,
    [string] $ScoopPkg,
    [string] $ScoopBucket
  )

  switch ($script:Spm) {
    "winget" {
      Write-Info "winget install --id $WingetId"
      & winget install --id $WingetId --exact --silent `
        --accept-source-agreements --accept-package-agreements
    }
    "choco" {
      Write-Info "choco install $ChocoPkg"
      & choco install $ChocoPkg -y --no-progress
    }
    "scoop" {
      # Buckets extras (ex: temurin) nao vem no install padrao do Scoop.
      if ($ScoopBucket) {
        Write-Info "scoop bucket add $ScoopBucket"
        & scoop bucket add $ScoopBucket 2>&1 | Out-Null
      }
      Write-Info "scoop install $ScoopPkg"
      & scoop install $ScoopPkg
    }
    default { throw "Nenhum gerenciador de pacotes disponivel (winget/choco/scoop)." }
  }
}

function Get-JavaMajor {
  try {
    $out = (& java -version 2>&1 | Select-Object -First 1)
    if ($out -match 'version "(\d+)(?:\.(\d+))?') {
      if ($Matches[1] -eq "1") { return [int]$Matches[2] }
      return [int]$Matches[1]
    }
  } catch {}
  return $null
}

function Install-IfMissing {
  param(
    [string]   $Label,
    [string]   $Probe,
    [string]   $WingetId,
    [string]   $ChocoPkg,
    [string]   $ScoopPkg,
    [string]   $ScoopBucket,
    [string]   $VersionArgs = "--version"
  )

  if (Test-Cmd $Probe) {
    $v = (& $Probe $VersionArgs 2>&1 | Select-Object -First 1)
    Write-Ok "$Label ja instalado ($v)"
    return
  }

  Write-Warn "$Label ausente. Instalando..."
  Install-Package -WingetId $WingetId -ChocoPkg $ChocoPkg -ScoopPkg $ScoopPkg -ScoopBucket $ScoopBucket
  Start-Sleep -Seconds 2
  Update-SessionPath

  if (Test-Cmd $Probe) {
    Write-Ok "$Label instalado"
  } else {
    Write-Warn "$Label instalado, mas nao visivel no PATH deste terminal."
    Write-Dim "  -> Feche e abra o terminal novamente e rode o script outra vez."
  }
}

function Invoke-Provision {
  if ($SkipProvision) {
    Write-Warn "Provisionamento pulado (-SkipProvision)"
    return
  }

  Write-Title "Provisionamento (bare-metal)"
  if (Test-Admin) { Write-Ok "Executando como Administrador" }
  else { Write-Warn "Sem privilegios de Administrador. Use 'Executar como administrador' para evitar erros de PATH." }

  $script:Spm = Get-SystemPackageManager
  if (-not $script:Spm) {
    Write-Warn "winget/choco/scoop ausentes. Instalando Chocolatey..."
    if (-not (Test-Admin)) {
      Write-Err "Instalar Chocolatey exige Administrador."
      throw "Gerenciador de pacotes indisponivel."
    }
    try {
      [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
      Invoke-Expression ((New-Object Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
      Update-SessionPath
    } catch {
      Write-Err "Falha ao instalar Chocolatey: $_"
      throw "Gerenciador de pacotes indisponivel."
    }
    $script:Spm = Get-SystemPackageManager
    if (-not $script:Spm) {
      Write-Err "Chocolatey instalado, mas nao visivel no PATH. Abra um novo terminal e rode de novo."
      throw "Gerenciador de pacotes indisponivel."
    }
  }
  Write-Info "Gerenciador de pacotes do SO: $($script:Spm)"

  Install-IfMissing -Label "Git" -Probe "git" `
    -WingetId "Git.Git" -ChocoPkg "git" -ScoopPkg "git"

  $javaMajor = [int]$JavaVersion.Split('.')[0]
  $javaCurrent = Get-JavaMajor
  if ((Test-Cmd "javac") -and ($javaCurrent -ne $null) -and ($javaCurrent -ge $javaMajor)) {
    Write-Ok "Java JDK ja instalado (Java $javaCurrent)"
  } else {
    if ($javaCurrent -ne $null) {
      Write-Warn "Java $javaCurrent detectado, mas o projeto exige JDK $javaMajor. Instalando..."
    }
    Install-IfMissing -Label "Java JDK $JavaVersion" -Probe "java" `
      -WingetId "EclipseAdoptium.Temurin.$javaMajor.JDK" `
      -ChocoPkg  "temurin$javaMajor" `
      -ScoopPkg  "temurin$javaMajor-jdk" `
      -ScoopBucket "java" `
      -VersionArgs "-version"
  }

  Install-IfMissing -Label "Node.js LTS" -Probe "node" `
    -WingetId "OpenJS.NodeJS.LTS" -ChocoPkg "nodejs-lts" -ScoopPkg "nodejs-lts"

  # Maven: cada repo usa o wrapper mvnw (backend). Instalado no setup, se necessario.

  if (-not $SkipDatabase) {
    Install-IfMissing -Label "MySQL 8 Server" -Probe "mysql" `
      -WingetId "Oracle.MySQL" -ChocoPkg "mysql" -ScoopPkg "mysql" `
      -VersionArgs "--version"
  } else {
    Write-Dim "MySQL pulado (-SkipDatabase)"
  }
}

# ---------- Clone ----------
function Test-GitHubAccess {
  $env:GIT_TERMINAL_PROMPT = "0"
  git ls-remote "https://github.com/$Org/projeto-ong-amar-backend.git" HEAD 2>&1 | Out-Null
  return ($LASTEXITCODE -eq 0)
}

function Ensure-GitAccess {
  if (Test-GitHubAccess) { return }

  Write-Warn "Acesso ao GitHub necessario (repositorios privados). Configurando GitHub CLI..."
  if (-not (Test-Cmd "gh")) {
    Install-IfMissing -Label "GitHub CLI" -Probe "gh" `
      -WingetId "GitHub.cli" -ChocoPkg "gh" -ScoopPkg "gh"
  }
  if (-not (Test-Cmd "gh")) {
    throw "GitHub CLI indisponivel. Instale manualmente: https://cli.github.com e rode o script de novo."
  }

  gh auth status 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Info "Sera aberto o login do GitHub (fluxo de codigo de dispositivo no navegador)."
    gh auth login --hostname github.com --git-protocol https --web
  }
  gh auth setup-git

  if (-not (Test-GitHubAccess)) {
    throw "Acesso ao GitHub ainda falhou apos autenticacao. Verifique as permissoes do token (escopo 'repo')."
  }
  $env:GIT_TERMINAL_PROMPT = $null
  Write-Ok "Autenticacao GitHub configurada"
}

function Invoke-CloneRepos {
  Write-Title "Clonando repositorios ($Workspace)"
  if (-not (Test-Cmd "git")) { throw "Git ausente no PATH. Reabra o terminal e rode o script de novo." }

  Ensure-GitAccess
  New-Item -ItemType Directory -Force -Path $Workspace | Out-Null

  foreach ($r in $Repos) {
    $dest = Join-Path $Workspace $r.Name
    if (Test-Path $dest) {
      Write-Ok "$($r.Repo) ja clonado ($dest)"
      continue
    }
    Write-Info "Clonando $($r.Repo)..."
    git clone "https://github.com/$Org/$($r.Repo).git" $dest
    if ($LASTEXITCODE -ne 0) { throw "Falha ao clonar $($r.Repo)." }
    Write-Ok "$($r.Repo) clonado"
  }
}

# ---------- Project setup ----------
function Initialize-Env {
  if (-not (Test-Path ".env.example")) {
    Write-Dim ".env.example nao encontrado. Etapa pulada."
    return
  }
  if ((Test-Path ".env") -and -not $ForceEnv) {
    Write-Ok ".env ja existe (preservado). Use -ForceEnv para sobrescrever."
    return
  }
  Copy-Item ".env.example" ".env" -Force
  if ($ForceEnv) { Write-Ok ".env sobrescrito a partir de .env.example" }
  else { Write-Ok ".env criado a partir de .env.example" }
  Write-Dim "Preencha os valores sensiveis no .env antes de executar o projeto."
}

function Invoke-ProjectSetupIn {
  param([string] $Dir, [string] $Label)

  Write-Title "Preparando $Label"
  Push-Location $Dir
  try {
    Initialize-Env

    if (Test-Path "package.json") {
      $pm = if (Test-Cmd "pnpm") { "pnpm" } elseif (Test-Cmd "yarn") { "yarn" } elseif (Test-Cmd "npm") { "npm" } else { $null }
      if (-not $pm) {
        Write-Warn "npm/pnpm/yarn ausente no PATH. Pulando dependencias Node."
        Write-Dim "  -> Abra um novo terminal e rode o script de novo."
      } else {
        Write-Info "Instalando dependencias Node ($pm)"
        & $pm install
        Write-Ok "Dependencias Node instaladas"
      }
    }

    if (Test-Path "pom.xml") {
      $mvnCmd = if (Test-Path ".\mvnw.cmd") { ".\mvnw.cmd" } elseif (Test-Cmd "mvn") { "mvn" } else { $null }
      if (-not $mvnCmd) {
        Write-Warn "Maven ausente no PATH e sem wrapper mvnw. Pulando build Maven."
        Write-Dim "  -> Abra um novo terminal e rode o script de novo."
      } else {
        Write-Info "Baixando dependencias Maven ($mvnCmd)"
        if ($SkipBuild) { & $mvnCmd -q dependency:go-offline } else { & $mvnCmd -q clean package }
        Write-Ok "Projeto Maven pronto"
      }
    }

    if ($SkipBuild) { Write-Warn "Build pulado (-SkipBuild)" }
  } finally {
    Pop-Location
  }
}

# ---------- Main ----------
Write-Host ""
Write-High "PCA SETUP  -  Bootstrap do zero para o Projeto AMAR"
Write-Dim "Sistema Intelligent de Gestao de Doacoes para ONGs (SPTECH)"
Write-Host ""

Invoke-Provision
Invoke-CloneRepos

foreach ($r in $Repos) {
  if ($r.Setup) { Invoke-ProjectSetupIn -Dir (Join-Path $Workspace $r.Name) -Label $r.Name }
}

Write-Title "CONCLUIDO"
Write-Ok "Ambiente pronto."
Write-Info "Backend:  $Workspace\backend   (.\mvnw.cmd spring-boot:run)"
Write-Info "Frontend: $Workspace\frontend  (npm run dev)"
Write-Info "Banco:    $Workspace\banco-de-dados"
Write-Dim "Se acabou de instalar ferramentas, reinicie o terminal para o PATH atualizar."
