import { resolve } from "node:path";
import { copyFileSync, existsSync } from "node:fs";
import { projectRoot, hasEnvExample } from "../utils/project.js";
import { log } from "../utils/format.js";

export async function envCmd(opts = {}) {
  log.title("Variaveis de ambiente");

  const envFile = resolve(projectRoot(), ".env");

  if (!hasEnvExample()) {
    log.warn(".env.example nao encontrado. Etapa pulada.");
    return;
  }

  if (existsSync(envFile) && !opts.force) {
    log.ok(".env ja existe (preservado). Use --force para sobrescrever.");
    return;
  }

  copyFileSync(resolve(projectRoot(), ".env.example"), envFile);
  log.ok(opts.force ? ".env sobrescrito a partir de .env.example" : ".env criado a partir de .env.example");
  log.dim("Preencha os valores sensiveis no .env antes de executar o projeto.");
}
