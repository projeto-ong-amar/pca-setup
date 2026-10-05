import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { cwd } from "node:process";
import { has, captureOutput, exitCodeOf, isWindows } from "./run.js";
import { log } from "./format.js";

const COMPOSE_FILE = "docker-compose.yml";
const ENV_EXAMPLE = ".env.example";

const CANDIDATOS = [
  // stack dentro do proprio pca-setup
  "stack",
  // stack irmao dos repos do projeto
  "../deploy",
  "deploy",
  // a propria pasta atual
  ".",
];

export function findStack(stackDir) {
  if (stackDir) {
    const abs = resolve(cwd(), stackDir);
    if (!existsSync(join(abs, COMPOSE_FILE))) {
      throw new Error(`docker-compose.yml nao encontrado em ${abs}`);
    }
    return abs;
  }

  for (const rel of CANDIDATOS) {
    const abs = resolve(cwd(), rel);
    if (existsSync(join(abs, COMPOSE_FILE))) return abs;
  }

  throw new Error(
    "Stack de hosting nao encontrada. Use --stack <dir> apontando para a pasta " +
      "que contem o docker-compose.yml."
  );
}

export const stackEnvPath = (dir) => join(dir, ".env");

// O cliente `docker` existe mesmo com o daemon parado, entao checar apenas
// `docker --version` nao diz nada. O que separa CLI de daemon e o exit code
// de `docker version`: o servidor responde ou nao. A mensagem de erro e
// localizada e muda entre versoes, entao nao serve de criterio.
export async function dockerDaemon() {
  if (!(await has("docker"))) return { cli: false, running: false, version: null };
  const out = await captureOutput("docker", ["version", "--format", "{{.Server.Version}}"]);
  const code = await exitCodeOf("docker", ["version", "--format", "{{.Server.Version}}"]);
  const running = code === 0 && !!out;
  return { cli: true, running, version: running ? out.trim() : null };
}

export async function hasComposePlugin() {
  return (await exitCodeOf("docker", ["compose", "version"])) === 0;
}

export function generateSecret(bytes = 32) {
  return randomBytes(bytes).toString("base64");
}

function isLocalDomain(domain) {
  return !domain || ["localhost", "127.0.0.1", "0.0.0.0"].includes(domain);
}

// A Oracle entrega IP cru (ex.: 138.180.1.9), nao um nome de dominio. O
// Let's Encrypt emite certificado para IP, mas so no perfil shortlived
// (6 dias) e apenas via --manual/--standalone: o --webroot do nosso
// entrypoint nao aceita IP. Portanto IP puro roda em HTTP mesmo em
// producao, e o aviso fica gravado no proprio .env.
function isIpDomain(domain) {
  if (!domain) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) return true;
  return domain.includes(":");
}

// O perfil prod do Spring fixa require-https e cookie.secure; quem os desliga
// por env var e o relaxed binding. Sem HTTPS o navegador recusa o cookie de
// sessao (SameSite=Strict) e o usuario fica deslogado a cada chamada.
function resolveAccess(domain) {
  const local = isLocalDomain(domain);
  const ip = !local && isIpDomain(domain);
  const secure = !local && !ip;
  const base = `${secure ? "https" : "http"}://${domain || "localhost"}`;
  return { local, ip, secure, base };
}

