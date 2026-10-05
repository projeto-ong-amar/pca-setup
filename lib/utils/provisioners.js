import { platform } from "node:os";
import { existsSync } from "node:fs";
import {
  has,
  getVersion,
  javaVersion,
  javaMajorVersion,
  isAdmin,
  captureOutput,
  exitCodeOf,
  run,
} from "./run.js";
import { detectSystemPackageManager, installOnWindows, installOnUnix } from "./pkgmgr.js";
import { hasMavenWrapper } from "./project.js";
import { dockerDaemon, hasComposePlugin } from "./hosting.js";
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

// ---------------------------------------------------------------- hosting

async function powershell(script) {
  return captureOutput("powershell", ["-NoProfile", "-Command", script]);
}

// VT-x desligada na firmware nao tem solucao via script: o usuario precisa
// entrar no BIOS. Detectar antes evita um caminho de 10 minutos que so falha
// no `wsl --install`.
export async function virtualizationFirmwareEnabled() {
  const out = await powershell(
    "(Get-CimInstance Win32_Processor).VirtualizationFirmwareEnabled"
  );
  if (!out) return null;
  return /^true$/i.test(out.trim());
}

// `wsl --status` escreve em UTF-16LE e a mensagem de "nao instalado" e
// localizada, entao so o exit code diz a verdade: 0 quando o WSL responde.
export async function wslInstalled() {
  return (await exitCodeOf("wsl", ["--version"])) === 0;
}

export async function optionalFeatureState(feature) {
  const out = await powershell(
    `(Get-WindowsOptionalFeature -Online -FeatureName '${feature}').State`
  );
  if (!out) return null;
  const t = out.trim();
  if (/Enabled/i.test(t)) return "Enabled";
  if (/Disabled/i.test(t)) return "Disabled";
  return null;
}

export async function rebootPending() {
  for (const key of [
    "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending",
    "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired",
  ]) {
    const out = await powershell(`Test-Path '${key}'`);
    if (/^\$?true$/i.test((out ?? "").trim())) return true;
  }
  return false;
}

// O Hyper-V nao e necessario e nem existe na edicao Home. O WSL2 usa apenas o
// VirtualMachinePlatform, que e o que habilitamos aqui.
const WSL_FEATURES = ["Microsoft-Windows-Subsystem-Linux", "VirtualMachinePlatform"];

export async function ensureWsl2() {
  if (await wslInstalled()) {
    log.ok("WSL2 ja instalado");
    return { installed: true, already: true, label: "WSL2" };
  }

  log.warn("WSL2 ausente. Verificando pre-requisitos...");

  const vt = await virtualizationFirmwareEnabled();
  if (vt === false) {
    throw new Error(
      "Virtualizacao (VT-x) esta DESLIGADA na firmware. Entre no BIOS e ative " +
        "Intel Virtualization Technology / VT-x. Nao ha como contornar por script."
    );
  }
  if (vt === null) log.warn("Nao foi possivel ler o estado da virtualizacao; seguindo.");

  const spm = await detectSystemPackageManager();
  if (!spm) throw new Error("Nenhum gerenciador de pacotes encontrado (winget/choco/scoop).");
  if (!(await isAdmin())) {
    throw new Error(
      "Habilitar o WSL2 exige Administrador. Abra o terminal como Administrador e rode de novo."
    );
  }

  let habilitou = false;
  for (const feature of WSL_FEATURES) {
    const state = await optionalFeatureState(feature);
    if (state === "Enabled") {
      log.ok(`${feature}: ja habilitado`);
    } else {
      log.info(`Habilitando ${feature}...`);
      await powershell(
        `Enable-WindowsOptionalFeature -Online -FeatureName '${feature}' -All -NoRestart`
      );
      log.ok(`${feature}: habilitado`);
      habilitou = true;
    }
  }

  log.info("Instalando o WSL2 (pode demorar)");
  await run("wsl", ["--install", "--no-distribution"], { stdio: "inherit" });

  if (habilitou || (await rebootPending())) {
    throw new Error(
      "REINICIO NECESSARIO: o VirtualMachinePlatform so vale apos reiniciar o Windows. " +
        "Salve seus arquivos e reinicie, depois rode 'pca-setup hosting' de novo."
    );
  }

  log.ok("WSL2 instalado");
  return { installed: true, already: false, label: "WSL2" };
}

export async function ensureDocker() {
  const { cli, version } = await dockerDaemon();
  if (cli && version) {
    log.ok(`Docker ja em execucao (engine ${version})`);
    return { installed: true, already: true, label: "Docker" };
  }

  if (cli) log.warn("Docker CLI presente, mas o daemon nao responde.");
  else log.warn("Docker ausente. Instalando...");

  if (isWin()) {
    if (existsSync("C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe")) {
      log.ok("Docker Desktop instalado. Abrindo...");
      await run(
        "powershell",
        ["-NoProfile", "-Command", "Start-Process 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe'"],
        { stdio: "inherit" }
      );
    } else {
      const spm = await detectSystemPackageManager();
      if (!spm) throw new Error("Nenhum gerenciador de pacotes encontrado (winget/choco/scoop).");
      if (spm === "winget") {
        await run(
          "winget",
          [
            "install",
            "--id",
            "Docker.DockerDesktop",
            "--exact",
            "--source",
            "winget",
            "--silent",
            "--accept-source-agreements",
            "--accept-package-agreements",
          ],
          { stdio: "inherit" }
        );
      } else if (spm === "choco") {
        await installOnWindows("choco", { chocoPkg: "docker-desktop" });
      } else {
        throw new Error(
          "Instale o Docker Desktop pelo winget ou pelo site oficial: " +
            "https://www.docker.com/products/docker-desktop/"
        );
      }
      log.ok("Docker Desktop instalado. Inicie-o e aguarde o icone parar de mostrar 'starting'.");
    }
  } else {
    const spm = await detectSystemPackageManager();
    if (!spm) throw new Error("Nenhum gerenciador de pacotes encontrado.");
    if (spm === "apt") {
      await run(
        "bash",
        [
          "-c",
          "sudo apt-get update -y && sudo apt-get install -y docker.io docker-compose-v2 && sudo usermod -aG docker $USER",
        ],
        { stdio: "inherit" }
      );
      log.warn("Voce entrou no grupo 'docker': abra um novo terminal para o acesso valer.");
    } else {
      await installOnUnix(spm, "docker");
    }
  }

  const after = await dockerDaemon();
  if (!after.running) {
    throw new Error(
      "Docker instalado, mas o daemon nao responde. No Windows, abra o Docker Desktop " +
        "e aguarde ficar pronto antes de rodar novamente."
    );
  }
  log.ok(`Docker em execucao (engine ${after.version})`);
  return { installed: true, already: false, label: "Docker" };
}

export async function ensureComposePlugin() {
  if (await hasComposePlugin()) {
    log.ok("Plugin 'docker compose' disponivel");
    return { installed: true, already: true, label: "docker compose" };
  }
  throw new Error(
    "'docker compose' nao disponivel. No Desktop ele vem junto; no Linux instale " +
      "'docker-compose-plugin' (apt) ou 'docker-compose-plugin' (dnf)."
  );
}

export async function ensureContainerStack() {
  if (isWin()) await ensureWsl2();
  await ensureDocker();
  await ensureComposePlugin();
  return [{ label: "Stack de containers", installed: true, already: true }];
}

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
