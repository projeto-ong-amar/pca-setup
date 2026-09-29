import { resolve } from "node:path";
import { has, getVersion, javaVersion } from "../utils/run.js";
import { readJson } from "../utils/fs.js";
import { detectProjectType, projectRoot, hasPom, hasPkg } from "../utils/project.js";
import { log } from "../utils/format.js";

const TOOLS = [
  { label: "Git", probe: "git", required: true },
  { label: "Node.js", probe: "node", required: true },
  { label: "npm", probe: "npm", required: true },
  { label: "pnpm", probe: "pnpm", required: false },
  { label: "Java (java)", probe: "java", required: true },
  { label: "Java JDK (javac)", probe: "javac", required: true },
  { label: "Maven (mvn)", probe: "mvn", required: false, requiredIfMaven: true },
  { label: "MySQL (mysql)", probe: "mysql", required: false },
  { label: "GitHub CLI (gh)", probe: "gh", required: false },
  { label: "Docker", probe: "docker", required: false },
];

export async function checkCmd() {
  log.title("Verificacao de pre-requisitos");

  const isMaven = hasPom();
  const missing = [];

  for (const t of TOOLS) {
    const required = t.required || (t.requiredIfMaven && isMaven);
    if (await has(t.probe)) {
      let v = null;
      if (t.probe === "java" || t.probe === "javac") v = await javaVersion();
      else if (t.probe === "mvn") v = (await getVersion("mvn", ["-v"]))?.split(/\r?\n/)[0] ?? null;
      else if (t.probe !== "docker") v = await getVersion(t.probe);
      log.ok(`${t.label}${v ? `: ${v}` : ""}`);
    } else {
      missing.push(t.label);
      if (required) log.warn(`${t.label}: ausente (obrigatorio)`);
      else log.dim(`${t.label}: ausente (opcional)`);
    }
  }

  log.title("Projeto");
  const types = detectProjectType();
  if (types.length === 0) {
    log.warn("pom.xml e package.json nao encontrados.");
    log.dim("Rode dentro do projeto (backend, frontend) ou na pasta que os contem.");
  } else {
    if (isMaven) {
      log.ok("Projeto Maven detectado (pom.xml)");
      if (await has("mvnw.cmd") || await has("mvnw")) log.dim("  wrapper mvnw disponivel");
    }
    if (hasPkg()) {
      const pkg = readJson(resolve(projectRoot(), "package.json"));
      log.ok(`Projeto Node detectado (${pkg?.name ?? "package.json"})`);
      if (pkg?.scripts?.dev) log.dim(`  dev: ${pkg.scripts.dev}`);
    }
  }

  if (missing.length > 0) {
    log.warn(`${missing.length} ferramenta(s) ausente(s): ${missing.join(", ")}`);
    log.info("Rode 'pca-setup provision' ou 'pca-setup setup' para instalar o que falta.");
  }
  return missing;
}
