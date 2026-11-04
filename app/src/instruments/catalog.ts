/**
 * Instrumentos disponibles para tocar en Studio.
 *
 * Los códigos FluidR3 de esta lista existen en WAF_VARIANTS y respondieron
 * HTTP 200 con CORS el 31-10-2026. También se comprobaron sus zonas reales:
 * cada suggestedRange cubre 37 notas consecutivas dentro de keyRange y a no
 * más de seis semitonos de la muestra original. El motor valida de nuevo las
 * zonas decodificadas antes de activar un instrumento.
 *
 * Este catálogo no indica que un banco esté descargado o listo para sonar.
 */

export type InstrumentEngineId = "salamander" | "webaudiofont";

export type InstrumentCategory =
  | "Pianos acústicos"
  | "Pianos eléctricos"
  | "Guitarras"
  | "Acordeones"
  | "Cuerdas frotadas"
  | "Vientos"
  | "Percusión afinada";

interface InstrumentBase {
  id: string;
  label: string;
  category: InstrumentCategory;
  sourceCredit: string;
  licenseUrl: string;
  /** False si el núcleo necesario para tocar ya está incluido en la app. */
  requiresNetwork: boolean;
  /** Estado honesto del navegador live; no implica soporte del renderer de proyecto. */
  availability: "local-live" | "network-live";
  /** Capacidad actual dentro de una pista persistente/exportable. */
  projectUse: "project-installed" | "live-only";
  /** Tamaño visible sin inventar bytes que el proveedor remoto no publica aquí. */
  sizeLabel: string;
  /** Ventana de 37 teclas, inclusive, comprobada contra las muestras. */
  suggestedRange: { minMidi: number; maxMidi: number };
}

export type InstrumentDefinition = InstrumentBase &
  (
    | {
        engineId: "salamander";
        source: { kind: "salamander"; voicing: "natural" | "warm" | "bright" | "layered" };
      }
    | {
        engineId: "webaudiofont";
        source: { kind: "waf"; program: number; code: string };
      }
  );

type WafInstrument = Extract<InstrumentDefinition, { engineId: "webaudiofont" }>;

const SALAMANDER_LICENSE_URL = "https://creativecommons.org/licenses/by/3.0/";
const FLUID_LICENSE_URL =
  "https://github.com/musescore/MuseScore/blob/main/share/sound/FluidR3Mono_License.md";
const FLUID_CREDIT =
  "FluidR3 GM · Frank Wen y colaboradores · versión WebAudioFont distribuida por Surikov";

function fluidR3(
  definition: Pick<
    WafInstrument,
    "id" | "label" | "category" | "source" | "suggestedRange"
  >,
): WafInstrument {
  return {
    ...definition,
    engineId: "webaudiofont",
    sourceCredit: FLUID_CREDIT,
    licenseUrl: FLUID_LICENSE_URL,
    requiresNetwork: true,
    availability: "network-live",
    projectUse: "live-only",
    sizeLabel: "Remoto · tamaño depende del preset descargado",
  };
}

export const DEFAULT_INSTRUMENT_ID = "salamander-grand";

