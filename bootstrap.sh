#!/usr/bin/env bash
# PCA Setup - Bootstrap para Linux, macOS e WSL
# Executa em maquina limpa (sem Git, Java, Node ou Maven instalados).
# Requer apenas bash/curl, que ja vem na maioria das distros.
set -euo pipefail

JAVA_VERSION="21"
SKIP_PROVISION=false
SKIP_BUILD=false
SKIP_DATABASE=false
FORCE_ENV=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --java)          JAVA_VERSION="$2"; shift 2 ;;
    --skip-provision) SKIP_PROVISION=true; shift ;;
    --skip-build)     SKIP_BUILD=true; shift ;;
    --skip-database)  SKIP_DATABASE=true; shift ;;
    --force-env)      FORCE_ENV=true; shift ;;
    -h|--help)
      sed -n '2,6p' "$0"; exit 0 ;;
    *) echo "Opcao desconhecida: $1" >&2; exit 1 ;;
  esac
done

info()   { echo -e "\033[36m> $*\033[0m"; }
ok()     { echo -e "\033[32mOK $*\033[0m"; }
warn()   { echo -e "\033[33m!  $*\033[0m"; }
err()    { echo -e "\033[31mX  $*\033[0m"; }
title()  { echo -e "\n\033[1;34m== $1 ==\033[0m"; }
high()   { echo -e "\033[1;35m$*\033[0m"; }
dim()    { echo -e "\033[2;37m$*\033[0m"; }

has() { command -v "$1" >/dev/null 2>&1; }

# ---------- System package manager ----------
detect_spm() {
  if has brew; then echo "brew"; return; fi
  if has apt-get; then echo "apt"; return; fi
  if has dnf; then echo "dnf"; return; fi
  if has yum; then echo "yum"; return; fi
  if has pacman; then echo "pacman"; return; fi
  if has zypper; then echo "zypper"; return; fi
  if has apk; then echo "apk"; return; fi
  echo "none"
}

spm_install() {
  local pkg="$1"
  case "$SPM" in
    brew)   brew install "$pkg" ;;
    apt)
      sudo DEBIAN_FRONTEND=noninteractive apt-get update -y
      sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "$pkg" ;;
    dnf)    sudo dnf install -y "$pkg" ;;
    yum)    sudo yum install -y "$pkg" ;;
    pacman) sudo pacman -S --noconfirm "$pkg" ;;
    zypper) sudo zypper --non-interactive install "$pkg" ;;
    apk)
      sudo apk update
      sudo apk add --no-cache "$pkg" ;;
    *)      err "Nenhum gerenciador de pacotes encontrado."; exit 1 ;;
  esac
}

# ---------- Provisioning ----------
install_if_missing() {
  local label="$1" probe="$2" pkg="$3"
  if has "$probe"; then
    local v
    v="$("$probe" --version 2>&1 | head -1 || true)"
    ok "$label ja instalado ${v:+($v)}"
    return
  fi
  warn "$label ausente. Instalando..."
  spm_install "$pkg"
  if has "$probe"; then ok "$label instalado"; else warn "$label instalado mas fora do PATH. Reinicie o terminal."; fi
}

