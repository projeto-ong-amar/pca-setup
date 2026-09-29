import chalk from "chalk";

export const log = {
  info: (m) => console.log(chalk.cyan(">"), m),
  ok: (m) => console.log(chalk.green("OK"), m),
  warn: (m) => console.log(chalk.yellow("! "), m),
  error: (m) => console.error(chalk.red("X "), m),
  title: (m) => console.log("\n" + chalk.bold.blue(`== ${m} ==`)),
  highlight: (m) => console.log(chalk.bold.magenta(m)),
  dim: (m) => console.log(chalk.dim(m)),
};
