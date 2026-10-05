import inquirer from "inquirer";
import { log } from "../utils/format.js";
import { isAdmin } from "../utils/run.js";
import { ensureContainerStack } from "../utils/provisioners.js";
import {
  findStack,
  buildEnv,
  writeEnv,
  readEnvValues,
  compose,
  waitHealthy,
  resolveContainer,
  probe,
  stackBaseUrl,
  isLocalDomain,
  isIpDomain,
  dockerDaemon,
} from "../utils/hosting.js";

const CHECKS = [
  { path: "/api/csrf", label: "API (proxy /api)", required: true },
  { path: "/", label: "Frontend (SPA)", required: true },
  { path: "/redefinir-senha?token=teste", label: "Fallback da SPA", required: true },
  { path: "/api/swagger-ui/index.html", label: "Swagger UI", required: false },
];

async function askTarget(opts) {
  if (opts.domain !== undefined) return { domain: opts.domain, certbotEmail: opts.email ?? "" };

  const { alvo } = await inquirer.prompt([
    {
      type: "list",
      name: "alvo",
      message: "Qual ambiente preparar?",
      choices: [
        { name: "Local (http://localhost, sem certificado)", value: "local" },
        { name: "IP publico de uma VM (ex.: Oracle, sem certificado)", value: "ip" },
        { name: "Producao (dominio real + HTTPS via Let's Encrypt)", value: "prod" },
      ],
      default: "local",
    },
  ]);

  if (alvo === "local") return { domain: "localhost", certbotEmail: "" };

  if (alvo === "ip") {
    const { domain } = await inquirer.prompt([
      {
        type: "input",
        name: "domain",
        message: "IP publico da VM:",
        validate: (v) =>
          /^\d{1,3}(\.\d{1,3}){3}$/.test(v.trim()) || "Informe um IPv4, ex: 138.180.1.9",
      },
    ]);
    return { domain: domain.trim(), certbotEmail: "" };
  }

  const { domain, certbotEmail } = await inquirer.prompt([
    {
      type: "input",
      name: "domain",
      message: "Dominio (ja apontando para o IP publico da VM):",
      validate: (v) => /^[\w.-]+\.[a-z]{2,}$/i.test(v.trim()) || "Dominio invalido (ex: amar.org.br)",
    },
    {
      type: "input",
      name: "certbotEmail",
      message: "E-mail para o Let's Encrypt:",
      validate: (v) => /\S+@\S+\.\S+/.test(v) || "E-mail invalido",
    },
  ]);
  return { domain: domain.trim(), certbotEmail: certbotEmail.trim() };
}

