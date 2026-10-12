/**
 * instrumentPanning — ubica cada instrumento en el campo estéreo.
 *
 * POR QUÉ IMPORTA
 * ---------------
 * Hasta ahora TODOS los samples salían al centro: la mezcla era un punto en el
 * medio de los dos parlantes. Es el detalle que más delata una producción
 * amateur — una banda real ocupa el escenario: el bajo y la batería al centro,
 * las guitarras a los lados, las cuerdas y los pads abiertos, los metales
 * repartidos. En un bolero el requinto y la guitarra se contestan de izquierda a
 * derecha; en un vallenato el acordeón va al frente y el bajo atrás.
 *
 * Los valores siguen la convención de mezcla de estos géneros (-1 = izquierda,
 * +1 = derecha) y son deliberadamente conservadores: un paneo exagerado cansa
 * al oído y desafina el balance en un parlante Bluetooth mono.
 */

/** Paneo por programa GM (los que usa la biblioteca). */
const PROGRAM_PAN: Record<number, number> = {
  // Teclados
  0: -0.12, 1: -0.12, 2: -0.2, 3: -0.15, 4: 0.3, 5: 0.3, 6: -0.3, 7: 0.35,
  // Percusión cromática (campanas, vibráfono, marimba: brillan a un lado)
  8: 0.35, 9: 0.4, 10: 0.3, 11: 0.25, 12: -0.25, 13: 0.3, 14: 0.35, 15: 0.2,
  // Órganos y free-reed
  16: 0, 17: -0.2, 18: 0.25, 19: 0, 20: -0.15, 21: 0.15, 22: 0.2, 23: -0.2,
  // Guitarras: se reparten el escenario
  24: -0.4, 25: 0.4, 26: 0.35, 27: -0.35, 28: 0.3, 29: 0.45, 30: -0.45, 31: 0.3,
  // Bajos: al centro (el grave mono es lo que hace que suene parejo en cualquier equipo)
  32: 0, 33: 0, 34: 0, 35: 0.05, 36: 0, 37: 0, 38: 0, 39: 0,
  // Cuerdas: solistas a un lado, ensambles abiertos
  40: -0.35, 41: -0.25, 42: 0.25, 43: 0.15, 44: -0.3, 45: 0.3, 46: 0.35,
  47: 0.1, 48: -0.25, 49: 0.25, 50: -0.3, 51: 0.3,
  // Coros: al fondo y abiertos
  52: 0.2, 53: -0.2, 54: 0.25, 55: 0,
  // Metales: repartidos como en una banda
  56: -0.3, 57: 0.3, 58: 0.2, 59: -0.35, 60: -0.2, 61: 0, 62: -0.25, 63: 0.25,
  // Maderas
  64: -0.3, 65: -0.25, 66: 0.3, 67: 0.25, 68: -0.2, 69: 0.2, 70: 0.15,
  71: -0.25, 72: -0.35, 73: -0.2, 74: 0.2, 75: 0.25, 76: 0.2, 77: -0.2,
  78: 0.25, 79: 0.2,
  // Pads y FX: anchos, al fondo
  88: -0.35, 89: 0.35, 90: -0.3, 91: 0.3, 92: -0.4, 93: 0.4, 94: -0.3, 95: 0.3,
  96: -0.45, 97: 0.45, 98: -0.35, 99: 0.35, 100: -0.4, 101: 0.4,
  // Ethnic
  104: 0.3, 105: -0.3, 106: 0.25, 107: -0.25, 108: 0.2, 109: 0.2, 110: -0.3,
};

