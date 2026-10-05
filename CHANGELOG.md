# Changelog

All notable changes to this project will be documented in this file.

Format: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)

## [0.3.0](2026-09-30)

### General

#### Features

- comando `hosting`: prepara e sobe a stack de hospedagem em Docker (MySQL + Spring Boot + nginx)
- provisionamento de WSL2, VirtualMachinePlatform e Docker Desktop no Windows
- verificacao de VT-x na firmware antes de tentar habilitar o WSL2
- geracao de `.env` com segredos aleatorios (JWT, pepper, senhas do banco, admin)
- espera por healthcheck e sonda de endpoints, incluindo o fallback de rota da SPA
- deteccao da stack por `docker-compose.yml`, com override via `--stack`

#### Bug Fixes

- o nome do container do backend estava fixo como `projeto-amar-backend`, mas o Compose cria
  `<projeto>-<servico>-<n>`: o `docker inspect` falhava e o aguardo de health estourava 300s.
  Agora o container e resolvido via `docker compose ps -q`
- `captureOutput` ignorava o terceiro argumento, entao o `{ cwd }` do `compose ps` era descartado
  e o Compose era consultado na pasta errada (agora repassa as opcoes ao execa)
- `compose ps --format json` emite NDJSON com varios containers, o que quebrava um `JSON.parse`
  unico e fazia a lista de containers voltar vazia
- `run` nao era importado em `provisioners.js`, quebrando o `hosting` com `run is not defined`
- deteccao de WSL e do daemon do Docker passou a usar exit code em vez de regex sobre
  texto localizado (o `wsl.exe` ainda emite UTF-16LE, o que corrompia os acentos)
- `captureOutput` remove bytes nulos, evitando que mensagens UTF-16 quebrem as regexes
- `--skip-up` nao exige mais Docker: o `.env` e gerado antes da validacao do daemon

#### Documentation

- README cobre o comando `hosting`, a arquitetura single-domain e a sequencia do Windows


## [0.2.0](2026-09-29)

### General

#### Features

- bootstrap bare-metal para preparar o ambiente do Projeto AMAR

#### Documentation

- alinha README ao padrao do projeto-ong-amar-backend


### Contributors

Thank you to 1 community contributor:

@benogoulart
- docs: alinha README ao padrao do projeto-ong-amar-backend
- feat: bootstrap bare-metal para preparar o ambiente do Projeto AMAR

**Contributors:** @benogoulart
