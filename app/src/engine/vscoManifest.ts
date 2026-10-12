/**
 * vscoManifest — manifiesto de samples REALES del banco VSCO-2-CE (CC0).
 *
 * POR QUÉ EXISTE
 * --------------
 * La app venía sonando con soundfonts GM: una sola muestra por nota, sin capas
 * de velocidad. Este manifiesto reemplaza esa fuente por samples de verdad, con
 * 1–3 capas de intensidad y hasta 2 variantes round-robin por capa, que es lo
 * único que hace que un solo de trompeta o un redoble de caja suenen a algo.
 *
 * FUENTE
 * ------
 * Versilian Studios Chamber Orchestra 2: Community Edition (CC0 / dominio
 * público, se pide crédito a Versilian Studios / Sam Gossner). Los WAV se
 * sirven crudos desde raw.githubusercontent.com con `Access-Control-Allow-Origin: *`,
 * así que se pueden cargar con Tone.ToneAudioBuffer / fetch sin proxy.
 * Cada URL de este archivo fue verificada con un HEAD real (200 + CORS `*`).
 *
 * CÓMO LEER LAS CAPAS
 * -------------------
 * `layers[notaMIDI]` es un arreglo de capas ordenadas de SUAVE a FUERTE:
 * el índice 0 es la capa 1 (vel = 1), el índice 1 la capa 2 (vel = 2) y el
 * índice 2 la capa 3 (vel = 3). Ojo: **no todos los instrumentos tienen 3
 * capas** — las cuerdas solistas y las secciones sólo tienen 2, y el glock,
 * la marimba, el xilófono o el piccolo tienen 1. Un reproductor tiene que
 * mirar `capa.length` (o el campo `vel`) en vez de asumir 3.
 *
 * El campo `vel` viene de la convención de origen:
 *   - `_v1_/_v2_/_v3_` del banco → se conserva el orden relativo de N y, si
 *     hay más de 3 valores (la caja tiene v1,v3,v5,v7,v9), se eligen tres
 *     equiespaciados de suave a fuerte.
 *   - dinámicas escritas (`_pp_`, `_mp_`, `_mf_`, `_f_`, `_ff_`, `_fff_`)
 *     → pp/p = capa 1, mp/mf = capa 2, f/ff/fff = capa 3.
 *
 * El campo `rr` es la variante (1 o 2) dentro de la capa: elegir una al azar
 * por nota repetida evita el efecto "metralleta" en las repeticiones.
 *
 * OJO CON LAS OCTAVAS (esto se midió, no se dedujo)
 * -------------------------------------------------
 * El banco mezcla dos convenciones de nombres y no lo dice en ningún lado:
 *   - Los sets de VSCO 2 (metales, maderas, secciones de cuerdas, percusión
 *     afinada) escriben el do central como `C3`. Medido: `Sum_SHTrumpet_sus_C3`
 *     = 259.76 Hz = C4 = MIDI 60; `LDFlute_susNV_C4` = 523.5 Hz = MIDI 72.
 *   - Los sets heredados de VSCO 1 / Ivy Audio (Harp, Upright Nr1, Solo Violin
 *     "Arco Vib", Tubular Bells) usan notación científica normal. Medido:
 *     `LLVln_ArcoVib_G3_f` = 196.02 Hz = MIDI 55; `KSHarp_C5_mf` = 519.6 Hz = MIDI 72.
 * Las notas de este archivo ya están normalizadas a MIDI estándar (C4 = 60).
 *
 * RECORTES (para que el archivo no sea gigante)
 * ---------------------------------------------
 *   - Piano: sólo C3(48)–C6(84), ~3 octavas alrededor de C4, en vez de las 6
 *     octavas que traen los dos upright. Fuera de ese rango el reproductor
 *     debería estirar la muestra más cercana.
 *   - Se eligió UNA articulación por instrumento, la sostenida/ordinaria
 *     (`sus`, `susNV`, `susvib`, `susLong`, `Arco Vib`): quedan afuera
 *     staccato, pizzicato, tremolo, sordina y rolls.
 *   - Kit de batería: 33 de las notas GM 35–84. El banco no tiene hi-hat,
 *     palmada, timbales, castañuelas ni cajón, así que esas notas no existen acá.
 *
 * ARCHIVO GENERADO — no editar a mano.
 * Regenerar con: `node scripts/gen-vsco-manifest.mjs`
 */

/** Un sample concreto: capa de velocidad (1..3) y variante round-robin (1..2). */
export interface VscoSample { vel: number; rr: number; url: string }

/**
 * Nota MIDI → capas de velocidad → variantes. Ej:
 *   { 60: [ [s(v1,rr1), s(v1,rr2)], [s(v2,rr1)...], [s(v3,rr1)...] ] }
 * (el índice externo es la capa - 1; el interno, las variantes de esa capa)
 */
export type VscoLayers = Record<number, VscoSample[][]>;

export interface VscoInstrument {
  /** Nombre tal como lo pide la app (GM). */
  name: string;
  /** Programa GM al que sirve (0-127). */
  program: number;
  /** Ruta base dentro del repo, para trazabilidad. */
  basePath: string;
  /** Nota MIDI → capas. */
  layers: VscoLayers;
}