/** Nombre GM → programa (para cuando sólo se conoce el nombre del instrumento). */
const NAME_PROGRAM: [RegExp, number][] = [
  [/acoustic grand|bright acoustic|honky/i, 0],
  [/electric grand/i, 2],
  [/electric piano 1|rhodes/i, 4],
  [/electric piano 2|dx/i, 5],
  [/harpsichord/i, 6],
  [/clavinet/i, 7],
  [/celesta/i, 8],
  [/glockenspiel/i, 9],
  [/music box/i, 10],
  [/vibraphone/i, 11],
  [/marimba/i, 12],
  [/xylophone/i, 13],
  [/tubular/i, 14],
  [/dulcimer/i, 15],
  [/drawbar organ/i, 16],
  [/percussive organ/i, 17],
  [/rock organ/i, 18],
  [/church organ/i, 19],
  [/reed organ/i, 20],
  [/tango accordion/i, 23],
  [/accordion/i, 21],
  [/harmonica/i, 22],
  [/nylon/i, 24],
  [/steel/i, 25],
  [/guitar \(jazz\)/i, 26],
  [/guitar \(clean\)/i, 27],
  [/guitar \(muted\)/i, 28],
  [/overdriven/i, 29],
  [/distortion/i, 30],
  [/guitar harmonics/i, 31],
  [/acoustic bass/i, 32],
  [/bass \(finger\)/i, 33],
  [/bass \(pick\)/i, 34],
  [/fretless/i, 35],
  [/slap bass 1/i, 36],
  [/slap bass 2/i, 37],
  [/synth bass 1/i, 38],
  [/synth bass 2/i, 39],
  [/violin/i, 40],
  [/viola/i, 41],
  [/cello/i, 42],
  [/contrabass|double bass/i, 43],
  [/tremolo strings/i, 44],
  [/pizzicato/i, 45],
  [/harp/i, 46],
  [/timpani/i, 47],
  [/string ensemble 1/i, 48],
  [/string ensemble 2/i, 49],
  [/synth strings 1/i, 50],
  [/synth strings 2/i, 51],
  [/choir aahs/i, 52],
  [/voice oohs/i, 53],
  [/synth choir/i, 54],
  [/trumpet|muted trumpet/i, 56],
  [/trombone/i, 57],
  [/tuba/i, 58],
  [/french horn/i, 60],
  [/brass section/i, 61],
  [/soprano sax/i, 64],
  [/alto sax/i, 65],
  [/tenor sax/i, 66],
  [/baritone sax/i, 67],
  [/oboe/i, 68],
  [/english horn/i, 69],
  [/bassoon/i, 70],
  [/clarinet/i, 71],
  [/piccolo/i, 72],
  [/flute/i, 73],
  [/recorder/i, 74],
  [/pan flute/i, 75],
  [/shakuhachi/i, 77],
  [/whistle/i, 78],
  [/ocarina/i, 79],
  [/pad 1|new age/i, 88],
  [/pad 2|warm/i, 89],
  [/pad 3|polysynth/i, 90],
  [/pad 4/i, 91],
  [/pad 5|bowed/i, 92],
  [/pad 6|metallic/i, 93],
  [/pad 7|halo/i, 94],
  [/pad 8|sweep/i, 95],
  [/fx 1|rain/i, 96],
  [/fx 2|soundtrack/i, 97],
  [/fx 3|crystal/i, 98],
  [/sitar/i, 104],
  [/banjo/i, 105],
  [/shamisen/i, 106],
  [/koto/i, 107],
  [/kalimba/i, 108],
  [/bagpipe/i, 109],
  [/fiddle/i, 110],
];

/**
 * Paneo (‑1 izquierda … +1 derecha) para un instrumento.
 *
 * Los graves van al centro a propósito: panear el bajo desbalancea la mezcla en
 * cualquier equipo con un solo parlante y hace que se pierda en los celulares.
 */
export function panForInstrument(instrument: string): number {
  for (const [rx, program] of NAME_PROGRAM) {
    if (rx.test(instrument)) {
      return PROGRAM_PAN[program] ?? 0;
    }
  }
  return 0;
}

/**
 * Paneo por pieza de percusión (nota GM del canal 10).
 *
 * Un kit real está repartido: el hi-hat a un lado, el ride al otro, los toms
 * abriéndose, las congas y bongos enfrentados. Es lo que hace que la batería
 * "suene a batería" y no a un click track.
 */
export const DRUM_PAN: Record<number, number> = {
  // Bombo y caja: centro
  35: 0, 36: 0, 38: -0.08, 37: 0.1, 39: 0, 40: 0.08,
  // Toms: de izquierda (grave) a derecha (agudo)
  41: -0.45, 43: -0.3, 45: -0.15, 47: 0.15, 48: 0.3, 50: 0.45,
  // Hi-hat: a la derecha del baterista (izquierda del oyente)
  42: -0.25, 44: -0.25, 46: -0.22,
  // Platillos
  49: 0.35, 51: 0.4, 52: 0.45, 53: 0.4, 55: 0.3, 57: 0.3, 59: 0.4,
  // Percusión latina: enfrentada, como en un set
  54: 0.3, 56: -0.3, 58: 0.35,
  60: 0.35, 61: 0.25, // bongos
  62: -0.3, 63: -0.35, 64: -0.45, // congas
  65: -0.25, 66: 0.25, // timbales
  67: 0.4, 68: 0.5, 69: 0.45, 70: 0.5, // agogo, cabasa, maracas
  73: -0.4, 74: -0.45, 75: 0.2, 76: -0.2, 77: 0.2,
  80: 0.45, 81: 0.45, 82: 0.5, 83: 0.45, 84: 0.4, 85: 0.3, 86: 0, 87: 0,
};

export function panForDrumPiece(note: number): number {
  return DRUM_PAN[note] ?? 0;
}
