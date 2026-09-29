import { platform } from "node:os";
import { execa } from "execa";
import { has as hasSpm } from "./pkgmgr.js";

export const isWindows = () => platform() === "win32";
export const isMacOS = () => platform() === "darwin";
export const isLinux = () => platform() === "linux";

export async function has(cmd) {
  try {
    if (isWindows()) await execa("where", [cmd], { stdio: "ignore" });
    else await execa("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function run(cmd, args = [], opts = {}) {
  try {
    const res = await execa(cmd, args, {
      stdio: opts.stdio ?? "pipe",
      shell: opts.shell ?? false,
      cwd: opts.cwd,
      env: opts.env,
    });
    return (res.stdout ?? "").toString().trim();
  } catch (err) {
    const msg = err?.stderr || err?.stdout || err?.message || String(err);
    throw new Error(msg.toString().trim());
  }
}

// Ferramentas como `java -version` escrevem em stderr mesmo com exit code 0.
export async function captureOutput(cmd, args = []) {
  try {
    const res = await execa(cmd, args, { stdio: "pipe" });
    const out = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.trim();
    return out || null;
  } catch (err) {
    const msg = `${err?.stdout ?? ""}\n${err?.stderr ?? ""}`.trim() || err?.message;
    return msg ? msg.toString().trim() : null;
  }
}

export async function runShell(cmdline, opts = {}) {
  return run(cmdline, [], { ...opts, shell: true });
}

export async function getVersion(cmd, args = ["--version"]) {
  const out = await captureOutput(cmd, args);
  if (!out) return null;
  return out.split(/\r?\n/)[0].trim() || null;
}

export async function isAdmin() {
  if (isWindows()) {
    try {
      const out = await run(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)",
        ],
        { shell: true }
      );
      return out.toLowerCase() === "true";
    } catch {
      return false;
    }
  }
  return typeof process.getuid === "function" ? process.getuid() === 0 : true;
}

export async function javaVersion() {
  const out = await captureOutput("java", ["-version"]);
  if (!out) return null;
  const match = out.match(/version "([^"]+)"/);
  return match ? match[1] : out.split(/\r?\n/)[0].trim();
}

// "21.0.5" / "1.8.0_471" -> 21 / 8
export async function javaMajorVersion() {
  const v = await javaVersion();
  if (!v) return null;
  const m = v.match(/^(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return Number(m[1]) === 1 ? Number(m[2]) : Number(m[1]);
}

export async function detectSystemPackageManager() {
  return hasSpm();
}
