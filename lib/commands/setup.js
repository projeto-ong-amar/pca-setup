import { has } from "../utils/run.js";
import { log } from "../utils/format.js";
import { checkCmd } from "./check.js";
import { envCmd } from "./env.js";
import { provisionCmd } from "./provision.js";
import {
  hasPom,
  hasPkg,
  hasMavenWrapper,
  installNodeDeps,
  buildMaven,
  detectNodePackageManager,
} from "../utils/project.js";

export async function setupCmd(opts = {}) {
  log.title("PCA Setup");
  log.highlight("Bootstrap do zero para o Projeto AMAR");
  log.dim("Sistema Intelligent de Gestao de Doacoes para ONGs (SPTECH)");

  const isMaven = hasPom();
  const isNode = hasPkg();

  if (!isMaven && !isNode) {
    log.warn("pom.xml e package.json nao encontrados.");
    log.info("O provisionamento do SO sera executado, mas a etapa de projeto sera pulada.");
    log.dim("Dica: rode dentro do backend (Maven) ou do frontend (Node).");
  }

  if (opts.skipProvision) {
    log.warn("Provisionamento pulado (--skip-provision)");
  } else {
    await provisionCmd(opts);
  }

  await checkCmd();
  await envCmd({ force: opts.forceEnv });

  log.title("Preparando projeto");
  if (isNode) await installNodeDeps();

  if (isMaven) {
    if (hasMavenWrapper() || (await has("mvn"))) {
      await buildMaven({ skipBuild: opts.skipBuild });
    } else {
      log.warn("Nem mvnw nem mvn disponiveis. Build Maven pulado.");
    }
  }

  log.title("Concluido");
  log.ok("Ambiente pronto.");
  if (isNode) log.info(`Frontend: ${await detectNodePackageManager()} run dev`);
  if (isMaven) log.info("Backend:  .\\run.ps1   (ou .\\mvnw.cmd spring-boot:run)");
  log.dim("Se instalou ferramentas agora, reinicie o terminal para o PATH atualizar.");
}
