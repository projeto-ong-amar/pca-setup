import { platform } from "node:os";
import { has, getVersion, javaVersion, javaMajorVersion, isAdmin } from "./run.js";
import { detectSystemPackageManager, installOnWindows, installOnUnix } from "./pkgmgr.js";
import { log } from "./format.js";

const isWin = () => platform() === "win32";

async function installMissing({ label, probe, wingetId, chocoPkg, scoopPkg, unixPkg, versionArgs }) {
  if (await has(probe)) {
    const v = await getVersion(probe, versionArgs);
    log.ok(`${label} ja instalado${v ? ` (${v})` : ""}`);
    return { installed: true, already: true, label };
  }

  log.warn(`${label} ausente. Instalando...`);
  const spm = await detectSystemPackageManager();
  if (!spm) {
    throw new Error(
      "Nenhum gerenciador de pacotes encontrado. Instale o App Installer (winget) ou Chocolatey."
    );
  }
  log.info(`Usando gerenciador: ${spm}`);

  if (isWin()) installOnWindows(spm, { wingetId, chocoPkg, scoopPkg });
  else installOnUnix(spm, unixPkg);

  const ok = await has(probe);
  if (!ok) {
    log.warn(`${label} instalado mas ainda fora do PATH deste processo.`);
    log.dim("Reinicie o terminal e rode 'pca-setup check' novamente.");
  }
  return { installed: ok, already: false, label };
}

export const ensureGit = () =>
  installMissing({
    label: "Git",
    probe: "git",
    wingetId: "Git.Git",
    chocoPkg: "git",
    scoopPkg: "git",
    unixPkg: "git",
  });

export async function ensureJava(version = "21") {
  const required = Number(String(version).split(".")[0]);
  const current = await javaMajorVersion();

  // JDK so e aceitavel se `javac` existir E a versao for >= a requerida.
  // Um JDK antigo quebraria o build do Spring Boot 4 silenciosamente.
  if ((await has("javac")) && current !== null && current >= required) {
    log.ok(`Java JDK ja instalado (${await javaVersion()})`);
    return { installed: true, already: true, label: `Java JDK ${version}` };
  }

  if (current !== null) {
    log.warn(`Java ${current} detectado, mas o projeto exige JDK ${required}. Instalando...`);
  }

  const major = String(version).split(".")[0];
  const result = await installMissing({
    label: `Java JDK ${version}`,
    probe: "javac",
    versionArgs: ["-version"],
    wingetId: `EclipseAdoptium.Temurin.${major}.JDK`,
    chocoPkg: `temurin${major}`,
    scoopPkg: `temurin${major}-jdk`,
    unixPkg: `openjdk-${major}-jdk`,
  });

  if (!result.already) {
    const v = await javaVersion();
    if (v) log.dim(`  ${v}`);
  }
  return result;
}

export const ensureNode = () =>
  installMissing({
    label: "Node.js LTS",
    probe: "node",
    wingetId: "OpenJS.NodeJS.LTS",
    chocoPkg: "nodejs-lts",
    scoopPkg: "nodejs-lts",
    unixPkg: "nodejs",
  });

export const ensureMaven = () =>
  installMissing({
    label: "Maven",
    probe: "mvn",
    versionArgs: ["-v"],
    wingetId: "Apache.Maven",
    chocoPkg: "maven",
    scoopPkg: "maven",
    unixPkg: "maven",
  });

export const ensureMysql = () =>
  installMissing({
    label: "MySQL",
    probe: "mysql",
    wingetId: "Oracle.MySQL",
    chocoPkg: "mysql",
    scoopPkg: "mysql",
    unixPkg: isWin() ? "mysql-server" : "mysql-server",
  });

export async function provisionAll({ java = "21", database = true } = {}) {
  const results = [];
  if (await isAdmin()) log.ok("Executando com privilegios administrativas");
  else log.warn("Sem privilegios elevados. Algumas instalacoes globais podem falhar.");

  for (const [name, fn] of [
    ["Git", ensureGit],
    ["Java JDK", () => ensureJava(java)],
    ["Node.js", ensureNode],
    ["Maven", ensureMaven],
    ...(database ? [["MySQL", ensureMysql]] : []),
  ]) {
    try {
      results.push(await fn());
    } catch (err) {
      log.error(`${name}: ${err.message}`);
      results.push({ label: name, installed: false, error: err.message });
    }
  }
  return results;
}