export function buildEnv({ domain, certbotEmail, adminEmail, geminiApiKey, mailUser, mailPassword }) {
  const { local, ip, secure, base } = resolveAccess(domain);
  const adminPassword = `Amar@${generateSecret(6).replace(/[^A-Za-z0-9]/g, "x")}`;

  const aviso = local
    ? "# Ambiente local: HTTP, sem dominio, sem certificado."
    : ip
      ? `# IP publico ${domain}: HTTP apenas. O Let's Encrypt so emite certificado para
# IP no perfil shortlived (6 dias) e sem suporte a --webroot. Para HTTPS real,
# aponte um dominio para este IP e rode de novo com --dominio seu-dominio.com.br.`
      : "# Producao: HTTPS com Let's Encrypt.";

  return `# Gerado por 'pca-setup hosting' em ${new Date().toISOString()}
${aviso}
# NAO versione este arquivo.

DOMAIN=${domain || "localhost"}
CERTBOT_EMAIL=${certbotEmail || ""}
FRONTEND_ORIGIN=${base}
PASSWORD_RESET_URL=${base}/redefinir-senha
REQUIRE_HTTPS=${secure ? "true" : "false"}
COOKIE_SECURE=${secure ? "true" : "false"}

MYSQL_ROOT_PASSWORD=${generateSecret(18)}
DB_USER=amar
DB_PASSWORD=${generateSecret(18)}

JWT_SECRET=${generateSecret(48)}
SECURITY_PEPPER=${generateSecret(32)}
JWT_VALIDITY=86400

BOOTSTRAP_ADMIN_ENABLED=true
BOOTSTRAP_ADMIN_NOME=Administrador
BOOTSTRAP_ADMIN_EMAIL=${adminEmail || "admin@amar.local"}
BOOTSTRAP_ADMIN_SENHA=${adminPassword}

GEMINI_API_KEY=${geminiApiKey || ""}
GEMINI_MODEL=gemini-3.6-flash

MAIL_FROM=
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=${mailUser || ""}
MAIL_PASSWORD=${mailPassword || ""}
`;
}

// Mantem a regra de idempotencia do restante do pca-setup: so escreve quando
// nao existe, ou quando --force-env e explicito.
export function writeEnv(stackDir, content, { force = false } = {}) {
  const target = stackEnvPath(stackDir);

  if (existsSync(target) && !force) {
    log.ok(".env da stack ja existe (preservado). Use --force-env para regerar.");
    return { created: false, path: target };
  }

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, { encoding: "utf8", mode: 0o600 });
  log.ok(`${force ? ".env regravado" : ".env criado"}: ${target}`);
  return { created: true, path: target };
}

export function readEnvValues(stackDir) {
  const file = stackEnvPath(stackDir);
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

export function compose(args, stackDir, { stdio = "inherit" } = {}) {
  return run("docker", ["compose", ...args], { cwd: stackDir, stdio });
}

export async function composePs(stackDir) {
  const out = await captureOutput("docker", ["compose", "ps", "--format", "json"], { cwd: stackDir });
  if (!out) return [];
  try {
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // O Compose v2 emite NDJSON (um objeto por linha) quando ha varios
    // containers, e isso quebra um JSON.parse unico.
    return out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .flatMap((l) => {
        try {
          const p = JSON.parse(l);
          return Array.isArray(p) ? p : [p];
        } catch {
          return [];
        }
      });
  }
}

// O Compose nomeia containers como <projeto>-<servico>-<n> e o nome do projeto
// varia com a pasta, o --stack e a versao do Compose. Consultar `compose ps`
// evita fixar um nome que quebraria o `docker inspect`.
export async function resolveContainer(stackDir, service) {
  const out = await captureOutput("docker", ["compose", "ps", "-q", service], { cwd: stackDir });
  const id = (out ?? "").trim().split("\n")[0].trim();
  return id || null;
}

export async function waitHealthy(container, { timeoutMs = 300_000, intervalMs = 5_000 } = {}) {
  const limite = Date.now() + timeoutMs;
  let ultimo = "desconhecido";

  while (Date.now() < limite) {
    const status = await captureOutput("docker", [
      "inspect",
      "--format",
      "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
      container,
    ]);
    ultimo = (status ?? "").trim() || "desconhecido";

    if (ultimo === "healthy") return { ok: true, status: ultimo };
    if (ultimo === "unhealthy" || ultimo === "exited" || ultimo === "dead") {
      return { ok: false, status: ultimo };
    }
    log.dim(`  ${container}: ${ultimo}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return { ok: false, status: ultimo, timeout: true };
}

export async function probe(url, { timeoutMs = 15_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "manual" });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err?.message ?? String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export function stackBaseUrl(envValues) {
  return resolveAccess(envValues.DOMAIN || "localhost").base;
}

export { isLocalDomain, isIpDomain, resolveAccess, isWindows };
