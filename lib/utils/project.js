import { resolve } from "node:path";
import { cwd } from "node:process";
import { fileExists, readJson } from "./fs.js";
import { has, run } from "./run.js";
import { log } from "./format.js";

export const projectRoot = () => cwd();
export const hasPom = () => fileExists(resolve(projectRoot(), "pom.xml"));
export const hasPkg = () => fileExists(resolve(projectRoot(), "package.json"));
export const hasEnvExample = () => fileExists(resolve(projectRoot(), ".env.example"));
export const hasMavenWrapper = () =>
  fileExists(resolve(projectRoot(), isWinWrap() ? "mvnw.cmd" : "mvnw"));

function isWinWrap() {
  return process.platform === "win32";
}

export function detectProjectType() {
  const types = [];
  if (hasPom()) types.push("maven");
  if (hasPkg()) types.push("node");
  return types;
}

export async function detectNodePackageManager() {
  const pkg = readJson(resolve(projectRoot(), "package.json"));
  const declared = pkg?.packageManager?.split("@")[0];
  if (declared && (await has(declared))) return declared;
  for (const c of ["pnpm", "yarn", "bun", "npm"]) if (await has(c)) return c;
  return "npm";
}

export async function installNodeDeps() {
  const pm = await detectNodePackageManager();
  log.info(`Gerenciador Node: ${pm}`);
  await run(pm, pm === "yarn" ? [] : ["install"], { stdio: "inherit" });
  log.ok("Dependencias Node instaladas");
  return pm;
}

export async function buildMaven({ skipBuild = false } = {}) {
  const cmd = (await hasMavenWrapper()) ? (isWinWrap() ? ".\\mvnw.cmd" : "./mvnw") : "mvn";
  if (skipBuild) {
    log.info(`Baixando dependencias Maven (${cmd})`);
    await run(cmd, ["-q", "dependency:go-offline"], { stdio: "inherit" });
  } else {
    log.info(`Buildando projeto Maven (${cmd})`);
    await run(cmd, ["-q", "clean", "package"], { stdio: "inherit" });
  }
  log.ok("Projeto Maven pronto");
}
