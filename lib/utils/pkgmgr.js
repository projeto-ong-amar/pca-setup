import { platform } from "node:os";
import { execa } from "execa";

async function which(cmd) {
  try {
    if (platform() === "win32") await execa("where", [cmd], { stdio: "ignore" });
    else await execa("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function has(cmd) {
  return which(cmd);
}

export async function detectSystemPackageManager() {
  if (platform() === "win32") {
    for (const c of ["winget", "choco", "scoop"]) if (await which(c)) return c;
    return null;
  }
  if (platform() === "darwin") return (await which("brew")) ? "brew" : null;
  for (const c of ["apt-get", "dnf", "yum", "pacman", "zypper", "apk"]) {
    if (await which(c)) return c === "apt-get" ? "apt" : c;
  }
  return null;
}

async function sh(cmdline) {
  await execa(cmdline, { shell: true, stdio: "inherit" });
}

export function installOnWindows(spm, { wingetId, chocoPkg, scoopPkg }) {
  if (spm === "winget")
    return sh(
      `winget install --id ${wingetId} --exact --silent --accept-source-agreements --accept-package-agreements`
    );
  if (spm === "choco") return sh(`choco install ${chocoPkg} -y --no-progress`);
  if (spm === "scoop") return sh(`scoop install ${scoopPkg}`);
  throw new Error(
    "Nenhum gerenciador de pacotes encontrado (winget/choco/scoop). Instale o App Installer ou Chocolatey."
  );
}

export function installOnUnix(spm, pkg) {
  if (spm === "brew") return sh(`brew install ${pkg}`);
  if (spm === "apt")
    return sh(
      `sudo DEBIAN_FRONTEND=noninteractive apt-get update -y && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ${pkg}`
    );
  if (spm === "dnf") return sh(`sudo dnf install -y ${pkg}`);
  if (spm === "yum") return sh(`sudo yum install -y ${pkg}`);
  if (spm === "pacman") return sh(`sudo pacman -S --noconfirm ${pkg}`);
  if (spm === "zypper") return sh(`sudo zypper --non-interactive install ${pkg}`);
  if (spm === "apk") return sh(`sudo apk update && sudo apk add --no-cache ${pkg}`);
  throw new Error(`Gerenciador de pacotes nao suportado: ${spm}`);
}
