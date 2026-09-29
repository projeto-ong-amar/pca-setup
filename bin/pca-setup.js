#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { checkCmd } from "../lib/commands/check.js";
import { envCmd } from "../lib/commands/env.js";
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
