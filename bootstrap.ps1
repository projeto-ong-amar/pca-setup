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

  switch (script:Spm) {
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

  script:Spm = Get-SystemPackageManager
  if (-not $script:Spm) {
    Write-Err "Nenhum gerenciador de pacotes encontrado."
    Write-Info "Instale o App Installer (winget) pela Microsoft Store e rode novamente."
    Write-Info "Ou instale Chocolatey: Set-ExecutionPolicy RemoteSigned -Scope ProcessCurrentUser"
    Write-Info "    [System.Net.ServicePointManager]::SecurityProtocol = 'TLS12'"
    Write-Info "    iex ((New-Object Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
    throw "Gerenciador de pacotes indisponivel."
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

  # Maven: o wrapper mvnw do projeto ja traz o Maven proprio.
  # O Maven tambem nao existe no repositorio winget - use choco quando necessario.
  if (Test-Path ".\mvnw.cmd") {
    Write-Ok "Maven: wrapper mvnw presente - dispensa instalar o Maven"
  } elseif (Test-Cmd "mvn") {
    Write-Ok "Maven ja instalado"
  } else {
    Write-Warn "Maven ausente e sem wrapper mvnw. Instalando via $($script:Spm)..."
    if ($script:Spm -eq "winget") {
      Write-Warn "O Maven NAO esta disponivel no repositorio winget."
      Write-Info "Instale o Chocolatey: https://chocolatey.org"
      Write-Info "Ou versione o projeto com o wrapper mvnw (recomendado)."
    } else {
      Install-Package -ChocoPkg "maven" -ScoopPkg "maven"
    }
  }

  if (-not $SkipDatabase) {
    Install-IfMissing -Label "MySQL 8 Server" -Probe "mysql" `
      -WingetId "Oracle.MySQL" -ChocoPkg "mysql" -ScoopPkg "mysql" `
      -VersionArgs "--version"
  } else {
    Write-Dim "MySQL pulado (-SkipDatabase)"
  }
}

# ---------- Project setup ----------
function Initialize-Env {
  Write-Title "Variaveis de ambiente"
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

function Invoke-ProjectSetup {
  Write-Title "Preparando projeto"

  $hasPom = Test-Path "pom.xml"
  $hasPkg = Test-Path "package.json"

  if (-not ($hasPom -or $hasPkg)) {
    Write-Warn "pom.xml e package.json nao encontrados."
    Write-Info "Execute o bootstrap na RAIZ do projeto (backend, frontend) ou na pasta que os contem."
  }

  if ($hasPkg) {
    $pm = if (Test-Cmd "pnpm") { "pnpm" } elseif (Test-Cmd "yarn") { "yarn" } else { "npm" }
    Write-Info "Instalando dependencias Node ($pm)"
    if ($pm -eq "npm") { & npm install } else { & $pm install }
    Write-Ok "Dependencias Node instaladas"
  }

  if ($hasPom) {
    $mvnCmd = if (Test-Path ".\mvnw.cmd") { ".\mvnw.cmd" } else { "mvn" }
    Write-Info "Baixando dependencias Maven ($mvnCmd)"
    if ($SkipBuild) { & $mvnCmd -q dependency:go-offline } else { & $mvnCmd -q clean package }
    Write-Ok "Projeto Maven pronto"
  }

  if ($SkipBuild) { Write-Warn "Build pulado (-SkipBuild)" }
}

# ---------- Main ----------
Write-Host ""
Write-High "PCA SETUP  -  Bootstrap do zero para o Projeto AMAR"
Write-Dim "Sistema Intelligent de Gestao de Doacoes para ONGs (SPTECH)"
Write-Host ""

if ($SkipProvision -and -not (Test-Path "pom.xml") -and -not (Test-Path "package.json")) {
  Write-Err "Nada a fazer: -SkipProvision exige rodar dentro do projeto (pom.xml ou package.json)."
  exit 1
}

Invoke-Provision
Initialize-Env
Invoke-ProjectSetup

Write-Title "CONCLUIDO"
Write-Ok "Ambiente pronto."
if (Test-Path "pom.xml")  { Write-Info "Backend:  .\run.ps1   (ou .\mvnw.cmd spring-boot:run)" }
if (Test-Path "package.json") { Write-Info "Frontend: npm run dev" }
Write-Dim "Se acabou de instalar ferramentas, reinicie o terminal para o PATH atualizar."
