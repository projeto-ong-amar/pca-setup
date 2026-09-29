<div align="center">

# PCA Setup

**Bootstrap do zero para o Projeto AMAR.**

Prepara uma maquina limpa — sem Git, Java, Node ou Maven — para rodar o backend e o frontend do sistema.

<img src="https://img.shields.io/badge/Windows-0078D4?style=flat&logo=windows&logoColor=white" alt="Windows">
<img src="https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black" alt="Linux">
<img src="https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white" alt="macOS">
<img src="https://img.shields.io/badge/Java-21-ED8B00?style=flat&logo=openjdk&logoColor=white" alt="Java 21">
<img src="https://img.shields.io/badge/Node.js-20-339933?style=flat&logo=nodedotjs&logoColor=white" alt="Node.js">
<img src="https://img.shields.io/badge/License-MIT-yellow?style=flat" alt="MIT">

</div>

---

Bootstrap **bare-metal** que instala todo o toolchain necessario e prepara o projeto. Funciona numa maquina recém-formatada: detecta o que falta, instala via gerenciador nativo do SO, configura as variaveis de ambiente e compila o projeto. Idempotente — pode rodar quantas vezes quiser.

## Features

| Feature | Description |
|---|---|
| **Bare-Metal** | Roda em maquina limpa, sem nenhum pre-requisito instalado |
| **Duas Portas de Entrada** | `bootstrap.ps1` / `bootstrap.sh` (zero dependencia) ou CLI Node.js |
| **Deteccao de SO** | Windows (winget/choco/scoop), Linux (apt/dnf/yum/pacman/zypper/apk), macOS (brew) |
| **Java JDK 21** | Instala Eclipse Temurin (Windows/macOS) ou OpenJDK (Linux) automaticamente |
| **Node.js + Maven** | Instala Node LTS e Maven quando ausentes |
| **Deteccao de Projeto** | Identifica `pom.xml` (Maven) e `package.json` (Node) automaticamente |
| **Build Automatico** | Usa o wrapper `mvnw` quando disponivel, senao o `mvn` do sistema |
| **Idempotente** | Nunca sobrescreve `.env` existente sem permissao explicita |
| **Multiplataforma** | Windows, Linux, macOS e WSL com o mesmo comportamento |

## Quick Start

### Pre-requisitos

Nenhum. Em Windows, apenas o PowerShell (nativo). Em Linux/macOS, apenas `bash` e `curl`.

Clonar o repositorio:

```bash
git clone https://github.com/projeto-ong-amar/pca-setup.git
cd pca-setup
```

### Executar

Rode o bootstrap **na raiz do projeto** que quer preparar (o `projeto-ong-amar-backend`, por exemplo):

```powershell
# Windows
.\bootstrap.ps1
```

```bash
# Linux / macOS / WSL
./bootstrap.sh
```

Se o PowerShell bloquear a execucao do script, rode uma unica vez:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### Opcoes

```powershell
.\bootstrap.ps1 -SkipProvision    # nao instala ferramentas do SO
.\bootstrap.ps1 -SkipBuild        # baixa deps do Maven sem compilar
.\bootstrap.ps1 -SkipDatabase     # nao instala MySQL
.\bootstrap.ps1 -ForceEnv         # sobrescreve o .env
.\bootstrap.ps1 -JavaVersion 21   # escolha outra versao do JDK
```

```bash
./bootstrap.sh --skip-provision
./bootstrap.sh --skip-build
./bootstrap.sh --skip-database
./bootstrap.sh --force-env
./bootstrap.sh --java 21
```

### CLI Node.js (opcional)

Utl se voce ja tem Node instalado e prefere comandos com subcomandos:

```bash
npm install
npm link          # torna 'pca-setup' global

pca-setup check      # so verifica, nao instala nada
pca-setup provision  # so instala ferramentas ausentes
pca-setup env        # so cria o .env
pca-setup setup      # fluxo completo
```

## O que o Setup Faz

| Etapa | Descricao |
|---|---|
| **1. Provision** | Detecta e instala Git, Java JDK, Node.js, Maven e MySQL ausentes |
| **2. Check** | Revalida o ambiente e detecta o tipo de projeto na pasta atual |
| **3. Env** | Copia `.env.example` para `.env` (preserva o existente) |
| **4. Deps Node** | `npm install` (ou pnpm/yarn, se declarados no `packageManager`) |
| **5. Build Maven** | `./mvnw clean package` ou apenas `dependency:go-offline` com `--skip-build` |
| **6. Resumo** | Exibe os comandos `dev` / `run` para subir o projeto |

## Ferramentas Instaladas

| Ferramenta | Versao | Windows | Linux | macOS |
|---|---|---|---|---|
| **Git** | latest | winget / choco / scoop | apt / dnf / yum / pacman / zypper / apk | brew |
| **Java JDK** | 21 (Temurin) | `EclipseAdoptium.Temurin.21.JDK` | `openjdk-21-jdk` | `temurin@21` |
| **Node.js** | LTS | `OpenJS.NodeJS.LTS` | `nodejs` | `nodejs` (brew) |
| **Maven** | latest | `Apache.Maven` | `maven` | `maven` |
| **MySQL** | 8 | `Oracle.MySQL` | `mysql-server` | `mysql` |

A ordem de preferencia no Windows e `winget` > `choco` > `scoop`. No Linux, o gerenciador e detectado por `apt-get`, `dnf`, `yum`, `pacman`, `zypper` ou `apk`, nessa ordem.

## Project Structure

```
pca-setup/
├── bootstrap.ps1              # Entrada principal Windows (zero dependencia)
├── bootstrap.sh               # Entrada principal Linux/macOS/WSL (zero dependencia)
├── bin/
│   └── pca-setup.js           # CLI Node.js (check, provision, env, setup)
├── lib/
│   ├── commands/
│   │   ├── check.js           # Verificacao de pre-requisitos
│   │   ├── provision.js       # Provisionamento do sistema operacional
│   │   ├── env.js             # Criacao do .env
│   │   └── setup.js           # Orquestracao do fluxo completo
│   └── utils/
│       ├── format.js          # Saida colorida no console
│       ├── fs.js              # Leitura de arquivos e package.json
│       ├── run.js             # Execucao de comandos e deteccao de versoes
│       ├── pkgmgr.js          # Deteccao e uso de gerenciadores de pacotes
│       ├── provisioners.js    # Regras de instalacao por ferramenta
│       └── project.js         # Deteccao de projeto e execucao de build
├── package.json
├── LICENSE
└── README.md
```

## Notas Importantes

- **PATH apos instalar**: ferramentas instaladas durante o processo podem nao aparecer no terminal atual. Reinicie o terminal e rode `check` novamente para confirmar.
- **Privilegios**: no Windows, execute como Administrador para evitar falhas de instalacao global. No Linux/macOS o `sudo` e solicitado automaticamente.
- **JAVA_HOME**: em Linux/macOS, o pacote do OpenJDK ja registra o `JAVA_HOME`. No Windows, o Temurin tambem configura `JAVA_HOME` e o PATH.
- **Nao destrutivo**: o script nunca apaga arquivos do projeto. O unico arquivo que pode ser substituido e o `.env`, e apenas com `--force-env` explicito.

## License

MIT
