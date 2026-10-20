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

ORG="projeto-ong-amar"
WORKSPACE="$HOME/projeto-ong-amar"
# nome_local:repo_github:preparar(1/0)
REPOS=(
  "backend:projeto-ong-amar-backend:1"
  "frontend:projeto-ong-amar-frontend:1"
  "banco-de-dados:projeto-ong-amar-banco-de-dados:0"
)

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

  # Maven: cada repo usa o wrapper mvnw (backend). Instalado no setup, se necessario.

  if [[ "$SKIP_DATABASE" == true ]]; then
    dim "MySQL pulado (--skip-database)"
  else
    install_if_missing "MySQL 8" mysql mysql-server
  fi
}

# ---------- Clone ----------
github_access_ok() {
  GIT_TERMINAL_PROMPT=0 git ls-remote "https://github.com/${ORG}/projeto-ong-amar-backend.git" HEAD >/dev/null 2>&1
}

ensure_git_access() {
  github_access_ok && return 0

  warn "Acesso ao GitHub necessario (repositorios privados)."
  if ! has gh; then
    spm_install gh || true
  fi
  if has gh; then
    if ! gh auth status >/dev/null 2>&1; then
      info "Login do GitHub (fluxo de codigo de dispositivo no navegador)..."
      gh auth login --hostname github.com --git-protocol https --web
    fi
    gh auth setup-git
    github_access_ok && { ok "Autenticacao GitHub configurada"; return 0; }
  fi

  warn "GitHub CLI indisponivel ou login falhou. Usando Personal Access Token."
  read -rsp "Token GitHub (PAT com escopo repo): " GH_TOKEN; echo
  git config --global credential.helper store
  printf 'protocol=https\nhost=github.com\nusername=x-access-token\npassword=%s\n' "$GH_TOKEN" | git credential approve
  unset GH_TOKEN
  if ! github_access_ok; then
    err "Acesso ao GitHub falhou. Verifique o token (escopo 'repo')."
    exit 1
  fi
  ok "Credencial GitHub salva (~/.git-credentials)"
}

clone_repos() {
  title "Clonando repositorios ($WORKSPACE)"
  has git || { err "Git ausente no PATH. Reinicie o terminal e rode de novo."; exit 1; }

  ensure_git_access
  mkdir -p "$WORKSPACE"

  local entry local_name repo setup dest
  for entry in "${REPOS[@]}"; do
    IFS=: read -r local_name repo setup <<< "$entry"
    dest="$WORKSPACE/$local_name"
    if [[ -d "$dest" ]]; then
      ok "$repo ja clonado ($dest)"
      continue
    fi
    info "Clonando $repo..."
    if ! git clone "https://github.com/${ORG}/${repo}.git" "$dest"; then
      err "Falha ao clonar $repo."
      exit 1
    fi
    ok "$repo clonado"
  done
}

# ---------- Project setup ----------
init_env() {
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

setup_repo() {
  local dir="$1" label="$2"
  title "Preparando $label"
  (
    cd "$dir"
    init_env

    if [[ -f package.json ]]; then
      local pm="npm"
      has pnpm && pm="pnpm"
      has yarn && pm="yarn"
      if ! has "$pm"; then
        warn "npm/pnpm/yarn ausente no PATH. Pulando dependencias Node."
        dim "  -> Reinicie o terminal e rode o script de novo."
      else
        info "Instalando dependencias Node ($pm)"
        "$pm" install
        ok "Dependencias Node instaladas"
      fi
    fi

    if [[ -f pom.xml ]]; then
      local mvn_cmd=""
      [[ -f ./mvnw ]] && mvn_cmd="./mvnw"
      [[ -z "$mvn_cmd" ]] && has mvn && mvn_cmd="mvn"
      if [[ -z "$mvn_cmd" ]]; then
        warn "Maven ausente no PATH e sem wrapper mvnw. Pulando build Maven."
        dim "  -> Reinicie o terminal e rode o script de novo."
      else
        info "Baixando dependencias Maven ($mvn_cmd)"
        if [[ "$SKIP_BUILD" == true ]]; then
          "$mvn_cmd" -q dependency:go-offline || true
        else
          "$mvn_cmd" -q clean package
        fi
        ok "Projeto Maven pronto"
      fi
    fi

    [[ "$SKIP_BUILD" == true ]] && warn "Build pulado (--skip-build)"
    exit 0
  )
}

# ---------- Main ----------
echo
high "PCA SETUP  -  Bootstrap do zero para o Projeto AMAR"
dim "Sistema Intelligent de Gestao de Doacoes para ONGs (SPTECH)"
echo

provision
clone_repos

local_entry=""
for local_entry in "${REPOS[@]}"; do
  IFS=: read -r _name _repo setup <<< "$local_entry"
  if [[ "$setup" == "1" ]]; then
    setup_repo "$WORKSPACE/$_name" "$_name"
  fi
done

title "CONCLUIDO"
ok "Ambiente pronto."
info "Backend:  $WORKSPACE/backend   (./mvnw spring-boot:run)"
info "Frontend: $WORKSPACE/frontend  (npm run dev)"
info "Banco:    $WORKSPACE/banco-de-dados"
dim "Se acabou de instalar ferramentas, reinicie o terminal para o PATH atualizar."
