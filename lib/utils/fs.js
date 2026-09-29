import { existsSync, copyFileSync, readFileSync } from "node:fs";

export const fileExists = (p) => existsSync(p);

export const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

export const readText = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};

export function copyIfMissing(src, dest, force = false) {
  if (existsSync(dest) && !force) return false;
  copyFileSync(src, dest);
  return true;
}
