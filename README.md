<div align="center">

<img src="docs/logo-amar.png" alt="ONG AMAR Logo" width="120">

# PCA Setup

**Bootstrap do zero para o Projeto AMAR.**

Prepara uma maquina limpa — sem Git, Java, Node ou Maven — para rodar o backend e o frontend do sistema.

<img src="https://img.shields.io/badge/Windows-0078D4?style=flat&logo=windows&logoColor=white" alt="Windows">
<img src="https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black" alt="Linux">
<img src="https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white" alt="macOS">
<img src="https://img.shields.io/badge/Java-21-ED8B00?style=flat&logo=openjdk&logoColor=white" alt="Java 21">
<img src="https://img.shields.io/badge/License-MIT-yellow?style=flat" alt="MIT">

</div>

---

Provisionador **bare-metal** que instala todo o toolchain necessario e prepara o projeto automaticamente. Funciona numa maquina recem-formatada: detecta o que falta, instala via gerenciador nativo do sistema operacional, configura as variaveis de ambiente e compila o projeto. Idempotente por design — pode ser executado quantas vezes forem necessarias sem efeitos colaterais.

## Features

| Feature | Description |
|---|---|
| **Bare-Metal** | Roda em maquina limpa, sem nenhum pre-requisito instalado |
| **Zero Dependencia** | `bootstrap.ps1` e `bootstrap.sh` usam apenas Powershell e bash, sem instalar nada antes |
| **Deteccao de SO** | Windows (winget/choco/scoop), Linux (apt/dnf/yum/pacman/zypper/apk) e macOS (brew) |
| **Java JDK 21** | Instala Eclipse Temurin (Windows/macOS) ou OpenJDK (Linux) automaticamente |
| **Gate de Versao do JDK** | Rejeita JDKs antigos em vez de deixar o build do Spring Boot 4 quebrar em silencio |
| **Node.js e Maven** | Instala Node LTS e Maven quando ausentes na maquina |
| **Deteccao de Projeto** | Identifica `pom.xml` (Maven) e `package.json` (Node) na pasta atual |
| **Build Automatico** | Usa o wrapper `mvnw` quando disponivel, com fallback para o `mvn` do sistema |
| **Idempotente** | Nunca sobrescreve `.env` existente sem permissao explicita |
| **Multiplataforma** | Windows, Linux, macOS e WSL com o mesmo comportamento |

## Quick Start

### Pre-requisitos

Nenhum. Em Windows, apenas o Powershell (nativo no sistema). Em Linux/macOS, apenas `bash` e `curl`. O script instala todo o restante.

### Configuracao

Clone o repositorio e execute o bootstrap **na raiz do projeto** que deseja preparar:

```bash
git clone https://github.com/projeto-ong-amar/pca-setup.git
cd pca-setup

# Linux / macOS / WSL
cp bootstrap.sh ~/projeto-ong-amar-backend/ && cd ~/projeto-ong-amar-backend
./bootstrap.sh
```

```powershell
# Windows
Copy-Item .\bootstrap.ps1 C:\projeto-ong-amar-backend\bootstrap.ps1
cd C:\projeto-ong-amar-backend
.\bootstrap.ps1
```

> Se o Powershell bloquear a execucao do script, rode uma unica vez:
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

### Executar

```bash
# Windows — instala o que falta e compila o projeto
.\bootstrap.ps1

# Linux / macOS / WSL
./bootstrap.sh
```

### Opcoes

```powershell
.\bootstrap.ps1 -SkipProvision    # nao instala ferramentas do sistema
.\bootstrap.ps1 -SkipBuild        # baixa deps do Maven sem compilar
.\bootstrap.ps1 -SkipDatabase     # nao instala MySQL
.\bootstrap.ps1 -ForceEnv         # sobrescreve o .env
.\bootstrap.ps1 -JavaVersion 21   # outra versao do JDK
```

```bash
./bootstrap.sh --skip-provision
./bootstrap.sh --skip-build
./bootstrap.sh --skip-database
./bootstrap.sh --force-env
./bootstrap.sh --java 21
```

### CLI Node.js

Disponivel para quem ja tem Node instalado e prefere subcomandos:

```bash
npm install
npm link          # torna 'pca-setup' global
```

## Commands

| Comando | Descricao |
|---|---|
| `pca-setup check` | Verifica pre-requisitos e detecta o tipo de projeto — nao instala nada |
| `pca-setup provision` | Instala Git, Java JDK, Node.js, Maven e MySQL ausentes no sistema |
| `pca-setup env` | Cria `.env` a partir de `.env.example` |
| `pca-setup setup` | Fluxo completo: provisiona o sistema e prepara o projeto |
| `pca-setup setup -y` | Modo nao-interativo (util para CI) |
| `pca-setup setup --skip-provision` | Prepara apenas o projeto, sem tocar no sistema |
| `pca-setup setup --skip-build` | Baixa as dependencias do Maven sem compilar |
| `pca-setup env --force` | Sobrescreve o `.env` existente |

## Architecture

