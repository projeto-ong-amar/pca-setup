#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { checkCmd } from "../lib/commands/check.js";
import { envCmd } from "../lib/commands/env.js";
import { hostingCmd } from "../lib/commands/hosting.js";
import { provisionCmd } from "../lib/commands/provision.js";
import { setupCmd } from "../lib/commands/setup.js";

const here = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(resolve(here, "../package.json"), "utf8"));

const program = new Command()
  .name("pca-setup")
  .description("Bootstrap do zero (bare-metal) para o Projeto AMAR - Windows, Linux e macOS")
  .version(version);

program
  .command("check")
  .description("Verifica pre-requisitos (Git, Java, Node, Maven, MySQL)")
  .action(checkCmd);

program
  .command("provision")
  .description("Instala pre-requisitos ausentes no sistema operacional")
  .option("-y, --yes", "Nao perguntar (modo nao-interativo)")
  .option("--java <version>", "Versao do Java JDK", "21")
  .option("--skip-database", "Nao instala MySQL")
  .action(provisionCmd);

program
  .command("env")
  .description("Cria .env a partir de .env.example")
  .option("--force", "Sobrescreve .env existente")
  .action(envCmd);

program
  .command("hosting")
  .description("Prepara e sobe a stack de hospedagem (MySQL + Spring Boot + nginx) em Docker")
  .option("-y, --yes", "Nao perguntar (modo nao-interativo)")
  .option("--stack <dir>", "Pasta com o docker-compose.yml (padrao: deteccao automatica)")
  .option("--domain <domain>", "Dominio de producao; 'localhost' roda em HTTP sem certificado")
  .option("--email <email>", "E-mail do Let's Encrypt (so com --domain)")
  .option("--skip-provision", "Nao instala nem inicia o Docker")
  .option("--skip-up", "Prepara o .env sem subir os containers")
  .option("--no-build", "Sobe sem reconstruir as imagens")
  .option("--force-env", "Regera o .env da stack")
  .option("--recreate", "Recria os volumes (APAGA o banco de dados)")
  .option("--down", "Derruba a stack em vez de subir")
  .option("--down-volumes", "Com --down, remove tambem os volumes")
  .action(hostingCmd);

program
  .command("setup")
  .description("Bootstrap completo: provisiona o SO e prepara o projeto")
  .option("-y, --yes", "Nao perguntar (modo nao-interativo)")
  .option("--java <version>", "Versao do Java JDK", "21")
  .option("--skip-provision", "Nao instala ferramentas do sistema")
  .option("--skip-database", "Nao instala MySQL")
  .option("--skip-build", "Nao roda build do Maven")
  .option("--force-env", "Sobrescreve .env existente")
  .action(setupCmd);

program.parse();