export const INSTRUMENTS: readonly InstrumentDefinition[] = [
  {
    id: DEFAULT_INSTRUMENT_ID,
    label: "Salamander Grand · natural",
    category: "Pianos acústicos",
    engineId: "salamander",
    source: { kind: "salamander", voicing: "natural" },
    sourceCredit: "Salamander Grand Piano · Alexander Holm · núcleo local",
    licenseUrl: SALAMANDER_LICENSE_URL,
    requiresNetwork: false,
    availability: "local-live",
    projectUse: "project-installed",
    sizeLabel: "Incluido en la app",
    suggestedRange: { minMidi: 48, maxMidi: 84 },
  },
  {
    id: "salamander-layered",
    label: "Salamander Grand · 4 capas reales",
    category: "Pianos acústicos",
    engineId: "salamander",
    source: { kind: "salamander", voicing: "layered" },
    sourceCredit: "Salamander Grand Piano V3 · Alexander Holm · adaptación de cuatro capas para C3–C6",
    licenseUrl: SALAMANDER_LICENSE_URL,
    requiresNetwork: false,
    availability: "local-live",
    projectUse: "live-only",
    sizeLabel: "Incluido en la app",
    suggestedRange: { minMidi: 48, maxMidi: 84 },
  },
  {
    id: "salamander-warm",
    label: "Salamander Grand · cálido",
    category: "Pianos acústicos",
    engineId: "salamander",
    source: { kind: "salamander", voicing: "warm" },
    sourceCredit: "Salamander Grand Piano · Alexander Holm · mismas muestras, ajuste cálido",
    licenseUrl: SALAMANDER_LICENSE_URL,
    requiresNetwork: false,
    availability: "local-live",
    projectUse: "live-only",
    sizeLabel: "Incluido en la app",
    suggestedRange: { minMidi: 48, maxMidi: 84 },
  },
  {
    id: "salamander-bright",
    label: "Salamander Grand · brillante",
    category: "Pianos acústicos",
    engineId: "salamander",
    source: { kind: "salamander", voicing: "bright" },
    sourceCredit: "Salamander Grand Piano · Alexander Holm · mismas muestras, ajuste brillante",
    licenseUrl: SALAMANDER_LICENSE_URL,
    requiresNetwork: false,
    availability: "local-live",
    projectUse: "live-only",
    sizeLabel: "Incluido en la app",
    suggestedRange: { minMidi: 48, maxMidi: 84 },
  },
  fluidR3({
    id: "fluid-grand",
    label: "Piano de cola GM",
    category: "Pianos acústicos",
    source: { kind: "waf", program: 0, code: "0000_FluidR3_GM_sf2_file" },
    suggestedRange: { minMidi: 48, maxMidi: 84 },
  }),
  fluidR3({
    id: "fluid-bright-grand",
    label: "Piano brillante GM",
    category: "Pianos acústicos",
    source: { kind: "waf", program: 1, code: "0010_FluidR3_GM_sf2_file" },
    suggestedRange: { minMidi: 48, maxMidi: 84 },
  }),
  fluidR3({
    id: "fluid-epiano-1",
    label: "Piano eléctrico 1",
    category: "Pianos eléctricos",
    source: { kind: "waf", program: 4, code: "0040_FluidR3_GM_sf2_file" },
    suggestedRange: { minMidi: 48, maxMidi: 84 },
  }),
  fluidR3({
    id: "fluid-epiano-2",
    label: "Piano eléctrico 2",
    category: "Pianos eléctricos",
    source: { kind: "waf", program: 5, code: "0050_FluidR3_GM_sf2_file" },
    suggestedRange: { minMidi: 54, maxMidi: 90 },
  }),
  fluidR3({
    id: "fluid-nylon-guitar",
    label: "Guitarra acústica de nailon",
    category: "Guitarras",
    source: { kind: "waf", program: 24, code: "0240_FluidR3_GM_sf2_file" },
    suggestedRange: { minMidi: 46, maxMidi: 82 },
  }),
  fluidR3({
    id: "fluid-steel-guitar",
    label: "Guitarra acústica de acero",
    category: "Guitarras",
    source: { kind: "waf", program: 25, code: "0250_FluidR3_GM_sf2_file" },
    suggestedRange: { minMidi: 46, maxMidi: 82 },
  }),
  fluidR3({
    id: "fluid-clean-guitar",
    label: "Guitarra eléctrica limpia",
    category: "Guitarras",
    source: { kind: "waf", program: 27, code: "0270_FluidR3_GM_sf2_file" },
    suggestedRange: { minMidi: 48, maxMidi: 84 },
  }),
  fluidR3({
    id: "fluid-accordion",
    label: "Acordeón",
    category: "Acordeones",
    source: { kind: "waf", program: 21, code: "0210_FluidR3_GM_sf2_file" },
    suggestedRange: { minMidi: 54, maxMidi: 90 },
  }),
  fluidR3({
    id: "fluid-violin",
    label: "Violín",
    category: "Cuerdas frotadas",
    source: { kind: "waf", program: 40, code: "0400_FluidR3_GM_sf2_file" },
    suggestedRange: { minMidi: 55, maxMidi: 91 },
  }),
  fluidR3({
    id: "fluid-flute",
    label: "Flauta",
    category: "Vientos",
    source: { kind: "waf", program: 73, code: "0730_FluidR3_GM_sf2_file" },
    suggestedRange: { minMidi: 60, maxMidi: 96 },
  }),
  fluidR3({
    id: "fluid-marimba",
    label: "Marimba",
    category: "Percusión afinada",
    source: { kind: "waf", program: 12, code: "0120_FluidR3_GM_sf2_file" },
    suggestedRange: { minMidi: 48, maxMidi: 84 },
  }),
  fluidR3({
    id: "fluid-vibraphone",
    label: "Vibráfono",
    category: "Percusión afinada",
    source: { kind: "waf", program: 11, code: "0110_FluidR3_GM_sf2_file" },
    suggestedRange: { minMidi: 57, maxMidi: 93 },
  }),
];

export function getInstrument(id: string): InstrumentDefinition | undefined {
  return INSTRUMENTS.find((instrument) => instrument.id === id);
}
