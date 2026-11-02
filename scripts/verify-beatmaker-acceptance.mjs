#!/usr/bin/env node
/**
 * Spec-Driven acceptance gate. --check validates evidence structure only.
 * --release also demands all 113 approvals and measured SMK-37 Elite proof.
 *
 * IMPORTANT: No script can certify an unobserved physical audio signal.
 */
import { readFile } from "node:fs/promises";

const groups = {
  PRJ: ["project-storage", 8], ENG: ["audio-engine", 8],
  CLK: ["transport", 8], MID: ["midi-controller", 8],
  ROL: ["piano-roll", 7], DRM: ["drum-machine", 7],
  SMP: ["sampler-808", 7], AUD: ["audio-recording", 7],
  INS: ["instrument-library", 8], ARR: ["arrangement", 7],
  MIX: ["mixer-effects", 7], AUT: ["automation", 7],
  EXP: ["export", 7], UXP: ["studio-experience", 8],
  QLT: ["quality-gates", 9],
};
const release = process.argv.includes("--release");
const ACCEPTABLE_PROOFS = new Set(["unit","browser","production","physical","license"]);
/** Requirements involving actual hardware, sound quality, listening or physical measurements
 * cannot pass using a simulated browser and an arbitrary green screenshot. */
const PHYSICAL_REQUIRED = new Set([
  "ENG-01","ENG-02","ENG-03","ENG-04","ENG-07",
  "MID-01","MID-02","MID-03","MID-04","MID-05","MID-06","MID-07","MID-08",
  "INS-02","INS-06","INS-07",
  "QLT-01","QLT-02","QLT-03","QLT-04","QLT-05","QLT-08",
  "UXP-02","UXP-04",
]);
const LICENSE_REQUIRED = new Set(["INS-03","INS-05","INS-08","DRM-03","SMP-07","QLT-09"]);
function validProof(proof) {
  if(!proof || proof.result!=="pass" || !ACCEPTABLE_PROOFS.has(proof.kind) ||
     typeof proof.commit!=="string" || !/^[a-f0-9]{40}$/.test(proof.commit) ||
     typeof proof.artifact!=="string" || proof.artifact.trim().length<3 ||
     typeof proof.date!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(proof.date))return false;
  // Do not accept impossible dates such as 2026-99-99 or future-dated logs.
  const parsed=new Date(proof.date+"T00:00:00.000Z");
  return !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0,10)===proof.date &&
    parsed.valueOf()<=Date.now();
}
const errors = [];
const entries = new Map();
let expectedTotal = 0;

try {
  const path = ".kiro/specs/beatmaker-studio/acceptance-evidence.json";
  const manifest = JSON.parse(await readFile(path, "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.kind !== "beatmaker-acceptance-evidence" ||
      !Array.isArray(manifest.requirements)) {
    throw new Error("Formato de matriz de aceptación inválido");
  }
  for (const row of manifest.requirements) {
    if (!row || typeof row.id !== "string" || entries.has(row.id)) {
      errors.push("Fila de aceptación duplicada o inválida");
      continue;
    }
    entries.set(row.id, row);
  }
} catch (error) {
  errors.push(String(error));
}
let approved = 0;
for (const [prefix, [moduleName, count]] of Object.entries(groups)) {
  expectedTotal += count;
  const source = await readFile(`.kiro/specs/beatmaker-studio/modules/${moduleName}/requirements.md`, "utf8");
  for (let i = 1; i <= count; i++) {
    const id = `${prefix}-${String(i).padStart(2, "0")}`;
    if (!source.includes(`- ${id} `)) errors.push(`Requisito no encontrado: ${id}`);
    const row = entries.get(id);
    if (!row || row.module !== moduleName ||
        (row.state !== "pending" && row.state !== "approved") ||
        !Array.isArray(row.evidence)) {
      errors.push(`Evidencia estructural inválida para ${id}`);
      continue;
    }
    if (row.state !== "approved") {
      if (release) errors.push(`${id}: sin aceptación`);
      continue;
    }
    approved++;
    const passes=row.evidence.filter(validProof);
    if(!passes.length)errors.push(`${id}: aprobación sin artefacto probado y commit`);
    if(release) {
      const kinds=new Set(passes.map((proof)=>proof.kind));
      if(!kinds.has("unit") && !kinds.has("browser"))
        errors.push(`${id}: falta prueba de contrato/unitario o navegador`);
      if(!kinds.has("production"))
        errors.push(`${id}: falta build/corrido de producción con evidencia`);
      if(PHYSICAL_REQUIRED.has(id) && !kinds.has("physical"))
        errors.push(`${id}: falta ensayo físico asociado al criterio`);
      if(LICENSE_REQUIRED.has(id) && !kinds.has("license"))
        errors.push(`${id}: falta ficha de licencia/origen verificada`);
    }
  }
}
if (entries.size !== expectedTotal || expectedTotal !== 113) {
  errors.push(`Inventario esperado 113, encontrado ${entries.size}`);
}
for (const id of entries.keys()) {
  if (!Object.keys(groups).some((prefix) => id.startsWith(`${prefix}-`))) {
    errors.push(`Requisito desconocido: ${id}`);
  }
}
if (release) {
  try {
    const physical = JSON.parse(await readFile(
      ".kiro/specs/beatmaker-studio/smk37-elite-physical-evidence.json", "utf8"));
    if (physical.device !== "SMK-37 Elite" || physical.status !== "verified" ||
        physical.simulated !== false || physical.measuredNotes !== 37 ||
        physical.completeChordCycles < 2 || physical.unmatchedNoteOffs !== 0 ||
        physical.dropouts !== 0 || physical.pedals?.cc64 !== true ||
        physical.pedals?.cc66 !== true || physical.pedals?.cc67 !== true ||
        !Number.isFinite(physical.latencyMs?.p95) ||
        !Number.isFinite(physical.latencyMs?.p99) ||
        physical.latencyMs.p95 > 25 || physical.latencyMs.p99 > 40 ||
        !/^[a-f0-9]{64}$/.test(physical.audioLoopbackSha256 ?? "") ||
        !/^[a-f0-9]{64}$/.test(physical.midiCaptureSha256 ?? "") ||
        !/^[a-f0-9]{40}$/.test(physical.commit ?? "")) {
      errors.push("SMK-37 Elite: pruebas MIDI/acústicas/cableadas no certificadas");
    }
  } catch (error) { errors.push(`Evidencia física ausente: ${String(error)}`); }
}
console.log(`Spec-Driven: ${entries.size}/113 criterios, ${approved} aprobados con expediente`);
if (errors.length) {
  for (const error of errors) console.error(`FAIL ${error}`);
  process.exitCode = 1;
} else if (release) {
  console.log("PASS RELEASE: todos los criterios con evidencia y validación física Elite");
} else {
  console.log("PASS estructura: NO equivale a certificación de producto");
}