export async function hostingCmd(opts = {}) {
  log.title("Hospedagem (containers)");
  log.dim("Sobe a stack Docker do Projeto AMAR: MySQL + Spring Boot + nginx.");

  let stackDir;
  try {
    stackDir = findStack(opts.stack);
    log.ok(`Stack: ${stackDir}`);
  } catch (err) {
    log.error(err.message);
    return { ok: false, reason: "stack" };
  }

  // --------------------------------------------------- provisionamento
  // O .env e gerado antes de qualquer exigencia de Docker: '--skip-up'
  // serve justamente para preparar o arquivo numa maquina sem container.
  const precisaSubir = !opts.down && !opts.skipUp;
  const precisaProvisionar = precisaSubir && !opts.skipProvision;

  if (opts.skipProvision) {
    log.warn("Provisionamento pulado (--skip-provision)");
  } else if (!precisaSubir) {
    log.dim("Acao sem containers: Docker nao e necessario.");
  } else {
    const daemon = await dockerDaemon();
    if (daemon.running) {
      log.ok(`Docker em execucao (engine ${daemon.version})`);
    } else {
      if (!opts.yes) {
        const { go } = await inquirer.prompt([
          {
            type: "confirm",
            name: "go",
            message: "Docker nao esta pronto. Instalar/configurar agora?",
            default: true,
          },
        ]);
        if (!go) {
          log.warn("Provisionamento cancelado.");
          return { ok: false, reason: "cancelled" };
        }
      }
      try {
        await ensureContainerStack();
      } catch (err) {
        log.error(err.message);
        return { ok: false, reason: "docker" };
      }
    }
  }

  // ------------------------------------------------------------- .env
  let envValues = readEnvValues(stackDir);
  if (!envValues.DOMAIN) {
    const target = await askTarget(opts);
    const content = buildEnv(target);
    const { created } = writeEnv(stackDir, content, { force: opts.forceEnv });
    envValues = readEnvValues(stackDir);
    if (created) {
      if (isLocalDomain(target.domain)) {
        // silencioso: o caso padrao
      } else if (isIpDomain(target.domain)) {
        log.warn("IP publico detectado: a stack vai subir em HTTP, sem HTTPS.");
        log.dim("O certbot nao emite certificado para IP cru (perfil shortlived de");
        log.dim("6 dias, sem --webroot). Para HTTPS real, compre um dominio barato,");
        log.dim("aponte um registro A para este IP e rode com --dominio seu-dominio.");
      } else {
        log.dim("Confira o DNS antes de continuar: o certbot exige que o dominio");
        log.dim("ja resolva para o IP publico da maquina.");
      }
    }
  } else {
    log.ok(".env da stack ja existe (preservado). Use --force-env para regerar.");
  }

  const base = stackBaseUrl(envValues);

  // ------------------------------------------------------------- acoes
  if (precisaSubir) {
    const daemon = await dockerDaemon();
    if (!daemon.running) {
      log.error("Docker nao esta em execucao. Sem ele nao ha como gerenciar a stack.");
      log.dim("No Windows, abra o Docker Desktop e aguarde ficar pronto.");
      return { ok: false, reason: "docker" };
    }
  }

  if (opts.down) {
    log.title(" Derrubando a stack");
    await compose(["down"], stackDir, { stdio: opts.downVolumes ? "inherit" : "ignore" });
    if (opts.downVolumes) {
      log.warn("Volumes removidos: o banco de dados foi apagado.");
    }
    log.ok("Stack derrubada.");
    return { ok: true, action: "down" };
  }

  if (opts.skipUp) {
    log.title("Ambiente pronto (containers nao subidos)");
    log.info(`Aplique com: cd ${stackDir} && docker compose up -d --build`);
    return { ok: true, action: "prepare" };
  }

  // --------------------------------------------------------------- up
  log.title("Subindo a stack");
  const args = ["up", "-d"];
  if (!opts.noBuild) args.push("--build");
  if (opts.recreate) args.push("--renew-anon-volumes");

  if (opts.recreate) {
    log.warn("--recreate apaga os volumes, incluindo o banco de dados.");
  }

  try {
    await compose(args, stackDir);
  } catch {
    log.error("docker compose up falhou.");
    log.info("Diagnostico: docker compose logs --tail=100");
    return { ok: false, reason: "up" };
  }
  log.ok("Containers iniciados.");

  // ---------------------------------------------------------- health
  log.title("Aguardando o backend");
  const alvo = await resolveContainer(stackDir, "backend");
  if (!alvo) {
    log.error("Container do backend nao encontrado em 'docker compose ps'.");
    log.info("Diagnostico: docker compose ps -a");
    return { ok: false, reason: "health" };
  }
  const health = await waitHealthy(alvo, { timeoutMs: 300_000 });
  if (!health.ok) {
    log.error(`Backend nao ficou healthy (estado: ${health.status}).`);
    log.info("Diagnostico: docker compose logs --tail=100 backend");
    return { ok: false, reason: "health" };
  }
  log.ok("Backend healthy");

  // --------------------------------------------------------- endpoints
  log.title("Checando os endpoints");
  let falhas = 0;
  for (const c of CHECKS) {
    const r = await probe(`${base}${c.path}`);
    if (r.ok) {
      log.ok(`${c.label}: ${r.status}`);
    } else {
      falhas++;
      const detalhe = r.error ? ` (${r.error})` : ` (${r.status})`;
      if (c.required) log.error(`${c.label}: falhou${detalhe}`);
      else log.warn(`${c.label}: falhou${detalhe}`);
    }
  }

  // ---------------------------------------------------------- resumo
  log.title("Concluido");
  if (envValues.BOOTSTRAP_ADMIN_EMAIL) {
    log.info(`Login:    ${envValues.BOOTSTRAP_ADMIN_EMAIL}`);
    if (envValues.BOOTSTRAP_ADMIN_SENHA) log.info(`Senha:    ${envValues.BOOTSTRAP_ADMIN_SENHA}`);
    log.dim("  (definida em .env; troque apos o primeiro acesso)");
  }
  log.info(`App:      ${base}`);
  log.info(`Swagger:  ${base}/api/swagger-ui/index.html`);

  if (isLocalDomain(envValues.DOMAIN)) {
    log.dim("Local: HTTP sem certificado, perfil prod com HTTPS desligado pelo .env.");
  } else if (isIpDomain(envValues.DOMAIN)) {
    log.warn("Acesso publico em HTTP: o cadeado do navegador ficara amarelo.");
    log.info("Senhas trafegam em texto puro. Para um trabalho de producao, use HTTPS");
    log.info("com um dominio real. O passo a passo esta em deploy/README.md");
  } else {
    log.dim("Producao: confira o certificado em docker compose logs frontend | grep 'Certificado'.");
  }
  if (!(await isAdmin()) && process.platform === "win32") {
    log.dim("Sem privilegio de administrador: reinstalacoes podem exigir elevation.");
  }

  return { ok: falhas === 0, action: "up", base, falhas };
}
