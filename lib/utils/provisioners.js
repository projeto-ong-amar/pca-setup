import { platform } from "node:os";
import { has, getVersion, javaVersion, javaMajorVersion, isAdmin } from "./run.js";
import { detectSystemPackageManager, installOnWindows, installOnUnix } from "./pkgmgr.js";
import { hasMavenWrapper } from "./project.js";
import { log } from "./format.js";

const isWin = () => platform() === "win32";

async function installMissing({ label, probe, wingetId, chocoPkg, scoopPkg, scoopBucket, unixPkg, versionArgs }) {
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

  if (isWin()) await installOnWindows(spm, { wingetId, chocoPkg, scoopPkg, scoopBucket });
  else await installOnUnix(spm, unixPkg);

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
    scoopBucket: "java",
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

// O Maven NAO existe no repositorio winget (verificado via `winget search`).
// Dois caminhos validos: o wrapper mvnw do proprio projeto, ou choco/apt.
export async function ensureMaven() {
  if (hasMavenWrapper()) {
    log.ok("Maven: wrapper mvnw presente no projeto - dispensa instalar o Maven");
    return { installed: true, already: true, label: "Maven (via mvnw)" };
  }

  if (await has("mvn")) {
    log.ok("Maven ja instalado");
    return { installed: true, already: true, label: "Maven" };
  }

  log.warn("Maven ausente e sem wrapper mvnw. Instalando...");
  const spm = await detectSystemPackageManager();
  if (!spm) throw new Error("Nenhum gerenciador de pacotes encontrado.");

  if (isWin()) {
    if (spm === "choco") await installOnWindows("choco", { chocoPkg: "maven" });
    else if (spm === "scoop") await installOnWindows("scoop", { scoopPkg: "maven" });
    else
      throw new Error(
        "O Maven nao esta disponivel no repositorio winget. Instale o Chocolatey " +
          "(https://chocolatey.org) ou versione o projeto com o wrapper mvnw."
      );
  } else {
    await installOnUnix(spm, "maven");
  }

  const ok = await has("mvn");
  return { installed: ok, already: false, label: "Maven" };
}

export const ensureMysql = () =>
  installMissing({
    label: "MySQL",
    probe: "mysql",
    wingetId: "Oracle.MySQL",
    chocoPkg: "mysql",
    scoopPkg: "mysql",
    unixPkg: "mysql-server",
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