export const VSCO_INSTRUMENTS: VscoInstrument[] = [
  {
    name: "Trumpet",
    program: 56,
    basePath: "Brass/Trumpet/sus",
    layers: {
      53: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_F2_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_F2_v3_rr1.wav" },
        ],
      ],
      57: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_A2_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_A2_v3_rr1.wav" },
        ],
      ],
      60: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_C3_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_C3_v3_rr1.wav" },
        ],
      ],
      63: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_D%233_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_D%233_v3_rr1.wav" },
        ],
      ],
      67: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_G3_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_G3_v3_rr1.wav" },
        ],
      ],
      70: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_A%233_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_A%233_v3_rr1.wav" },
        ],
      ],
      74: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_D4_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_D4_v3_rr1.wav" },
        ],
      ],
      77: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_F4_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_F4_v3_rr1.wav" },
        ],
      ],
      81: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_A4_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_A4_v3_rr1.wav" },
        ],
      ],
      84: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_C5_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/sus/Sum_SHTrumpet_sus_C5_v3_rr1.wav" },
        ],
      ],
    },
  },
  {
    name: "Trombone",
    program: 57,
    basePath: "Brass/Tenor Trombone/sus",
    layers: {
      34: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_A%230_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_A%230_v2_1.wav" },
        ],
      ],
      37: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_C%231_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_C%231_v2_1.wav" },
        ],
      ],
      39: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_D%231_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_D%231_v2_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_D%231_v3_1.wav" },
        ],
      ],
      41: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_F1_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_F1_v2_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_F1_v3_1.wav" },
        ],
      ],
      46: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_A%231_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_A%231_v2_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_A%231_v3_1.wav" },
        ],
      ],
      50: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_D2_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_D2_v2_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_D2_v3_1.wav" },
        ],
      ],
      53: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_F2_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_F2_v2_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_F2_v3_1.wav" },
        ],
      ],
      60: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_C3_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_C3_v2_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_C3_v3_1.wav" },
        ],
      ],
      61: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_C%233_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_C%233_v2_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_C%233_v3_1.wav" },
        ],
      ],
      63: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_D%233_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_D%233_v2_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_D%233_v3_1.wav" },
        ],
      ],
      65: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_F3_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_F3_v2_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tenor%20Trombone/sus/tenortbn_sus_F3_v3_1.wav" },
        ],
      ],
    },
  },
  {
    name: "French Horn",
    program: 60,
    basePath: "Brass/F Horn/sus",
    layers: {
      33: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_A0_v1_1.wav" },
        ],
      ],
      36: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_C1_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_C1_v2_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_C1_v3_1.wav" },
        ],
      ],
      39: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_D%231_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_D%231_v2_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_D%231_v3_1.wav" },
        ],
      ],
      43: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_G1_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_G1_v2_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_G1_v3_1.wav" },
        ],
      ],
      46: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_A%231_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_A%231_v2_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_A%231_v3_1.wav" },
        ],
      ],
      50: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_D2_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_D2_v3_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_D2_v4_1.wav" },
        ],
      ],
      53: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_F2_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_F2_v2_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_F2_v3_1.wav" },
        ],
      ],
      57: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_A2_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_A2_v2_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_A2_v3_1.wav" },
        ],
      ],
      60: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_C3_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_C3_v3_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_C3_v4_1.wav" },
        ],
      ],
      74: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_D4_v1_1.wav" },
        ],
      ],
      77: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/F%20Horn/sus/MOHorn_sus_F4_v1_1.wav" },
        ],
      ],
    },
  },
  {
    name: "Tuba",
    program: 58,
    basePath: "Brass/Tuba/sus",
    layers: {
      29: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_F0_v1_rr1_Mid.wav" },
        ],
      ],
      34: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_A%230_v1_rr1_Mid.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_A%230_v2_rr1_Mid.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_A%230_v3_rr1_Mid.wav" },
        ],
      ],
      39: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_D%231_v1_rr1_Mid.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_D%231_v2_rr1_Mid.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_D%231_v3_rr1_Mid.wav" },
        ],
      ],
      41: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_F1_v1_rr1_Mid.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_F1_v2_rr1_Mid.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_F1_v3_rr1_Mid.wav" },
        ],
      ],
      46: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_A%231_v1_rr1_Mid.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_A%231_v2_rr1_Mid.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_A%231_v3_rr1_Mid.wav" },
        ],
      ],
      50: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_D2_v1_rr1_Mid.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_D2_v2_rr1_Mid.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_D2_v3_rr1_Mid.wav" },
        ],
      ],
      53: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_F2_v1_rr1_Mid.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_F2_v2_rr1_Mid.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_F2_v3_rr1_Mid.wav" },
        ],
      ],
      58: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_A%232_v1_rr1_Mid.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_A%232_v2_rr1_Mid.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_A%232_v3_rr1_Mid.wav" },
        ],
      ],
      62: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Tuba/sus/Tuba3_sus_D3_v1_rr1_Mid.wav" },
        ],
      ],
    },
  },
  {
    name: "Flute",
    program: 73,
    basePath: "Woodwinds/Flute/susNV",
    layers: {
      60: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_C3_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_C3_v3_1.wav" },
        ],
      ],
      64: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_E3_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_E3_v3_1.wav" },
        ],
      ],
      69: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_A3_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_A3_v3_1.wav" },
        ],
      ],
      72: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_C4_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_C4_v3_1.wav" },
        ],
      ],
      76: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_E4_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_E4_v3_1.wav" },
        ],
      ],
      81: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_A4_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_A4_v3_1.wav" },
        ],
      ],
      84: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_C5_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_C5_v2_1.wav" },
        ],
      ],
      88: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_E5_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_E5_v2_1.wav" },
        ],
      ],
      93: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_A5_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_A5_v3_1.wav" },
        ],
      ],
      96: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Flute/susNV/LDFlute_susNV_C6_v1_1.wav" },
        ],
      ],
    },
  },
  {
    name: "Clarinet",
    program: 71,
    basePath: "Woodwinds/Clarinet/susLong",
    layers: {
      50: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_D2_v1_rr1_sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_D2_v2_rr1_sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_D2_v3_rr1_sum.wav" },
        ],
      ],
      53: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_F2_v1_rr1_sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_F2_v2_rr1_sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_F2_v3_rr1_sum.wav" },
        ],
      ],
      58: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_A%232_v1_rr1_sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_A%232_v2_rr1_sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_A%232_v3_rr1_sum.wav" },
        ],
      ],
      62: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_D3_v1_rr1_sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_D3_v2_rr1_sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_D3_v3_rr1_sum.wav" },
        ],
      ],
      65: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_F3_v1_rr1_sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_F3_v2_rr1_sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_F3_v3_rr1_sum.wav" },
        ],
      ],
      70: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_A%233_v1_rr1_sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_A%233_v2_rr1_sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_A%233_v3_rr1_sum.wav" },
        ],
      ],
      74: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_D4_v1_rr1_sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_D4_v2_rr1_sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_D4_v3_rr1_sum.wav" },
        ],
      ],
      77: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_F4_v1_rr1_sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_F4_v2_rr1_sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_F4_v3_rr1_sum.wav" },
        ],
      ],
      82: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_A%234_v1_rr1_sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_A%234_v2_rr1_sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_A%234_v3_rr1_sum.wav" },
        ],
      ],
      86: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_D5_v1_rr1_sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_D5_v2_rr1_sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_D5_v3_rr1_sum.wav" },
        ],
      ],
      90: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_F%235_v1_rr1_sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_F%235_v2_rr1_sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_F%235_v3_rr1_sum.wav" },
        ],
      ],
    },
  },
  {
    name: "Oboe",
    program: 68,
    basePath: "Woodwinds/Oboe/Sus",
    layers: {
      58: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Oboe/Sus/Oboe_Sus_A%232_v1_Main.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Oboe/Sus/Oboe_Sus_A%232_v3_Main.wav" },
        ],
      ],
      62: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Oboe/Sus/Oboe_Sus_D3_v1_Main.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Oboe/Sus/Oboe_Sus_D3_v3_Main.wav" },
        ],
      ],
      65: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Oboe/Sus/Oboe_Sus_F3_v1_Main.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Oboe/Sus/Oboe_Sus_F3_v3_Main.wav" },
        ],
      ],
      70: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Oboe/Sus/Oboe_Sus_A%233_v1_Main.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Oboe/Sus/Oboe_Sus_A%233_v3_Main.wav" },
        ],
      ],
      74: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Oboe/Sus/Oboe_Sus_D4_v1_Main.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Oboe/Sus/Oboe_Sus_D4_v3_Main.wav" },
        ],
      ],
      77: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Oboe/Sus/Oboe_Sus_F4_v1_Main.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Oboe/Sus/Oboe_Sus_F4_v3_Main.wav" },
        ],
      ],
      82: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Oboe/Sus/Oboe_Sus_A%234_v1_Main.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Oboe/Sus/Oboe_Sus_A%234_v3_Main.wav" },
        ],
      ],
      86: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Oboe/Sus/Oboe_Sus_D5_v1_Main.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Oboe/Sus/Oboe_Sus_D5_v3_Main.wav" },
        ],
      ],
      89: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Oboe/Sus/Oboe_Sus_F5_v1_Main.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Oboe/Sus/Oboe_Sus_F5_v3_Main.wav" },
        ],
      ],
    },
  },
  {
    name: "Bassoon",
    program: 70,
    basePath: "Woodwinds/Bassoon/sus",
    layers: {
      34: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_A%230_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_A%230_v2_1.wav" },
        ],
      ],
      37: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_C%231_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_C%231_v2_1.wav" },
        ],
      ],
      41: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_F1_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_F1_v2_1.wav" },
        ],
      ],
      45: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_A1_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_A1_v2_1.wav" },
        ],
      ],
      46: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_A%231_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_A%231_v2_1.wav" },
        ],
      ],
      48: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_C2_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_C2_v2_1.wav" },
        ],
      ],
      55: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_G2_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_G2_v2_1.wav" },
        ],
      ],
      60: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_C3_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_C3_v2_1.wav" },
        ],
      ],
      63: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_D%233_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_D%233_v2_1.wav" },
        ],
      ],
      68: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_G%233_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_G%233_v2_1.wav" },
        ],
      ],
      69: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_A3_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_A3_v2_1.wav" },
        ],
      ],
      72: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_C4_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_C4_v2_1.wav" },
        ],
      ],
      75: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Bassoon/sus/PSBassoon_D%234_v2_1.wav" },
        ],
      ],
    },
  },
  {
    name: "Piccolo",
    program: 72,
    basePath: "Woodwinds/Piccolo/Sus",
    layers: {
      79: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Piccolo/Sus/piccolo_G4_sustain1.wav" },
        ],
      ],
      84: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Piccolo/Sus/piccolo_C5_sustain1.wav" },
        ],
      ],
      91: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Piccolo/Sus/piccolo_G5_sustain1.wav" },
        ],
      ],
      96: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Piccolo/Sus/piccolo_C6_sustain1.wav" },
        ],
      ],
      103: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Piccolo/Sus/piccolo_G6_sustain1.wav" },
        ],
      ],
    },
  },
  {
    name: "Violin",
    program: 40,
    basePath: "Strings/Solo Violin/Arco Vib",
    layers: {
      55: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_G3_p.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_G3_f.wav" },
        ],
      ],
      57: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_A3_p.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_A3_f.wav" },
        ],
      ],
      60: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_C4_p.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_C4_f.wav" },
        ],
      ],
      64: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_E4_p.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_E4_f.wav" },
        ],
      ],
      67: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_G4_p.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_G4_f.wav" },
        ],
      ],
      69: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_A4_p.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_A4_f.wav" },
        ],
      ],
      72: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_C5_p.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_C5_f.wav" },
        ],
      ],
      76: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_E5_p.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_E5_f.wav" },
        ],
      ],
      79: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_G5_p.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_G5_f.wav" },
        ],
      ],
      81: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_A5_p.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_A5_f.wav" },
        ],
      ],
      84: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_C6_p.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_C6_f.wav" },
        ],
      ],
      88: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_E6_p.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_E6_f.wav" },
        ],
      ],
      91: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_G6_p.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_G6_f.wav" },
        ],
      ],
      93: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_A6_p.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_A6_f.wav" },
        ],
      ],
      96: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_C7_p.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_C7_f.wav" },
        ],
      ],
    },
  },
  {
    name: "Viola",
    program: 41,
    basePath: "Strings/Viola Section/susvib",
    layers: {
      48: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_C2_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_C2_v2_1.wav" },
        ],
      ],
      50: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_D2_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_D2_v2_1.wav" },
        ],
      ],
      52: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_E2_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_E2_v2_1.wav" },
        ],
      ],
      55: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_G2_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_G2_v2_1.wav" },
        ],
      ],
      59: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_B2_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_B2_v2_1.wav" },
        ],
      ],
      62: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_D3_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_D3_v2_1.wav" },
        ],
      ],
      65: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_F3_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_F3_v2_1.wav" },
        ],
      ],
      69: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_A3_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_A3_v2_1.wav" },
        ],
      ],
      72: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_C4_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_C4_v2_1.wav" },
        ],
      ],
      76: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_E4_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_E4_v2_1.wav" },
        ],
      ],
      79: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_G4_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_G4_v2_1.wav" },
        ],
      ],
      83: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_B4_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_B4_v2_1.wav" },
        ],
      ],
      86: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_D5_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Viola%20Section/susvib/ViolaEns_susvib_D5_v2_1.wav" },
        ],
      ],
    },
  },
  {
    name: "Cello",
    program: 42,
    basePath: "Strings/Cello Section/susvib",
    layers: {
      36: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_C1_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_C1_v3_1.wav" },
        ],
      ],
      40: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_E1_v1_1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_E1_v1_2.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_E1_v3_1.wav" },
        ],
      ],
      43: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_G1_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_G1_v3_1.wav" },
        ],
      ],
      47: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_B1_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_B1_v3_1.wav" },
        ],
      ],
      50: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_D2_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_D2_v3_1.wav" },
        ],
      ],
      53: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_F2_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_F2_v3_1.wav" },
        ],
      ],
      57: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_A2_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_A2_v3_1.wav" },
        ],
      ],
      60: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_C3_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_C3_v3_1.wav" },
        ],
      ],
      64: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_E3_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_E3_v3_1.wav" },
        ],
      ],
      67: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_G3_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_G3_v3_1.wav" },
        ],
      ],
      71: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_B3_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_B3_v3_1.wav" },
        ],
      ],
      74: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_D4_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_D4_v3_1.wav" },
        ],
      ],
      77: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_F4_v1_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_F4_v3_1.wav" },
        ],
      ],
    },
  },
  {
    name: "Contrabass",
    program: 43,
    basePath: "Strings/Solo Contrabass/SusNV",
    layers: {
      28: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_E0_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_E0_v3_rr1.wav" },
        ],
      ],
      30: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_F%230_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_F%230_v3_rr1.wav" },
        ],
      ],
      31: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_G0_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_G0_v3_rr1.wav" },
        ],
      ],
      34: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_A%230_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_A%230_v3_rr1.wav" },
        ],
      ],
      36: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_C1_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_C1_v3_rr1.wav" },
        ],
      ],
      38: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_D1_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_D1_v3_rr1.wav" },
        ],
      ],
      40: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_E1_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_E1_v3_rr1.wav" },
        ],
      ],
      42: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_F%231_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_F%231_v3_rr1.wav" },
        ],
      ],
      44: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_G%231_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_G%231_v3_rr1.wav" },
        ],
      ],
      45: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_A1_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_A1_v3_rr1.wav" },
        ],
      ],
      49: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_C%232_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_C%232_v3_rr1.wav" },
        ],
      ],
      52: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_E2_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_E2_v3_rr1.wav" },
        ],
      ],
      56: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_G%232_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_G%232_v3_rr1.wav" },
        ],
      ],
      59: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_B2_v1_rr1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_B2_v3_rr1.wav" },
        ],
      ],
    },
  },
  {
    name: "String Ensemble 1",
    program: 48,
    basePath: "Strings/Violin Section/susVib",
    layers: {
      55: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_G2_v1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_G2_v2.wav" },
        ],
      ],
      57: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_A2_v1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_A2_v2.wav" },
        ],
      ],
      59: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_B2_v1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_B2_v2.wav" },
        ],
      ],
      62: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_D3_v1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_D3_v2.wav" },
        ],
      ],
      66: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_F%233_v1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_F%233_v2.wav" },
        ],
      ],
      69: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_A3_v1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_A3_v2.wav" },
        ],
      ],
      72: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_C4_v1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_C4_v2.wav" },
        ],
      ],
      76: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_E4_v1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_E4_v2.wav" },
        ],
      ],
      79: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_G4_v1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_G4_v2.wav" },
        ],
      ],
      83: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_B4_v1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_B4_v2.wav" },
        ],
      ],
      86: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_D5_v1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Violin%20Section/susVib/VlnEns_susVib_D5_v2.wav" },
        ],
      ],
    },
  },
  {
    name: "Orchestral Harp",
    program: 46,
    basePath: "Strings/Harp",
    layers: {
      28: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_E1_f.wav" },
        ],
      ],
      31: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_G1_mp.wav" },
        ],
      ],
      35: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_B1_mf.wav" },
        ],
      ],
      38: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_D2_mf.wav" },
        ],
      ],
      41: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_F2_mf.wav" },
        ],
      ],
      45: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_A2_mf.wav" },
        ],
      ],
      48: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_C3_mf.wav" },
        ],
      ],
      52: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_E3_mf.wav" },
        ],
      ],
      55: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_G3_mf.wav" },
        ],
      ],
      59: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_B3_mf.wav" },
        ],
      ],
      62: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_D4_mf.wav" },
        ],
      ],
      65: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_F4_mf.wav" },
        ],
      ],
      69: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_A4_mf.wav" },
        ],
      ],
      72: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_C5_mf.wav" },
        ],
      ],
      76: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_E5_mf.wav" },
        ],
      ],
      79: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_G5_mf.wav" },
        ],
      ],
      83: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_B5_mf.wav" },
        ],
      ],
      86: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_D6_mf.wav" },
        ],
      ],
      89: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_F6_mf.wav" },
        ],
      ],
      93: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_A6_mf.wav" },
        ],
      ],
      95: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_B6_mf.wav" },
        ],
      ],
      98: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_D7_f.wav" },
        ],
      ],
      101: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_F7_f.wav" },
        ],
      ],
    },
  },
  {
    name: "Acoustic Grand Piano",
    program: 0,
    basePath: "Keys/Upright Nr1",
    layers: {
      48: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C3_pp_RR1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C3_pp_RR2.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C3_mf_RR1.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C3_mf_RR2.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C3_f_RR1.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C3_f_RR2.wav" },
        ],
      ],
      55: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G3_pp_RR1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G3_pp_RR2.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G3_mf_RR1.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G3_mf_RR2.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G3_f_RR1.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G3_f_RR2.wav" },
        ],
      ],
      60: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C4_pp_RR1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C4_pp_RR2.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C4_mf_RR1.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C4_mf_RR2.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C4_f_RR1.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C4_f_RR2.wav" },
        ],
      ],
      67: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G4_pp_RR1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G4_pp_RR2.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G4_mf_RR1.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G4_mf_RR2.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G4_f_RR1.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G4_f_RR2.wav" },
        ],
      ],
      72: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C5_pp_RR1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C5_pp_RR2.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C5_mf_RR1.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C5_mf_RR2.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C5_f_RR1.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C5_f_RR2.wav" },
        ],
      ],
      79: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G5_pp_RR1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G5_pp_RR2.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G5_mf_RR1.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G5_mf_RR2.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G5_f_RR1.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G5_f_RR2.wav" },
        ],
      ],
      84: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C6_pp_RR1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C6_pp_RR2.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C6_mf_RR1.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C6_mf_RR2.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C6_f_RR1.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C6_f_RR2.wav" },
        ],
      ],
    },
  },
  {
    name: "Upright Piano",
    program: 0,
    basePath: "Keys/Upright Piano",
    layers: {
      49: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn1_rr1_014.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn2_rr1_014.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn3_rr1_014.wav" },
        ],
      ],
      53: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn1_rr1_016.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn2_rr1_016.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn3_rr1_016.wav" },
        ],
      ],
      57: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn1_rr1_018.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn2_rr1_018.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn3_rr1_018.wav" },
        ],
      ],
      61: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn1_rr1_020.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn2_rr1_020.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn3_rr1_020.wav" },
        ],
      ],
      65: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn1_rr1_022.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn2_rr1_022.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn3_rr1_022.wav" },
        ],
      ],
      69: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn1_rr1_024.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn2_rr1_024.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn3_rr1_024.wav" },
        ],
      ],
      73: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn1_rr1_026.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn2_rr1_026.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn3_rr1_026.wav" },
        ],
      ],
      77: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn1_rr1_028.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn2_rr1_028.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn3_rr1_028.wav" },
        ],
      ],
      81: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn1_rr1_030.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn2_rr1_030.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Piano/Player_dyn3_rr1_030.wav" },
        ],
      ],
    },
  },
  {
    name: "Glockenspiel",
    program: 9,
    basePath: "Percussion/Glock",
    layers: {
      79: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Glock/glock_medium_G4.wav" },
        ],
      ],
      84: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Glock/glock_medium_C5.wav" },
        ],
      ],
      91: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Glock/glock_medium_G5.wav" },
        ],
      ],
      96: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Glock/glock_medium_C6.wav" },
        ],
      ],
      103: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Glock/glock_medium_G6.wav" },
        ],
      ],
      108: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Glock/glock_medium_C7.wav" },
        ],
      ],
    },
  },
  {
    name: "Marimba",
    program: 12,
    basePath: "Percussion/Marimba",
    layers: {
      41: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Marimba/Marimba_hit_Outrigger_F1_loud_01.wav" },
        ],
      ],
      48: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Marimba/Marimba_hit_Outrigger_C2_loud_01.wav" },
        ],
      ],
      55: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Marimba/Marimba_hit_Outrigger_G2_loud_01.wav" },
        ],
      ],
      59: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Marimba/Marimba_hit_Outrigger_B2_loud_01.wav" },
        ],
      ],
      65: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Marimba/Marimba_hit_Outrigger_F3_loud_01.wav" },
        ],
      ],
      72: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Marimba/Marimba_hit_Outrigger_C4_loud_01.wav" },
        ],
      ],
      79: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Marimba/Marimba_hit_Outrigger_G4_loud_01.wav" },
        ],
      ],
      83: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Marimba/Marimba_hit_Outrigger_B4_loud_01.wav" },
        ],
      ],
      89: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Marimba/Marimba_hit_Outrigger_F5_loud_01.wav" },
        ],
      ],
      96: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Marimba/Marimba_hit_Outrigger_C6_loud_01.wav" },
        ],
      ],
    },
  },
  {
    name: "Xylophone",
    program: 13,
    basePath: "Percussion/Xylo",
    layers: {
      67: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Xylo/Xylo_Medium_G3_ff_01_far.wav" },
        ],
      ],
      72: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Xylo/Xylo_Medium_C4_ff_01_far.wav" },
        ],
      ],
      79: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Xylo/Xylo_Medium_G4_ff_01_far.wav" },
        ],
      ],
      84: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Xylo/Xylo_Medium_C5_ff_01_far.wav" },
        ],
      ],
      91: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Xylo/Xylo_Medium_G5_ff_01_far.wav" },
        ],
      ],
      96: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Xylo/Xylo_Medium_C6_ff_01_far.wav" },
        ],
      ],
      103: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Xylo/Xylo_Medium_G6_ff_01_far.wav" },
        ],
      ],
      108: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Xylo/Xylo_Medium_C7_ff_01_far.wav" },
        ],
      ],
    },
  },
  {
    name: "Tubular Bells",
    program: 14,
    basePath: "Percussion",
    layers: {
      60: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/TB_hit_C4_v4_rr1.wav" },
        ],
      ],
      67: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/TB_hit_G4_v4_rr1.wav" },
        ],
      ],
      72: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/TB_hit_C5_v4_rr1.wav" },
        ],
      ],
      77: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/TB_hit_F5_v3_rr1.wav" },
        ],
      ],
    },
  },
    // Piezas de orquesta y de kit latino en sus notas GM de canal 10.
  {
    name: "Drum Kit",
    program: 0,
    basePath: "Percussion + VSCO 1 Percussion",
    layers: {
      35: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/bass/bdrum_ppp_1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/bass/bdrum_ppp_2.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/bass/bdrum_mp_1.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/bass/bdrum_mp_2.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/bass/bdrum_fff_1.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/bass/bdrum_fff_2.wav" },
        ],
      ],
      36: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/BDrumNewhit_v1_rr1_Sum.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/BDrumNewhit_v1_rr2_Sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/BDrumNewhit_v4_rr1_Sum.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/BDrumNewhit_v4_rr2_Sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/BDrumNewhit_v7_rr1_Sum.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/BDrumNewhit_v7_rr2_Sum.wav" },
        ],
      ],
      37: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/snare/drum1/snare1_rimshot_mf.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/snare/drum1/snare1_rimshot_f.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/snare/drum1/snare1_rimshot_fff_1.wav" },
        ],
      ],
      38: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Snare2-HitSN_v1_rr1_Sum.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Snare2-HitSN_v1_rr2_Sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Snare2-HitSN_v5_rr1_Sum.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Snare2-HitSN_v5_rr2_Sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Snare2-HitSN_v9_rr1_Sum.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Snare2-HitSN_v9_rr2_Sum.wav" },
        ],
      ],
      40: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Snare2-HitNS_v1_rr1_Sum.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Snare2-HitNS_v1_rr2_Sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Snare2-HitNS_v5_rr1_Sum.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Snare2-HitNS_v5_rr2_Sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Snare2-HitNS_v6_rr1_Sum.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Snare2-HitNS_v6_rr2_Sum.wav" },
        ],
      ],
      41: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/tenor/tenor_lower/tenor_ppp_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/tenor/tenor_lower/tenor_mf_1.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/tenor/tenor_lower/tenor_mf_2.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/tenor/tenor_lower/tenor_fff_1.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/tenor/tenor_lower/tenor_fff_2.wav" },
        ],
      ],
      45: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/tenor/tenor_higher/tenorH_pp_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/tenor/tenor_higher/tenorH_mf_1.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/tenor/tenor_higher/tenorH_mf_2.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/tenor/tenor_higher/tenorH_fff_1.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/tenor/tenor_higher/tenorH_fff_2.wav" },
        ],
      ],
      49: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/cymbal-crash1_pp_rr1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/cymbal-crash1_pp_rr2.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/cymbal-crash1_mf_rr1.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/cymbal-crash1_mf_rr2.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/cymbal-crash1_ff_rr1.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/cymbal-crash1_ff_rr2.wav" },
        ],
      ],
      51: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/susCymb1-hitstick_pp_rr1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/susCymb1-hitstick_pp_rr2.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/susCymb1-hitstick_f_rr1.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/susCymb1-hitstick_f_rr2.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/susCymb1-hitstick_fff_rr1.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/susCymb1-hitstick_fff_rr2.wav" },
        ],
      ],
      53: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/susCymb1-hit-bell_pp.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/susCymb1-hit-bell_mf.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/susCymb1-hit-bell_fff.wav" },
        ],
      ],
      54: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Tamb1-Hit_v1_rr1_Sum.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Tamb1-Hit_v1_rr2_Sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Tamb1-Hit_v2_rr1_Sum.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Tamb1-Hit_v2_rr2_Sum.wav" },
        ],
      ],
      56: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Cowbell1_Hit_v1_rr1_Sum.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Cowbell1_Hit_v1_rr2_Sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Cowbell1_Hit_v3_rr1_Sum.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Cowbell1_Hit_v3_rr2_Sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Cowbell1_Hit_v4_rr1_Sum.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Cowbell1_Hit_v4_rr2_Sum.wav" },
        ],
      ],
      57: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varMetal/Cymbals/clash/crash_hit_pp_loose.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varMetal/Cymbals/clash/crash_hit_ff_loose.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varMetal/Cymbals/clash/crash_hit_ff_tight.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varMetal/Cymbals/clash/crash_hit_fff_loose.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varMetal/Cymbals/clash/crash_hit_fff_loose_2.wav" },
        ],
      ],
      58: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varWood/vibraslap1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varWood/vibraslap2.wav" },
        ],
      ],
      60: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/other/Bongos/HighBongo1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/other/Bongos/HighBongo2.wav" },
        ],
      ],
      61: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/other/Bongos/LowBongo1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/other/Bongos/LowBongo2.wav" },
        ],
      ],
      62: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/other/ethnic/congo/muted/ethnicHigh_hit_pp_1.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/other/ethnic/congo/muted/ethnicHigh_hit_mp_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/other/ethnic/congo/muted/ethnicHigh_hit_f_1.wav" },
        ],
      ],
      63: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Quinto-HitN_v1_rr1_Sum.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Quinto-HitN_v1_rr2_Sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Quinto-HitN_v2_rr1_Sum.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Quinto-HitN_v2_rr2_Sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Quinto-HitN_v3_rr1_Sum.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Quinto-HitN_v3_rr2_Sum.wav" },
        ],
      ],
      64: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Conga-HitN_v1_rr1_Sum.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Conga-HitN_v1_rr2_Sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Conga-HitN_v2_rr1_Sum.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Conga-HitN_v2_rr2_Sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Conga-HitN_v3_rr1_Sum.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Conga-HitN_v3_rr2_Sum.wav" },
        ],
      ],
      67: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varMetal/various/agogoBell3_f_1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varMetal/various/agogoBell3_f_2.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varMetal/various/agogoBell3_ff_1.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varMetal/various/agogoBell3_ff_2.wav" },
        ],
      ],
      68: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varMetal/various/agogoBell2_mp_1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varMetal/various/agogoBell2_mp_2.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varMetal/various/agogoBell_mf1.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varMetal/various/agogoBell2_mf_1.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varMetal/various/agogoBell_f_1.wav" },
        ],
      ],
      69: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varMetal/various/cabasa_1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varMetal/various/cabasa_2.wav" },
        ],
      ],
      70: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varWood/maraca1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varWood/maraca2.wav" },
        ],
      ],
      73: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varWood/guiro_short.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varWood/guiro_short2.wav" },
        ],
      ],
      74: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varWood/guiro_long.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varWood/guiro_long2.wav" },
        ],
      ],
      75: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Claves1_Hit_v1_rr1_Sum.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Claves1_Hit_v1_rr2_Sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Claves1_Hit_v2_rr1_Sum.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Claves1_Hit_v2_rr2_Sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Claves1_Hit_v3_rr1_Sum.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Claves1_Hit_v3_rr2_Sum.wav" },
        ],
      ],
      76: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varWood/wood_click_pp_1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varWood/wood_click_pp_2.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varWood/wood_click_f.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varWood/wood_click_f2.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varWood/wood_click_ff_2.wav" },
        ],
      ],
      77: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/LogDrumLo_MedM_v1_rr1_Sum.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/LogDrumLo_MedM_v1_rr2_Sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/LogDrumLo_MedM_v2_rr1_Sum.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/LogDrumLo_MedM_v2_rr2_Sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/LogDrumLo_MedM_v3_rr1_Sum.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/LogDrumLo_MedM_v3_rr2_Sum.wav" },
        ],
      ],
      80: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Triangle3-HitM_v1_rr1_Sum.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Triangle3-HitM_v1_rr2_Sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Triangle3-HitM_v2_rr1_Sum.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Triangle3-HitM_v2_rr2_Sum.wav" },
        ],
      ],
      81: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Triangle3-Hit_v1_rr1_Sum.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Triangle3-Hit_v1_rr2_Sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Triangle3-Hit_v2_rr1_Sum.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Triangle3-Hit_v2_rr2_Sum.wav" },
        ],
      ],
      82: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varWood/Camo's%20Shaker/shake1.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/varWood/Camo's%20Shaker/shake2.wav" },
        ],
      ],
      83: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Sleighbells_Hit_v1_rr1_Mid.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Sleighbells_Hit_v1_rr2_Mid.wav" },
        ],
      ],
      84: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/BellTree_Stroke1_v1_Sum.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/BellTree_Stroke2_v1_Sum.wav" },
        ],
      ],
    },
  },
    // El banco no rotula la afinación de cada tambor: se asume el juego
  // estándar de 5 timbales D2–F2–A2–C3–E3 (Timpani1 = el más grande).
  {
    name: "Timpani",
    program: 47,
    basePath: "Percussion/Timpani",
    layers: {
      38: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani1_Hit_v1_rr1_Sum.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani1_Hit_v1_rr2_Sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani1_Hit_v3_rr1_Sum.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani1_Hit_v3_rr2_Sum.wav" },
        ],
      ],
      41: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani2_Hit_v1_rr1_Sum.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani2_Hit_v1_rr2_Sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani2_Hit_v3_rr1_Sum.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani2_Hit_v3_rr2_Sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani2_Hit_v4_rr1_Sum.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani2_Hit_v4_rr2_Sum.wav" },
        ],
      ],
      45: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani3_Hit_v1_rr1_Sum.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani3_Hit_v1_rr2_Sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani3_Hit_v3_rr1_Sum.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani3_Hit_v3_rr2_Sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani3_Hit_v4_rr1_Sum.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani3_Hit_v4_rr2_Sum.wav" },
        ],
      ],
      48: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani4_Hit_v1_rr1_Sum.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani4_Hit_v1_rr2_Sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani4_Hit_v3_rr1_Sum.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani4_Hit_v3_rr2_Sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani4_Hit_v4_rr1_Sum.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani4_Hit_v4_rr2_Sum.wav" },
        ],
      ],
      52: [
        [
          { vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani5_Hit_v1_rr1_Sum.wav" },
          { vel: 1, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani5_Hit_v1_rr2_Sum.wav" },
        ],
        [
          { vel: 2, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani5_Hit_v3_rr1_Sum.wav" },
          { vel: 2, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani5_Hit_v3_rr2_Sum.wav" },
        ],
        [
          { vel: 3, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani5_Hit_v4_rr1_Sum.wav" },
          { vel: 3, rr: 2, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani5_Hit_v4_rr2_Sum.wav" },
        ],
      ],
    },
  },
];
