#!/usr/bin/env node
/**
 * Añade (o quita con --remove) el hook Stop de org-vault en ~/.claude/settings.json sin tocar el resto.
 * Uso: node install-hook.mjs /ruta/absoluta/remind-session-note.mjs [--remove]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const HOOK_MARK = "remind-session-note.mjs";
const [, , hookScript, flag] = process.argv;
if (!hookScript) {
  console.error("Uso: install-hook.mjs <ruta-al-hook> [--remove]");
  process.exit(1);
}

const settingsFile = path.join(homedir(), ".claude", "settings.json");
let settings = {};
if (existsSync(settingsFile)) {
  try {
    settings = JSON.parse(readFileSync(settingsFile, "utf8"));
  } catch (err) {
    console.error(`No se pudo leer ${settingsFile}: ${err.message}. No se modifica nada.`);
    process.exit(1);
  }
}

settings.hooks ??= {};
settings.hooks.Stop ??= [];
const isOurs = (group) => Array.isArray(group?.hooks) && group.hooks.some((h) => typeof h?.command === "string" && h.command.includes(HOOK_MARK));

if (flag === "--remove") {
  const before = settings.hooks.Stop.length;
  settings.hooks.Stop = settings.hooks.Stop.filter((g) => !isOurs(g));
  if (settings.hooks.Stop.length === 0) delete settings.hooks.Stop;
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + "\n");
  console.log(before === (settings.hooks?.Stop?.length ?? 0) ? "El hook no estaba instalado." : `Hook eliminado de ${settingsFile}`);
  process.exit(0);
}

const command = `node "${path.resolve(hookScript)}"`;
if (settings.hooks.Stop.some(isOurs)) {
  settings.hooks.Stop = settings.hooks.Stop.map((g) =>
    isOurs(g) ? { ...g, hooks: g.hooks.map((h) => (h.command?.includes(HOOK_MARK) ? { ...h, command } : h)) } : g,
  );
  console.log(`Hook ya instalado; ruta actualizada en ${settingsFile}`);
} else {
  settings.hooks.Stop.push({ hooks: [{ type: "command", command, timeout: 10 }] });
  console.log(`Hook Stop instalado en ${settingsFile}`);
}
mkdirSync(path.dirname(settingsFile), { recursive: true });
writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + "\n");
