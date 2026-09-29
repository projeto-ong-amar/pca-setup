import inquirer from "inquirer";
import { provisionAll } from "../utils/provisioners.js";
import { log } from "../utils/format.js";

export async function provisionCmd(opts = {}) {
  log.title("Provisionamento (bare-metal)");
  log.dim("Instala Git, Java JDK, Node.js, Maven e MySQL ausentes na maquina.");

  if (!opts.yes) {
    const { go } = await inquirer.prompt([
      {
        type: "confirm",
        name: "go",
        message: "Instalar as ferramentas ausentes no sistema?",
        default: true,
      },
    ]);
    if (!go) {
      log.warn("Provisionamento cancelado.");
      return [];
    }
  }

  const results = await provisionAll({
    java: opts.java,
    database: !opts.skipDatabase,
  });

  log.title("Resumo do provisionamento");
  for (const r of results) {
    if (r.error) log.error(`${r.label}: falhou`);
    else if (r.already) log.dim(`${r.label}: ja estava instalado`);
    else if (r.installed) log.ok(`${r.label}: instalado`);
    else log.warn(`${r.label}: instalado, mas fora do PATH. Reinicie o terminal.`);
  }
  log.info("Reinicie o terminal e rode 'pca-setup check' para confirmar.");
  return results;
}
