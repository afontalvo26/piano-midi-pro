/**
 * gmFamilies — agrupa los 128 programas GM por familia, para el `<select>` del
 * mezclador.
 *
 * La agrupación es la del propio estándar (bancos de 8 programas), así el
 * selector queda navegable ("Metales", "Cuerdas"…) en vez de 128 opciones
 * corridas. Los nombres vienen de `gmLibrary`: acá no hay ninguna tabla nueva.
 */

import { GM_PROGRAM_NAMES, GM_SELECTABLE } from "./gmLibrary";

/** Familias GM por banco, con el rango de programas que cubren. */
const FAMILIES: { label: string; from: number; to: number }[] = [
  { label: "Pianos", from: 0, to: 7 },
  { label: "Percusión cromática", from: 8, to: 15 },
  { label: "Órganos", from: 16, to: 23 },
  { label: "Guitarras", from: 24, to: 31 },
  { label: "Bajos", from: 32, to: 39 },
  { label: "Cuerdas", from: 40, to: 47 },
  { label: "Ensamble", from: 48, to: 55 },
  { label: "Metales", from: 56, to: 63 },
  { label: "Maderas", from: 64, to: 71 },
  { label: "Flautas", from: 72, to: 79 },
  { label: "Solos y sintetizadores", from: 80, to: 87 },
  { label: "Pads y efectos", from: 88, to: 103 },
  { label: "Percusión del mundo", from: 104, to: 111 },
  { label: "Efectos de sonido", from: 112, to: 127 },
];

export interface GmFamilyGroup {
  label: string;
  instruments: string[];
}

/** Agrupa los instrumentos GM por familia, para el `<select>`. */
export function gmFamilyGroups(): GmFamilyGroup[] {
  const groups: GmFamilyGroup[] = FAMILIES.map((family) => ({
    label: family.label,
    instruments: [],
  }));

  GM_PROGRAM_NAMES.forEach((name, program) => {
    const index = FAMILIES.findIndex(
      (family) => program >= family.from && program <= family.to,
    );
    // Un programa fuera de todo rango no se pierde: cae en "Otros". Con la tabla
    // completa del estándar no debería pasar; el guardia está para que un nombre
    // nuevo no desaparezca del selector en silencio.
    if (index === -1) groups.push({ label: "Otros", instruments: [name] });
    else groups[index].instruments.push(name);
  });

  // Sin repetidos: dos programas con el mismo nombre serían dos `<option>` con el
  // mismo valor, y React (con razón) se queja de las keys duplicadas.
  const selectable = new Set(GM_SELECTABLE);
  return groups
    .map((group) => ({
      label: group.label,
      instruments: [...new Set(group.instruments)].filter((name) => selectable.has(name)),
    }))
    .filter((group) => group.instruments.length > 0);
}