java_major() {
  local line
  line="$(java -version 2>&1 | head -1 || true)"
  if [[ "$line" =~ version\ \"([0-9]+)(\.([0-9]+))? ]]; then
    if [[ "${BASH_REMATCH[1]}" == "1" ]]; then echo "${BASH_REMATCH[3]}"
    else echo "${BASH_REMATCH[1]}"; fi
  fi
}

provision() {
  if [[ "$SKIP_PROVISION" == true ]]; then
    warn "Provisionamento pulado (--skip-provision)"
    return
  fi

  title "Provisionamento (bare-metal)"
  if [[ "$(id -u)" == "0" ]]; then ok "Executando como root"
  else warn "Sem root - 'sudo' sera solicitado quando necessario"; fi

  # Ubuntu precisa de curl para chaves
  if [[ "$(detect_spm)" == "apt" ]] && ! has curl; then
    warn "curl ausente (necessario para chaves de repositorio). Instalando curl..."
    sudo DEBIAN_FRONTEND=noninteractive apt-get update -y
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y curl ca-certificates
  fi

  SPM="$(detect_spm)"
  info "Gerenciador de pacotes do SO: $SPM"

  install_if_missing "Git" git git

  local jmajor="${JAVA_VERSION%%.*}"
  local jcurrent
  jcurrent="$(java_major || true)"
  if has javac && [[ -n "$jcurrent" ]] && (( jcurrent >= jmajor )); then
    ok "Java JDK ja instalado (Java $jcurrent)"
  else
    if [[ -n "$jcurrent" ]]; then
      warn "Java $jcurrent detectado, mas o projeto exige JDK $jmajor. Instalando..."
    fi
    install_if_missing "Java JDK $JAVA_VERSION" javac "openjdk-${jmajor}-jdk"
  fi

  install_if_missing "Node.js LTS" node nodejs

  # Maven: o wrapper mvnw do projeto ja traz o Maven proprio.
  if [[ -f ./mvnw || -f ./mvnw.cmd ]]; then
    ok "Maven: wrapper mvnw presente - dispensa instalar o Maven"
  elif has mvn; then
    ok "Maven ja instalado"
  else
    install_if_missing "Maven" mvn maven
  fi

  if [[ "$SKIP_DATABASE" == true ]]; then
    dim "MySQL pulado (--skip-database)"
  else
    install_if_missing "MySQL 8" mysql mysql-server
  fi
}

# ---------- Project setup ----------
init_env() {
  title "Variaveis de ambiente"
  if [[ ! -f .env.example ]]; then dim ".env.example nao encontrado. Etapa pulada."; return; fi
  if [[ -f .env && "$FORCE_ENV" == false ]]; then
    ok ".env ja existe (preservado). Use --force-env para sobrescrever."
    return
  fi
  cp -f .env.example .env
  if [[ "$FORCE_ENV" == true ]]; then ok ".env sobrescrito a partir de .env.example"
  else ok ".env criado a partir de .env.example"; fi
  dim "Preencha os valores sensiveis no .env antes de executar o projeto."
}

project_setup() {
  title "Preparando projeto"
  local has_pom=false has_pkg=false
  [[ -f pom.xml ]]     && has_pom=true
  [[ -f package.json ]] && has_pkg=true

  if [[ "$has_pom" == false && "$has_pkg" == false ]]; then
    warn "pom.xml e package.json nao encontrados."
    info "Execute o bootstrap na RAIZ do projeto (backend, frontend) ou na pasta que os contem."
  fi

  if [[ "$has_pkg" == true ]]; then
    local pm="npm"
    has pnpm && pm="pnpm"
    has yarn && pm="yarn"
    info "Instalando dependencias Node ($pm)"
    if [[ "$pm" == "npm" ]]; then npm install; else "$pm" install; fi
    ok "Dependencias Node instaladas"
  fi

  if [[ "$has_pom" == true ]]; then
    local mvn_cmd="mvn"
    [[ -f ./mvnw ]] && mvn_cmd="./mvnw"
    info "Baixando dependencias Maven ($mvn_cmd)"
    if [[ "$SKIP_BUILD" == true ]]; then
      "$mvn_cmd" -q dependency:go-offline || true
    else
      "$mvn_cmd" -q clean package
    fi
    ok "Projeto Maven pronto"
  fi

  [[ "$SKIP_BUILD" == true ]] && warn "Build pulado (--skip-build)"
  return 0
}

# ---------- Main ----------
echo
high "PCA SETUP  -  Bootstrap do zero para o Projeto AMAR"
dim "Sistema Intelligent de Gestao de Doacoes para ONGs (SPTECH)"
echo

if [[ "$SKIP_PROVISION" == true && ! -f pom.xml && ! -f package.json ]]; then
  err "Nada a fazer: --skip-provision exige rodar dentro do projeto (pom.xml ou package.json)."
  exit 1
fi

provision
init_env
project_setup

title "CONCLUIDO"
ok "Ambiente pronto."
[[ -f pom.xml ]]     && info "Backend:  ./run.ps1   (ou ./mvnw spring-boot:run)"
[[ -f package.json ]] && info "Frontend: npm run dev"
dim "Se acabou de instalar ferramentas, reinicie o terminal para o PATH atualizar."
