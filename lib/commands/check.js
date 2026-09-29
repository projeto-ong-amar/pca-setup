import { resolve } from "node:path";
import { has, getVersion, javaVersion } from "../utils/run.js";
import { readJson } from "../utils/fs.js";
import { detectProjectType, projectRoot, hasPom, hasPkg, hasMavenWrapper } from "../utils/project.js";
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
  const hasWrapper = hasMavenWrapper();
  // Com o wrapper mvnw versionado, o Maven e baixado pelo proprio projeto.
  const mavenRequired = isMaven && !hasWrapper;
  const missing = [];

  for (const t of TOOLS) {
    const required = t.required || (t.requiredIfMaven && mavenRequired);
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
      if (hasWrapper) log.dim("  wrapper mvnw disponivel - Maven nao precisa ser instalado");
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