```mermaid
graph TD
    User["Desenvolvedor"] --> Entry

    Entry{"Ponto de entrada"}
    Entry -->|"Windows"| PS1["bootstrap.ps1"]
    Entry -->|"Linux/macOS/WSL"| SH["bootstrap.sh"]
    Entry -->|"Node 18+"| CLI["pca-setup (CLI)"]

    PS1 --> Provision
    SH --> Provision
    CLI --> Provision

    subgraph Provision["Provisionamento (SO)"]
        DetSO["Deteccao de SO"] --> DetPM["Deteccao de gerenciador"]
        DetPM --> Install["Instala ferramentas ausentes"]
    end

    Provision --> Check["check — revalida o ambiente"]
    Check --> DetectProj{"Deteccao de projeto"}

    DetectProj -->|"pom.xml"| Maven["Build Maven (mvnw ou mvn)"]
    DetectProj -->|"package.json"| Node["npm install"]
    DetectProj -->|"nenhum"| Skip["Etapa de projeto pulada"]

    Check --> Env["env — .env.example para .env"]
    Env --> Maven
    Env --> Node

    Maven --> Ready
    Node --> Ready
    Skip --> Ready
    Ready["Ambiente pronto"]
```

### Etapas do Setup

| Etapa | Responsabilidade |
|---|---|
| **Provision** | Detecta o SO e o gerenciador de pacotes, instala Git, Java JDK, Node.js, Maven e MySQL ausentes |
| **Check** | Revalida o ambiente e identifica o tipo de projeto na pasta atual |
| **Env** | Copia `.env.example` para `.env`, preservando o arquivo existente |
| **Deps** | Executa `npm install` (ou pnpm/yarn, conforme `packageManager` declarado) |
| **Build** | Executa `./mvnw clean package`, ou apenas `dependency:go-offline` com `--skip-build` |

### Deteccao de Ferramentas

| Ferramenta | Versao | Windows | Linux | macOS |
|---|---|---|---|---|
| **Git** | latest | winget / choco / scoop | apt / dnf / yum / pacman / zypper / apk | brew |
| **Java JDK** | 21 (Temurin) | `EclipseAdoptium.Temurin.21.JDK` | `openjdk-21-jdk` | `temurin@21` |
| **Node.js** | LTS | `OpenJS.NodeJS.LTS` | `nodejs` | `nodejs` |
| **Maven** | latest | `Apache.Maven` | `maven` | `maven` |
| **MySQL** | 8 | `Oracle.MySQL` | `mysql-server` | `mysql` |

A ordem de preferencia no Windows e `winget` > `choco` > `scoop`. No Linux, o gerenciador e detectado por `apt-get`, `dnf`, `yum`, `pacman`, `zypper` ou `apk`, nessa ordem. O macOS usa `brew`.

### Comportamento do Gate de Versao do JDK

O `check` considera o Java valido apenas quando `javac` existe **e** a versao e maior ou igual a exigida pelo projeto. Sem esse gate, uma maquina com JDK 11 passaria na verificacao e o build do Spring Boot 4 falharia depois, com um erro dificil de interpretar.

| Situacao | Comportamento |
|---|---|
| `javac` ausente | Instala o JDK requerido |
| JDK abaixo da versao requerida | Instala o JDK requerido e mantem o antigo intacto |
| JDK na versao requerida ou superior | Considera o ambiente pronto |
| Apenas JRE (sem `javac`) | Instala o JDK, pois `javac` e obrigatorio para compilar |

## Tech Stack

| Componente | Tecnologia |
|---|---|
| Linguagem | JavaScript (ESM) |
| Runtime | Node.js 18+ (CLI opcional) |
| CLI | Commander 12.1.0 |
| Execucao | Execa 9.5.1 |
| Prompt | Inquirer 12.1.0 |
| Saida colorida | Chalk 5.3.0 |
| Bootstrap Windows | PowerShell 5.1 (sem dependencia) |
| Bootstrap Unix | Bash 4+ (sem dependencia) |
| Gerenciadores | winget, Chocolatey, Scoop, apt, dnf, yum, pacman, zypper, apk, Homebrew |
| Licenca | MIT |

## Project Structure

```
pca-setup/
├── bootstrap.ps1              # Entrada Windows (zero dependencia, PowerShell 5.1+)
├── bootstrap.sh               # Entrada Linux/macOS/WSL (zero dependencia, bash)
├── bin/
│   └── pca-setup.js           # CLI Node.js (check, provision, env, setup)
├── lib/
│   ├── commands/
│   │   ├── check.js           # Verificacao de pre-requisitos e do tipo de projeto
│   │   ├── provision.js       # Orquestracao do provisionamento do sistema
│   │   ├── env.js             # Criacao do .env a partir do .env.example
│   │   └── setup.js           # Fluxo completo (provision + check + env + build)
│   └── utils/
│       ├── format.js          # Saida colorida no console (chalk)
│       ├── fs.js              # Leitura de arquivos e package.json
│       ├── run.js             # Execucao de comandos, deteccao de versoes, stdout+stderr
│       ├── pkgmgr.js          # Deteccao e uso de gerenciadores de pacotes do SO
│       ├── provisioners.js    # Regras de instalacao por ferramenta
│       └── project.js         # Deteccao de projeto e execucao de build
├── package.json               # Manifesto e dependencias da CLI
├── LICENSE
└── README.md
```

## Notas Importantes

- **PATH apos instalar**: ferramentas instaladas durante o processo podem nao aparecer no terminal atual. Reinicie o terminal e rode `check` novamente para confirmar.
- **Privilegios**: no Windows, execute como Administrador para evitar falhas de instalacao global. No Linux/macOS o `sudo` e solicitado automaticamente.
- **JAVA_HOME**: em Linux/macOS o pacote do OpenJDK ja registra o `JAVA_HOME`. No Windows, o Temurin tambem configura `JAVA_HOME` e o PATH.
- **Nao destrutivo**: o script nunca apaga arquivos do projeto. O unico arquivo que pode ser substituido e o `.env`, e apenas com `--force-env` explicito.

## License

MIT
