/**
 * wafManifest — cobertura REAL de WebAudioFont (surikov) para los programas GM y
 * las piezas de percusión que esta app usa.
 *
 * GENERADO por `scripts/generate-waf-manifest.mjs`. No editar a mano.
 *
 * POR QUÉ EXISTE
 * --------------
 * WebAudioFont no publica inventario, y **no todos los programas ni todas las
 * notas de percusión existen**. Sin este manifiesto, pedir una variante
 * inexistente da 404 y el motor de turno cae a un sintetizador de relleno; con
 * él, la app sabe de antemano qué puede pedir y qué no.
 *
 * DE DÓNDE SALEN LOS DATOS (ninguno inventado)
 * --------------------------------------------
 *  - Melódicos: el índice del directorio
 *    `https://surikov.github.io/webaudiofontdata/sound/` — 1477 enlaces.
 *  - Percusión: un tanteo HEAD real contra el CDN
 *    (`scripts/probe-waf-urls.mjs`), porque el índice **no lista** los archivos
 *    de una sola pieza: sólo publica los 82 de kit completo
 *    (`drums_<kit>_<Fuente><Nombre>`). De las 1440 combinaciones
 *    nota × kit × fuente probadas, 715 responden 200 y quedan acá.
 *
 * FORMATO DE LOS IDS (verificado contra el CDN real)
 * --------------------------------------------------
 *  - Melódico: `<programa 3 dígitos base 0><variante 1 dígito>_<Fuente>`
 *    → `0210_GeneralUserGS` es acordeón (programa 21, variante 0).
 *    Ojo: `0021_*` NO es acordeón, es el programa 2 (Electric Grand Piano).
 *  - Percusión: `128<nota MIDI>_<kit>_<Fuente>`
 *    → `12836_0_FluidR3_GM` es la nota 36 (bombo) del kit 0 (Standard).
 *    Cada archivo trae UNA sola nota.
 *
 *  La URL es el id + `_sf2_file.js`, salvo cuando la fuente ya termina en
 *  `_sf2` (`SBLive_sf2`) o `_sf2_file`, en cuyo caso es el id + `.js`.
 *  Las fuentes de percusión ya vienen con el sufijo pegado
 *  (`FluidR3_GM_sf2_file`), así que su URL es id + `.js` a secas.
 */

/** Programa GM → lista ordenada de variantes disponibles (id sin extensión). */
export type WafVariants = Record<number, string[]>;

/**
 * Variantes reales por programa GM, ordenadas por prioridad de fuente
 * (GeneralUserGS > FluidR3_GM > JCLive > Aspirin > Chaos > SBLive_sf2 > SoundBlasterOld)
 * y, dentro de cada fuente, por número de variante.
 *
 * Un array **vacío** significa que el índice no publica ninguna variante para
 * ese programa: hay que resolverlo con otro motor (soundfont de gleitz o
 * instrumento propio), nunca con una variante inventada.
 */
export const WAF_VARIANTS: WafVariants = {
  0: ["0000_GeneralUserGS_sf2_file", "0000_FluidR3_GM_sf2_file", "0000_JCLive_sf2_file", "0000_Aspirin_sf2_file", "0000_Chaos_sf2_file", "0000_SoundBlasterOld_sf2", "0000_SBLive_sf2", "0001_GeneralUserGS_sf2_file", "0001_FluidR3_GM_sf2_file", "0002_GeneralUserGS_sf2_file", "0003_GeneralUserGS_sf2_file"],
  1: ["0010_GeneralUserGS_sf2_file", "0010_FluidR3_GM_sf2_file", "0010_JCLive_sf2_file", "0010_Aspirin_sf2_file", "0010_Chaos_sf2_file", "0010_SoundBlasterOld_sf2", "0010_SBLive_sf2", "0011_GeneralUserGS_sf2_file", "0011_FluidR3_GM_sf2_file", "0011_Aspirin_sf2_file", "0012_GeneralUserGS_sf2_file"],
  2: ["0020_GeneralUserGS_sf2_file", "0020_FluidR3_GM_sf2_file", "0020_JCLive_sf2_file", "0020_Aspirin_sf2_file", "0020_Chaos_sf2_file", "0020_SoundBlasterOld_sf2", "0020_SBLive_sf2", "0021_GeneralUserGS_sf2_file", "0021_Aspirin_sf2_file", "0022_Aspirin_sf2_file"],
  3: ["0030_GeneralUserGS_sf2_file", "0030_FluidR3_GM_sf2_file", "0030_JCLive_sf2_file", "0030_Aspirin_sf2_file", "0030_Chaos_sf2_file", "0030_SoundBlasterOld_sf2", "0030_SBLive_sf2", "0031_GeneralUserGS_sf2_file", "0031_FluidR3_GM_sf2_file", "0031_Aspirin_sf2_file", "0031_SoundBlasterOld_sf2"],
  4: ["0040_GeneralUserGS_sf2_file", "0040_FluidR3_GM_sf2_file", "0040_JCLive_sf2_file", "0040_Aspirin_sf2_file", "0040_Chaos_sf2_file", "0040_SoundBlasterOld_sf2", "0040_SBLive_sf2", "0041_GeneralUserGS_sf2_file", "0041_FluidR3_GM_sf2_file", "0041_SoundBlasterOld_sf2", "0042_GeneralUserGS_sf2_file", "0043_GeneralUserGS_sf2_file", "0044_GeneralUserGS_sf2_file", "0045_GeneralUserGS_sf2_file", "0046_GeneralUserGS_sf2_file"],
  5: ["0050_GeneralUserGS_sf2_file", "0050_FluidR3_GM_sf2_file", "0050_JCLive_sf2_file", "0050_Aspirin_sf2_file", "0050_Chaos_sf2_file", "0050_SoundBlasterOld_sf2", "0050_SBLive_sf2", "0051_GeneralUserGS_sf2_file", "0051_FluidR3_GM_sf2_file", "0052_GeneralUserGS_sf2_file", "0053_GeneralUserGS_sf2_file", "0054_GeneralUserGS_sf2_file"],
  8: ["0080_GeneralUserGS_sf2_file", "0080_FluidR3_GM_sf2_file", "0080_JCLive_sf2_file", "0080_Aspirin_sf2_file", "0080_Chaos_sf2_file", "0080_SoundBlasterOld_sf2", "0080_SBLive_sf2", "0081_GeneralUserGS_sf2_file", "0081_FluidR3_GM_sf2_file", "0081_SoundBlasterOld_sf2"],
  10: ["0100_GeneralUserGS_sf2_file", "0100_FluidR3_GM_sf2_file", "0100_JCLive_sf2_file", "0100_Aspirin_sf2_file", "0100_Chaos_sf2_file", "0100_SoundBlasterOld_sf2", "0100_SBLive_sf2", "0101_GeneralUserGS_sf2_file", "0101_SoundBlasterOld_sf2"],
  11: ["0110_GeneralUserGS_sf2_file", "0110_FluidR3_GM_sf2_file", "0110_JCLive_sf2_file", "0110_Aspirin_sf2_file", "0110_Chaos_sf2_file", "0110_SoundBlasterOld_sf2", "0110_SBLive_sf2", "0111_FluidR3_GM_sf2_file"],
  12: ["0120_GeneralUserGS_sf2_file", "0120_FluidR3_GM_sf2_file", "0120_JCLive_sf2_file", "0120_Aspirin_sf2_file", "0120_Chaos_sf2_file", "0120_SoundBlasterOld_sf2", "0120_SBLive_sf2", "0121_GeneralUserGS_sf2_file", "0121_FluidR3_GM_sf2_file"],
  13: ["0130_GeneralUserGS_sf2_file", "0130_FluidR3_GM_sf2_file", "0130_JCLive_sf2_file", "0130_Aspirin_sf2_file", "0130_Chaos_sf2_file", "0130_SoundBlasterOld_sf2", "0130_SBLive_sf2", "0131_FluidR3_GM_sf2_file"],
  15: ["0150_GeneralUserGS_sf2_file", "0150_FluidR3_GM_sf2_file", "0150_JCLive_sf2_file", "0150_Aspirin_sf2_file", "0150_Chaos_sf2_file", "0150_SoundBlasterOld_sf2", "0150_SBLive_sf2", "0151_FluidR3_GM_sf2_file"],
  16: ["0160_GeneralUserGS_sf2_file", "0160_FluidR3_GM_sf2_file", "0160_JCLive_sf2_file", "0160_Aspirin_sf2_file", "0160_Chaos_sf2_file", "0160_SoundBlasterOld_sf2", "0160_SBLive_sf2", "0161_FluidR3_GM_sf2_file", "0161_Aspirin_sf2_file", "0161_SoundBlasterOld_sf2"],
  17: ["0170_GeneralUserGS_sf2_file", "0170_FluidR3_GM_sf2_file", "0170_JCLive_sf2_file", "0170_Aspirin_sf2_file", "0170_Chaos_sf2_file", "0170_SoundBlasterOld_sf2", "0170_SBLive_sf2", "0171_GeneralUserGS_sf2_file", "0171_FluidR3_GM_sf2_file", "0172_FluidR3_GM_sf2_file"],
  18: ["0180_GeneralUserGS_sf2_file", "0180_FluidR3_GM_sf2_file", "0180_JCLive_sf2_file", "0180_Aspirin_sf2_file", "0180_Chaos_sf2_file", "0180_SoundBlasterOld_sf2", "0180_SBLive_sf2", "0181_GeneralUserGS_sf2_file", "0181_Aspirin_sf2_file", "0181_SoundBlasterOld_sf2"],
  21: ["0210_GeneralUserGS_sf2_file", "0210_FluidR3_GM_sf2_file", "0210_JCLive_sf2_file", "0210_Aspirin_sf2_file", "0210_Chaos_sf2_file", "0210_SoundBlasterOld_sf2", "0210_SBLive_sf2", "0211_GeneralUserGS_sf2_file", "0211_FluidR3_GM_sf2_file", "0211_Aspirin_sf2_file", "0211_SoundBlasterOld_sf2", "0212_GeneralUserGS_sf2_file"],
  22: ["0220_GeneralUserGS_sf2_file", "0220_FluidR3_GM_sf2_file", "0220_JCLive_sf2_file", "0220_Aspirin_sf2_file", "0220_Chaos_sf2_file", "0220_SoundBlasterOld_sf2", "0220_SBLive_sf2", "0221_FluidR3_GM_sf2_file"],
  23: ["0230_GeneralUserGS_sf2_file", "0230_FluidR3_GM_sf2_file", "0230_JCLive_sf2_file", "0230_Aspirin_sf2_file", "0230_Chaos_sf2_file", "0230_SoundBlasterOld_sf2", "0230_SBLive_sf2", "0231_GeneralUserGS_sf2_file", "0231_FluidR3_GM_sf2_file", "0231_JCLive_sf2_file", "0231_SoundBlasterOld_sf2", "0232_FluidR3_GM_sf2_file", "0233_FluidR3_GM_sf2_file"],
  24: ["0240_GeneralUserGS_sf2_file", "0240_FluidR3_GM_sf2_file", "0240_JCLive_sf2_file", "0240_Aspirin_sf2_file", "0240_Chaos_sf2_file", "0240_SoundBlasterOld_sf2", "0240_LK_Godin_Nylon_SF2_file", "0240_SBLive_sf2", "0241_GeneralUserGS_sf2_file", "0241_JCLive_sf2_file", "0242_JCLive_sf2_file", "0243_JCLive_sf2_file"],
  25: ["0250_GeneralUserGS_sf2_file", "0250_FluidR3_GM_sf2_file", "0250_JCLive_sf2_file", "0250_Aspirin_sf2_file", "0250_Chaos_sf2_file", "0250_SoundBlasterOld_sf2", "0250_Acoustic_Guitar_sf2_file", "0250_LK_AcousticSteel_SF2_file", "0250_SBLive_sf2", "0251_GeneralUserGS_sf2_file", "0251_Acoustic_Guitar_sf2_file", "0252_GeneralUserGS_sf2_file", "0252_Acoustic_Guitar_sf2_file", "0253_GeneralUserGS_sf2_file", "0253_Acoustic_Guitar_sf2_file", "0254_GeneralUserGS_sf2_file", "0254_Acoustic_Guitar_sf2_file", "0255_GeneralUserGS_sf2_file"],
  26: ["0260_GeneralUserGS_sf2_file", "0260_FluidR3_GM_sf2_file", "0260_JCLive_sf2_file", "0260_Aspirin_sf2_file", "0260_Chaos_sf2_file", "0260_SoundBlasterOld_sf2", "0260_SBLive_sf2", "0260_Stratocaster_sf2_file", "0261_GeneralUserGS_sf2_file", "0261_SoundBlasterOld_sf2", "0261_Stratocaster_sf2_file", "0262_Stratocaster_sf2_file"],
  27: ["0270_GeneralUserGS_sf2_file", "0270_FluidR3_GM_sf2_file", "0270_JCLive_sf2_file", "0270_Aspirin_sf2_file", "0270_Chaos_sf2_file", "0270_SoundBlasterOld_sf2", "0270_Gibson_Les_Paul_sf2_file", "0270_SBAWE32_sf2_file", "0270_SBLive_sf2", "0270_Stratocaster_sf2_file", "0271_GeneralUserGS_sf2_file", "0271_Stratocaster_sf2_file", "0272_Stratocaster_sf2_file"],
  28: ["0280_GeneralUserGS_sf2_file", "0280_FluidR3_GM_sf2_file", "0280_JCLive_sf2_file", "0280_Aspirin_sf2_file", "0280_Chaos_sf2_file", "0280_SoundBlasterOld_sf2", "0280_LesPaul_sf2", "0280_LesPaul_sf2_file", "0280_SBAWE32_sf2_file", "0280_SBLive_sf2", "0281_GeneralUserGS_sf2_file", "0281_FluidR3_GM_sf2_file", "0281_Aspirin_sf2_file", "0282_GeneralUserGS_sf2_file", "0282_FluidR3_GM_sf2_file", "0283_GeneralUserGS_sf2_file"],
  29: ["0290_GeneralUserGS_sf2_file", "0290_FluidR3_GM_sf2_file", "0290_JCLive_sf2_file", "0290_Aspirin_sf2_file", "0290_Chaos_sf2_file", "0290_SoundBlasterOld_sf2", "0290_LesPaul_sf2", "0290_LesPaul_sf2_file", "0290_SBAWE32_sf2_file", "0290_SBLive_sf2", "0291_Aspirin_sf2_file", "0291_SoundBlasterOld_sf2", "0291_LesPaul_sf2", "0291_LesPaul_sf2_file", "0291_SBAWE32_sf2_file", "0292_Aspirin_sf2_file", "0292_LesPaul_sf2", "0292_LesPaul_sf2_file"],
  30: ["0300_GeneralUserGS_sf2_file", "0300_FluidR3_GM_sf2_file", "0300_JCLive_sf2_file", "0300_Aspirin_sf2_file", "0300_Chaos_sf2_file", "0300_SoundBlasterOld_sf2", "0300_LesPaul_sf2", "0300_LesPaul_sf2_file", "0300_SBAWE32_sf2_file", "0300_SBLive_sf2", "0301_GeneralUserGS_sf2_file", "0301_FluidR3_GM_sf2_file", "0301_JCLive_sf2_file", "0301_Aspirin_sf2_file", "0301_LesPaul_sf2", "0301_LesPaul_sf2_file", "0302_GeneralUserGS_sf2_file", "0302_JCLive_sf2_file", "0302_Aspirin_sf2_file", "0303_Aspirin_sf2_file", "0304_Aspirin_sf2_file"],
  32: ["0320_GeneralUserGS_sf2_file", "0320_FluidR3_GM_sf2_file", "0320_JCLive_sf2_file", "0320_Aspirin_sf2_file", "0320_Chaos_sf2_file", "0320_SoundBlasterOld_sf2", "0320_SBLive_sf2", "0321_GeneralUserGS_sf2_file", "0322_GeneralUserGS_sf2_file"],
  33: ["0330_GeneralUserGS_sf2_file", "0330_FluidR3_GM_sf2_file", "0330_JCLive_sf2_file", "0330_Aspirin_sf2_file", "0330_Chaos_sf2_file", "0330_SoundBlasterOld_sf2", "0330_SBLive_sf2", "0331_GeneralUserGS_sf2_file", "0332_GeneralUserGS_sf2_file"],
  34: ["0340_GeneralUserGS_sf2_file", "0340_FluidR3_GM_sf2_file", "0340_JCLive_sf2_file", "0340_Aspirin_sf2_file", "0340_Chaos_sf2_file", "0340_SoundBlasterOld_sf2", "0340_SBLive_sf2", "0341_GeneralUserGS_sf2_file", "0341_Aspirin_sf2_file"],
  35: ["0350_GeneralUserGS_sf2_file", "0350_FluidR3_GM_sf2_file", "0350_JCLive_sf2_file", "0350_Aspirin_sf2_file", "0350_Chaos_sf2_file", "0350_SoundBlasterOld_sf2", "0350_SBLive_sf2", "0351_GeneralUserGS_sf2_file"],
  36: ["0360_GeneralUserGS_sf2_file", "0360_FluidR3_GM_sf2_file", "0360_JCLive_sf2_file", "0360_Aspirin_sf2_file", "0360_Chaos_sf2_file", "0360_SoundBlasterOld_sf2", "0360_SBLive_sf2", "0361_GeneralUserGS_sf2_file"],
  37: ["0370_GeneralUserGS_sf2_file", "0370_FluidR3_GM_sf2_file", "0370_JCLive_sf2_file", "0370_Aspirin_sf2_file", "0370_Chaos_sf2_file", "0370_SoundBlasterOld_sf2", "0370_SBLive_sf2", "0371_GeneralUserGS_sf2_file", "0372_GeneralUserGS_sf2_file"],
  39: ["0390_GeneralUserGS_sf2_file", "0390_FluidR3_GM_sf2_file", "0390_JCLive_sf2_file", "0390_Aspirin_sf2_file", "0390_Chaos_sf2_file", "0390_SoundBlasterOld_sf2", "0390_SBLive_sf2", "0391_GeneralUserGS_sf2_file", "0391_FluidR3_GM_sf2_file", "0391_SoundBlasterOld_sf2", "0392_GeneralUserGS_sf2_file", "0392_FluidR3_GM_sf2_file", "0393_GeneralUserGS_sf2_file"],
  40: ["0400_GeneralUserGS_sf2_file", "0400_FluidR3_GM_sf2_file", "0400_JCLive_sf2_file", "0400_Aspirin_sf2_file", "0400_Chaos_sf2_file", "0400_SoundBlasterOld_sf2", "0400_SBLive_sf2", "0401_GeneralUserGS_sf2_file", "0401_FluidR3_GM_sf2_file", "0401_Aspirin_sf2_file", "0402_GeneralUserGS_sf2_file"],
  44: ["0440_GeneralUserGS_sf2_file", "0440_FluidR3_GM_sf2_file", "0440_JCLive_sf2_file", "0440_Aspirin_sf2_file", "0440_Chaos_sf2_file", "0440_SoundBlasterOld_sf2", "0440_SBLive_sf2", "0441_GeneralUserGS_sf2_file", "0442_GeneralUserGS_sf2_file"],
  45: ["0450_GeneralUserGS_sf2_file", "0450_FluidR3_GM_sf2_file", "0450_JCLive_sf2_file", "0450_Aspirin_sf2_file", "0450_Chaos_sf2_file", "0450_SoundBlasterOld_sf2", "0450_SBLive_sf2", "0451_FluidR3_GM_sf2_file"],
  46: ["0460_GeneralUserGS_sf2_file", "0460_FluidR3_GM_sf2_file", "0460_JCLive_sf2_file", "0460_Aspirin_sf2_file", "0460_Chaos_sf2_file", "0460_SoundBlasterOld_sf2", "0460_SBLive_sf2", "0461_FluidR3_GM_sf2_file"],
  47: ["0470_GeneralUserGS_sf2_file", "0470_FluidR3_GM_sf2_file", "0470_JCLive_sf2_file", "0470_Aspirin_sf2_file", "0470_Chaos_sf2_file", "0470_SoundBlasterOld_sf2", "0470_SBLive_sf2", "0471_GeneralUserGS_sf2_file", "0471_FluidR3_GM_sf2_file"],
  48: ["0480_GeneralUserGS_sf2_file", "0480_FluidR3_GM_sf2_file", "0480_JCLive_sf2_file", "0480_Aspirin_sf2_file", "0480_Chaos_sf2_file", "0480_SoundBlasterOld_sf2", "0480_SBLive_sf2", "0481_GeneralUserGS_sf2_file", "0481_FluidR3_GM_sf2_file", "0481_Aspirin_sf2_file", "0482_GeneralUserGS_sf2_file", "0482_Aspirin_sf2_file", "0483_GeneralUserGS_sf2_file", "0484_GeneralUserGS_sf2_file", "0485_GeneralUserGS_sf2_file", "0486_GeneralUserGS_sf2_file", "0487_GeneralUserGS_sf2_file", "0488_GeneralUserGS_sf2_file", "0489_GeneralUserGS_sf2_file"],
  49: ["0490_GeneralUserGS_sf2_file", "0490_FluidR3_GM_sf2_file", "0490_JCLive_sf2_file", "0490_Aspirin_sf2_file", "0490_Chaos_sf2_file", "0490_SoundBlasterOld_sf2", "0490_SBLive_sf2", "0491_GeneralUserGS_sf2_file", "0492_GeneralUserGS_sf2_file"],
  50: ["0500_GeneralUserGS_sf2_file", "0500_FluidR3_GM_sf2_file", "0500_JCLive_sf2_file", "0500_Aspirin_sf2_file", "0500_Chaos_sf2_file", "0500_SoundBlasterOld_sf2", "0500_SBLive_sf2", "0501_GeneralUserGS_sf2_file", "0501_FluidR3_GM_sf2_file", "0502_GeneralUserGS_sf2_file", "0502_FluidR3_GM_sf2_file", "0503_FluidR3_GM_sf2_file", "0504_FluidR3_GM_sf2_file", "0505_FluidR3_GM_sf2_file"],
  51: ["0510_GeneralUserGS_sf2_file", "0510_FluidR3_GM_sf2_file", "0510_JCLive_sf2_file", "0510_Aspirin_sf2_file", "0510_Chaos_sf2_file", "0510_SoundBlasterOld_sf2", "0510_SBLive_sf2", "0511_GeneralUserGS_sf2_file", "0511_SoundBlasterOld_sf2"],
  52: ["0520_GeneralUserGS_sf2_file", "0520_FluidR3_GM_sf2_file", "0520_JCLive_sf2_file", "0520_Aspirin_sf2_file", "0520_Chaos_sf2_file", "0520_SoundBlasterOld_sf2", "0520_SBLive_sf2", "0520_Soul_Ahhs_sf2_file", "0521_FluidR3_GM_sf2_file", "0521_SoundBlasterOld_sf2", "0521_Soul_Ahhs_sf2_file", "0522_Soul_Ahhs_sf2_file"],
  53: ["0530_GeneralUserGS_sf2_file", "0530_FluidR3_GM_sf2_file", "0530_JCLive_sf2_file", "0530_Aspirin_sf2_file", "0530_Chaos_sf2_file", "0530_SoundBlasterOld_sf2", "0530_SBLive_sf2", "0530_Soul_Ahhs_sf2_file", "0531_GeneralUserGS_sf2_file", "0531_FluidR3_GM_sf2_file", "0531_JCLive_sf2_file", "0531_SoundBlasterOld_sf2"],
  54: ["0540_GeneralUserGS_sf2_file", "0540_FluidR3_GM_sf2_file", "0540_JCLive_sf2_file", "0540_Aspirin_sf2_file", "0540_Chaos_sf2_file", "0540_SoundBlasterOld_sf2", "0540_SBLive_sf2", "0541_FluidR3_GM_sf2_file"],
  56: ["0560_GeneralUserGS_sf2_file", "0560_FluidR3_GM_sf2_file", "0560_JCLive_sf2_file", "0560_Aspirin_sf2_file", "0560_Chaos_sf2_file", "0560_SoundBlasterOld_sf2", "0560_SBLive_sf2"],
  57: ["0570_GeneralUserGS_sf2_file", "0570_FluidR3_GM_sf2_file", "0570_JCLive_sf2_file", "0570_Aspirin_sf2_file", "0570_Chaos_sf2_file", "0570_SoundBlasterOld_sf2", "0570_SBLive_sf2", "0571_GeneralUserGS_sf2_file"],
  58: ["0580_GeneralUserGS_sf2_file", "0580_FluidR3_GM_sf2_file", "0580_JCLive_sf2_file", "0580_Aspirin_sf2_file", "0580_Chaos_sf2_file", "0580_SoundBlasterOld_sf2", "0580_SBLive_sf2", "0581_GeneralUserGS_sf2_file"],
  59: ["0590_GeneralUserGS_sf2_file", "0590_FluidR3_GM_sf2_file", "0590_JCLive_sf2_file", "0590_Aspirin_sf2_file", "0590_Chaos_sf2_file", "0590_SoundBlasterOld_sf2", "0590_SBLive_sf2", "0591_GeneralUserGS_sf2_file"],
  60: ["0600_GeneralUserGS_sf2_file", "0600_FluidR3_GM_sf2_file", "0600_JCLive_sf2_file", "0600_Aspirin_sf2_file", "0600_Chaos_sf2_file", "0600_SoundBlasterOld_sf2", "0600_SBLive_sf2", "0601_GeneralUserGS_sf2_file", "0601_FluidR3_GM_sf2_file", "0602_GeneralUserGS_sf2_file", "0603_GeneralUserGS_sf2_file"],
  61: ["0610_GeneralUserGS_sf2_file", "0610_FluidR3_GM_sf2_file", "0610_JCLive_sf2_file", "0610_Aspirin_sf2_file", "0610_Chaos_sf2_file", "0610_SoundBlasterOld_sf2", "0610_SBLive_sf2", "0611_GeneralUserGS_sf2_file", "0612_GeneralUserGS_sf2_file", "0613_GeneralUserGS_sf2_file", "0614_GeneralUserGS_sf2_file", "0615_GeneralUserGS_sf2_file"],
  62: ["0620_GeneralUserGS_sf2_file", "0620_FluidR3_GM_sf2_file", "0620_JCLive_sf2_file", "0620_Aspirin_sf2_file", "0620_Chaos_sf2_file", "0620_SoundBlasterOld_sf2", "0620_SBLive_sf2", "0621_GeneralUserGS_sf2_file", "0621_FluidR3_GM_sf2_file", "0621_Aspirin_sf2_file", "0622_GeneralUserGS_sf2_file", "0622_FluidR3_GM_sf2_file"],
  63: ["0630_GeneralUserGS_sf2_file", "0630_FluidR3_GM_sf2_file", "0630_JCLive_sf2_file", "0630_Aspirin_sf2_file", "0630_Chaos_sf2_file", "0630_SoundBlasterOld_sf2", "0630_SBLive_sf2", "0631_GeneralUserGS_sf2_file", "0631_FluidR3_GM_sf2_file", "0631_Aspirin_sf2_file", "0632_FluidR3_GM_sf2_file", "0633_FluidR3_GM_sf2_file"],
  64: ["0640_GeneralUserGS_sf2_file", "0640_FluidR3_GM_sf2_file", "0640_JCLive_sf2_file", "0640_Aspirin_sf2_file", "0640_Chaos_sf2_file", "0640_SoundBlasterOld_sf2", "0640_SBLive_sf2", "0641_FluidR3_GM_sf2_file"],
  65: ["0650_GeneralUserGS_sf2_file", "0650_FluidR3_GM_sf2_file", "0650_JCLive_sf2_file", "0650_Aspirin_sf2_file", "0650_Chaos_sf2_file", "0650_SoundBlasterOld_sf2", "0650_SBLive_sf2", "0651_FluidR3_GM_sf2_file", "0651_Aspirin_sf2_file"],
  66: ["0660_GeneralUserGS_sf2_file", "0660_FluidR3_GM_sf2_file", "0660_JCLive_sf2_file", "0660_Aspirin_sf2_file", "0660_Chaos_sf2_file", "0660_SoundBlasterOld_sf2", "0660_SBLive_sf2", "0661_GeneralUserGS_sf2_file", "0661_FluidR3_GM_sf2_file"],
  67: ["0670_GeneralUserGS_sf2_file", "0670_FluidR3_GM_sf2_file", "0670_JCLive_sf2_file", "0670_Aspirin_sf2_file", "0670_Chaos_sf2_file", "0670_SoundBlasterOld_sf2", "0670_SBLive_sf2", "0671_FluidR3_GM_sf2_file"],
  68: ["0680_GeneralUserGS_sf2_file", "0680_FluidR3_GM_sf2_file", "0680_JCLive_sf2_file", "0680_Aspirin_sf2_file", "0680_Chaos_sf2_file", "0680_SoundBlasterOld_sf2", "0680_SBLive_sf2", "0681_FluidR3_GM_sf2_file"],
  70: ["0700_GeneralUserGS_sf2_file", "0700_FluidR3_GM_sf2_file", "0700_JCLive_sf2_file", "0700_Aspirin_sf2_file", "0700_Chaos_sf2_file", "0700_SoundBlasterOld_sf2", "0700_SBLive_sf2", "0701_GeneralUserGS_sf2_file", "0701_FluidR3_GM_sf2_file"],
  71: ["0710_GeneralUserGS_sf2_file", "0710_FluidR3_GM_sf2_file", "0710_JCLive_sf2_file", "0710_Aspirin_sf2_file", "0710_Chaos_sf2_file", "0710_SoundBlasterOld_sf2", "0710_SBLive_sf2", "0711_FluidR3_GM_sf2_file"],
  72: ["0720_GeneralUserGS_sf2_file", "0720_FluidR3_GM_sf2_file", "0720_JCLive_sf2_file", "0720_Aspirin_sf2_file", "0720_Chaos_sf2_file", "0720_SoundBlasterOld_sf2", "0720_SBLive_sf2", "0721_FluidR3_GM_sf2_file", "0721_SoundBlasterOld_sf2"],
  73: ["0730_GeneralUserGS_sf2_file", "0730_FluidR3_GM_sf2_file", "0730_JCLive_sf2_file", "0730_Aspirin_sf2_file", "0730_Chaos_sf2_file", "0730_SoundBlasterOld_sf2", "0730_SBLive_sf2", "0731_FluidR3_GM_sf2_file", "0731_Aspirin_sf2_file", "0731_SoundBlasterOld_sf2"],
  75: ["0750_GeneralUserGS_sf2_file", "0750_FluidR3_GM_sf2_file", "0750_JCLive_sf2_file", "0750_Aspirin_sf2_file", "0750_Chaos_sf2_file", "0750_SoundBlasterOld_sf2", "0750_SBLive_sf2", "0751_GeneralUserGS_sf2_file", "0751_FluidR3_GM_sf2_file", "0751_Aspirin_sf2_file", "0751_SoundBlasterOld_sf2"],
  77: ["0770_GeneralUserGS_sf2_file", "0770_FluidR3_GM_sf2_file", "0770_JCLive_sf2_file", "0770_Aspirin_sf2_file", "0770_Chaos_sf2_file", "0770_SoundBlasterOld_sf2", "0770_SBLive_sf2", "0771_GeneralUserGS_sf2_file", "0771_FluidR3_GM_sf2_file", "0772_GeneralUserGS_sf2_file"],
  82: ["0820_GeneralUserGS_sf2_file", "0820_FluidR3_GM_sf2_file", "0820_JCLive_sf2_file", "0820_Aspirin_sf2_file", "0820_Chaos_sf2_file", "0820_SoundBlasterOld_sf2", "0820_SBLive_sf2", "0821_GeneralUserGS_sf2_file", "0821_FluidR3_GM_sf2_file", "0821_SoundBlasterOld_sf2", "0822_GeneralUserGS_sf2_file", "0823_GeneralUserGS_sf2_file"],
  88: ["0880_GeneralUserGS_sf2_file", "0880_FluidR3_GM_sf2_file", "0880_JCLive_sf2_file", "0880_Aspirin_sf2_file", "0880_Chaos_sf2_file", "0880_SoundBlasterOld_sf2", "0880_SBLive_sf2", "0881_GeneralUserGS_sf2_file", "0881_FluidR3_GM_sf2_file", "0881_Aspirin_sf2_file", "0881_SoundBlasterOld_sf2", "0882_GeneralUserGS_sf2_file", "0882_FluidR3_GM_sf2_file", "0882_Aspirin_sf2_file", "0883_GeneralUserGS_sf2_file", "0884_GeneralUserGS_sf2_file", "0885_GeneralUserGS_sf2_file", "0886_GeneralUserGS_sf2_file", "0887_GeneralUserGS_sf2_file", "0888_GeneralUserGS_sf2_file", "0889_GeneralUserGS_sf2_file"],
  89: ["0890_GeneralUserGS_sf2_file", "0890_FluidR3_GM_sf2_file", "0890_JCLive_sf2_file", "0890_Aspirin_sf2_file", "0890_Chaos_sf2_file", "0890_SoundBlasterOld_sf2", "0890_SBLive_sf2", "0891_GeneralUserGS_sf2_file", "0891_FluidR3_GM_sf2_file", "0891_Aspirin_sf2_file"],
  91: ["0910_GeneralUserGS_sf2_file", "0910_FluidR3_GM_sf2_file", "0910_JCLive_sf2_file", "0910_Aspirin_sf2_file", "0910_Chaos_sf2_file", "0910_SoundBlasterOld_sf2", "0910_SBLive_sf2", "0911_GeneralUserGS_sf2_file", "0911_JCLive_sf2_file", "0911_Aspirin_sf2_file", "0911_SoundBlasterOld_sf2"],
  96: ["0960_GeneralUserGS_sf2_file", "0960_FluidR3_GM_sf2_file", "0960_JCLive_sf2_file", "0960_Aspirin_sf2_file", "0960_Chaos_sf2_file", "0960_SoundBlasterOld_sf2", "0960_SBLive_sf2", "0961_GeneralUserGS_sf2_file", "0961_FluidR3_GM_sf2_file", "0961_Aspirin_sf2_file", "0961_SoundBlasterOld_sf2", "0962_GeneralUserGS_sf2_file"],
  99: ["0990_GeneralUserGS_sf2_file", "0990_FluidR3_GM_sf2_file", "0990_JCLive_sf2_file", "0990_Aspirin_sf2_file", "0990_Chaos_sf2_file", "0990_SoundBlasterOld_sf2", "0990_SBLive_sf2", "0991_GeneralUserGS_sf2_file", "0991_FluidR3_GM_sf2_file", "0991_JCLive_sf2_file", "0991_Aspirin_sf2_file", "0991_SoundBlasterOld_sf2", "0992_FluidR3_GM_sf2_file", "0992_JCLive_sf2_file", "0993_JCLive_sf2_file", "0994_JCLive_sf2_file"],
  100: ["1000_GeneralUserGS_sf2_file", "1000_FluidR3_GM_sf2_file", "1000_JCLive_sf2_file", "1000_Aspirin_sf2_file", "1000_Chaos_sf2_file", "1000_SoundBlasterOld_sf2", "1000_SBLive_sf2", "1001_GeneralUserGS_sf2_file", "1001_FluidR3_GM_sf2_file", "1001_JCLive_sf2_file", "1001_Aspirin_sf2_file", "1001_SoundBlasterOld_sf2", "1002_GeneralUserGS_sf2_file", "1002_FluidR3_GM_sf2_file", "1002_Aspirin_sf2_file"],
  103: ["1030_GeneralUserGS_sf2_file", "1030_FluidR3_GM_sf2_file", "1030_JCLive_sf2_file", "1030_Aspirin_sf2_file", "1030_Chaos_sf2_file", "1030_SoundBlasterOld_sf2", "1030_SBLive_sf2", "1031_GeneralUserGS_sf2_file", "1031_FluidR3_GM_sf2_file", "1031_Aspirin_sf2_file", "1031_SoundBlasterOld_sf2", "1032_FluidR3_GM_sf2_file"],
  105: ["1050_GeneralUserGS_sf2_file", "1050_FluidR3_GM_sf2_file", "1050_JCLive_sf2_file", "1050_Aspirin_sf2_file", "1050_Chaos_sf2_file", "1050_SoundBlasterOld_sf2", "1050_SBLive_sf2", "1051_GeneralUserGS_sf2_file"],
  113: ["1130_GeneralUserGS_sf2_file", "1130_FluidR3_GM_sf2_file", "1130_JCLive_sf2_file", "1130_Aspirin_sf2_file", "1130_Chaos_sf2_file", "1130_SoundBlasterOld_sf2", "1130_SBLive_sf2", "1131_FluidR3_GM_sf2_file", "1131_SoundBlasterOld_sf2"],
};

/** Piezas de percusión: nota MIDI → mapa de kit/fuente disponible. */
export interface WafDrumCoverage {
  note: number;
  variants: string[];
}

/** Kits GM cubiertos por WebAudioFont (el índice no publica otros). */
export const WAF_DRUM_KITS: Record<number, string> = {
  0: "Standard",
  8: "Room",
  16: "Power",
  20: "Electronic",
  21: "TR-808",
  22: "Jazz",
  27: "Brush",
  30: "Orchestra",
};

/**
 * Cobertura de percusión por nota MIDI (canal 10). Cada entrada lista los ids
 * `128<nota>_<kit>_<Fuente>` que EXISTEN (HEAD 200 verificado), ordenados por
 * kit y luego por prioridad de fuente.
 *
 * `variants: []` = la nota no existe en NINGÚN kit ni fuente de WebAudioFont.
 * La app tiene que resolverla con otra fuente (FreePats World Percussion, kit
 * propio) y asumir el silencio si no hay ninguna — está listado acá justamente
 * para que ese caso no termine en un sintetizador de relleno.
 */
export const WAF_DRUMS: WafDrumCoverage[] = [
  { note: 1, variants: [] },
  { note: 24, variants: [] },
  { note: 29, variants: [] },
  { note: 31, variants: [] },
  { note: 32, variants: [] },
  { note: 33, variants: [] },
  { note: 35, variants: ["12835_0_FluidR3_GM_sf2_file", "12835_0_JCLive_sf2_file", "12835_0_Chaos_sf2_file", "12835_0_SBLive_sf2", "12835_8_FluidR3_GM_sf2_file", "12835_8_JCLive_sf2_file", "12835_8_Chaos_sf2_file", "12835_16_FluidR3_GM_sf2_file", "12835_16_JCLive_sf2_file", "12835_20_FluidR3_GM_sf2_file", "12835_20_JCLive_sf2_file", "12835_21_FluidR3_GM_sf2_file", "12835_21_JCLive_sf2_file", "12835_22_FluidR3_GM_sf2_file", "12835_22_JCLive_sf2_file", "12835_27_FluidR3_GM_sf2_file", "12835_27_JCLive_sf2_file", "12835_30_FluidR3_GM_sf2_file"] },
  { note: 36, variants: ["12836_0_FluidR3_GM_sf2_file", "12836_0_JCLive_sf2_file", "12836_0_Chaos_sf2_file", "12836_0_SBLive_sf2", "12836_8_FluidR3_GM_sf2_file", "12836_8_JCLive_sf2_file", "12836_8_Chaos_sf2_file", "12836_16_FluidR3_GM_sf2_file", "12836_16_JCLive_sf2_file", "12836_20_FluidR3_GM_sf2_file", "12836_20_JCLive_sf2_file", "12836_21_FluidR3_GM_sf2_file", "12836_21_JCLive_sf2_file", "12836_22_FluidR3_GM_sf2_file", "12836_22_JCLive_sf2_file", "12836_27_FluidR3_GM_sf2_file", "12836_27_JCLive_sf2_file", "12836_30_FluidR3_GM_sf2_file"] },
  { note: 37, variants: ["12837_0_FluidR3_GM_sf2_file", "12837_0_JCLive_sf2_file", "12837_0_Chaos_sf2_file", "12837_0_SBLive_sf2", "12837_8_FluidR3_GM_sf2_file", "12837_8_JCLive_sf2_file", "12837_8_Chaos_sf2_file", "12837_16_FluidR3_GM_sf2_file", "12837_16_JCLive_sf2_file", "12837_20_FluidR3_GM_sf2_file", "12837_20_JCLive_sf2_file", "12837_21_FluidR3_GM_sf2_file", "12837_21_JCLive_sf2_file", "12837_22_FluidR3_GM_sf2_file", "12837_22_JCLive_sf2_file", "12837_27_FluidR3_GM_sf2_file", "12837_27_JCLive_sf2_file", "12837_30_FluidR3_GM_sf2_file"] },
  { note: 38, variants: ["12838_0_FluidR3_GM_sf2_file", "12838_0_JCLive_sf2_file", "12838_0_Chaos_sf2_file", "12838_0_SBLive_sf2", "12838_8_FluidR3_GM_sf2_file", "12838_8_JCLive_sf2_file", "12838_8_Chaos_sf2_file", "12838_16_FluidR3_GM_sf2_file", "12838_16_JCLive_sf2_file", "12838_20_FluidR3_GM_sf2_file", "12838_20_JCLive_sf2_file", "12838_21_FluidR3_GM_sf2_file", "12838_21_JCLive_sf2_file", "12838_22_FluidR3_GM_sf2_file", "12838_22_JCLive_sf2_file", "12838_27_FluidR3_GM_sf2_file", "12838_27_JCLive_sf2_file", "12838_30_FluidR3_GM_sf2_file"] },
  { note: 39, variants: ["12839_0_FluidR3_GM_sf2_file", "12839_0_JCLive_sf2_file", "12839_0_Chaos_sf2_file", "12839_0_SBLive_sf2", "12839_8_FluidR3_GM_sf2_file", "12839_8_JCLive_sf2_file", "12839_8_Chaos_sf2_file", "12839_8_SBLive_sf2", "12839_16_FluidR3_GM_sf2_file", "12839_16_JCLive_sf2_file", "12839_20_FluidR3_GM_sf2_file", "12839_20_JCLive_sf2_file", "12839_21_FluidR3_GM_sf2_file", "12839_21_JCLive_sf2_file", "12839_22_FluidR3_GM_sf2_file", "12839_22_JCLive_sf2_file", "12839_27_FluidR3_GM_sf2_file", "12839_27_JCLive_sf2_file", "12839_30_FluidR3_GM_sf2_file"] },
  { note: 40, variants: ["12840_0_FluidR3_GM_sf2_file", "12840_0_JCLive_sf2_file", "12840_0_Chaos_sf2_file", "12840_0_SBLive_sf2", "12840_8_FluidR3_GM_sf2_file", "12840_8_JCLive_sf2_file", "12840_8_Chaos_sf2_file", "12840_8_SBLive_sf2", "12840_16_FluidR3_GM_sf2_file", "12840_16_JCLive_sf2_file", "12840_20_FluidR3_GM_sf2_file", "12840_20_JCLive_sf2_file", "12840_21_FluidR3_GM_sf2_file", "12840_21_JCLive_sf2_file", "12840_22_FluidR3_GM_sf2_file", "12840_22_JCLive_sf2_file", "12840_27_FluidR3_GM_sf2_file", "12840_27_JCLive_sf2_file", "12840_30_FluidR3_GM_sf2_file"] },
  { note: 41, variants: ["12841_0_FluidR3_GM_sf2_file", "12841_0_JCLive_sf2_file", "12841_0_Chaos_sf2_file", "12841_0_SBLive_sf2", "12841_8_FluidR3_GM_sf2_file", "12841_8_JCLive_sf2_file", "12841_8_Chaos_sf2_file", "12841_8_SBLive_sf2", "12841_16_FluidR3_GM_sf2_file", "12841_16_JCLive_sf2_file", "12841_20_FluidR3_GM_sf2_file", "12841_20_JCLive_sf2_file", "12841_21_FluidR3_GM_sf2_file", "12841_21_JCLive_sf2_file", "12841_22_FluidR3_GM_sf2_file", "12841_22_JCLive_sf2_file", "12841_27_FluidR3_GM_sf2_file", "12841_27_JCLive_sf2_file", "12841_30_FluidR3_GM_sf2_file"] },
  { note: 42, variants: ["12842_0_FluidR3_GM_sf2_file", "12842_0_JCLive_sf2_file", "12842_0_Chaos_sf2_file", "12842_0_SBLive_sf2", "12842_8_FluidR3_GM_sf2_file", "12842_8_JCLive_sf2_file", "12842_8_Chaos_sf2_file", "12842_8_SBLive_sf2", "12842_16_FluidR3_GM_sf2_file", "12842_16_JCLive_sf2_file", "12842_20_FluidR3_GM_sf2_file", "12842_20_JCLive_sf2_file", "12842_21_FluidR3_GM_sf2_file", "12842_21_JCLive_sf2_file", "12842_22_FluidR3_GM_sf2_file", "12842_22_JCLive_sf2_file", "12842_27_FluidR3_GM_sf2_file", "12842_27_JCLive_sf2_file", "12842_30_FluidR3_GM_sf2_file"] },
  { note: 43, variants: ["12843_0_FluidR3_GM_sf2_file", "12843_0_JCLive_sf2_file", "12843_0_Chaos_sf2_file", "12843_0_SBLive_sf2", "12843_8_FluidR3_GM_sf2_file", "12843_8_JCLive_sf2_file", "12843_8_Chaos_sf2_file", "12843_8_SBLive_sf2", "12843_16_FluidR3_GM_sf2_file", "12843_16_JCLive_sf2_file", "12843_20_FluidR3_GM_sf2_file", "12843_20_JCLive_sf2_file", "12843_21_FluidR3_GM_sf2_file", "12843_21_JCLive_sf2_file", "12843_22_FluidR3_GM_sf2_file", "12843_22_JCLive_sf2_file", "12843_27_FluidR3_GM_sf2_file", "12843_27_JCLive_sf2_file", "12843_30_FluidR3_GM_sf2_file"] },
  { note: 44, variants: ["12844_0_FluidR3_GM_sf2_file", "12844_0_JCLive_sf2_file", "12844_0_Chaos_sf2_file", "12844_0_SBLive_sf2", "12844_8_FluidR3_GM_sf2_file", "12844_8_JCLive_sf2_file", "12844_8_Chaos_sf2_file", "12844_8_SBLive_sf2", "12844_16_FluidR3_GM_sf2_file", "12844_16_JCLive_sf2_file", "12844_20_FluidR3_GM_sf2_file", "12844_20_JCLive_sf2_file", "12844_21_FluidR3_GM_sf2_file", "12844_21_JCLive_sf2_file", "12844_22_FluidR3_GM_sf2_file", "12844_22_JCLive_sf2_file", "12844_27_FluidR3_GM_sf2_file", "12844_27_JCLive_sf2_file", "12844_30_FluidR3_GM_sf2_file"] },
  { note: 45, variants: ["12845_0_FluidR3_GM_sf2_file", "12845_0_JCLive_sf2_file", "12845_0_Chaos_sf2_file", "12845_0_SBLive_sf2", "12845_8_FluidR3_GM_sf2_file", "12845_8_JCLive_sf2_file", "12845_8_Chaos_sf2_file", "12845_8_SBLive_sf2", "12845_16_FluidR3_GM_sf2_file", "12845_16_JCLive_sf2_file", "12845_20_FluidR3_GM_sf2_file", "12845_20_JCLive_sf2_file", "12845_21_FluidR3_GM_sf2_file", "12845_21_JCLive_sf2_file", "12845_22_FluidR3_GM_sf2_file", "12845_22_JCLive_sf2_file", "12845_27_FluidR3_GM_sf2_file", "12845_27_JCLive_sf2_file", "12845_30_FluidR3_GM_sf2_file"] },
  { note: 46, variants: ["12846_0_FluidR3_GM_sf2_file", "12846_0_JCLive_sf2_file", "12846_0_Chaos_sf2_file", "12846_0_SBLive_sf2", "12846_8_FluidR3_GM_sf2_file", "12846_8_JCLive_sf2_file", "12846_8_Chaos_sf2_file", "12846_8_SBLive_sf2", "12846_16_FluidR3_GM_sf2_file", "12846_16_JCLive_sf2_file", "12846_20_FluidR3_GM_sf2_file", "12846_20_JCLive_sf2_file", "12846_21_FluidR3_GM_sf2_file", "12846_21_JCLive_sf2_file", "12846_22_FluidR3_GM_sf2_file", "12846_22_JCLive_sf2_file", "12846_27_FluidR3_GM_sf2_file", "12846_27_JCLive_sf2_file", "12846_30_FluidR3_GM_sf2_file"] },
  { note: 47, variants: ["12847_0_FluidR3_GM_sf2_file", "12847_0_JCLive_sf2_file", "12847_0_Chaos_sf2_file", "12847_0_SBLive_sf2", "12847_8_FluidR3_GM_sf2_file", "12847_8_JCLive_sf2_file", "12847_8_Chaos_sf2_file", "12847_8_SBLive_sf2", "12847_16_FluidR3_GM_sf2_file", "12847_16_JCLive_sf2_file", "12847_20_FluidR3_GM_sf2_file", "12847_20_JCLive_sf2_file", "12847_21_FluidR3_GM_sf2_file", "12847_21_JCLive_sf2_file", "12847_22_FluidR3_GM_sf2_file", "12847_22_JCLive_sf2_file", "12847_27_FluidR3_GM_sf2_file", "12847_27_JCLive_sf2_file", "12847_30_FluidR3_GM_sf2_file"] },
  { note: 48, variants: ["12848_0_FluidR3_GM_sf2_file", "12848_0_JCLive_sf2_file", "12848_0_Chaos_sf2_file", "12848_0_SBLive_sf2", "12848_8_FluidR3_GM_sf2_file", "12848_8_JCLive_sf2_file", "12848_8_Chaos_sf2_file", "12848_8_SBLive_sf2", "12848_16_FluidR3_GM_sf2_file", "12848_16_JCLive_sf2_file", "12848_20_FluidR3_GM_sf2_file", "12848_20_JCLive_sf2_file", "12848_21_FluidR3_GM_sf2_file", "12848_21_JCLive_sf2_file", "12848_22_FluidR3_GM_sf2_file", "12848_22_JCLive_sf2_file", "12848_27_FluidR3_GM_sf2_file", "12848_27_JCLive_sf2_file", "12848_30_FluidR3_GM_sf2_file"] },
  { note: 49, variants: ["12849_0_FluidR3_GM_sf2_file", "12849_0_JCLive_sf2_file", "12849_0_Chaos_sf2_file", "12849_0_SBLive_sf2", "12849_8_FluidR3_GM_sf2_file", "12849_8_JCLive_sf2_file", "12849_8_Chaos_sf2_file", "12849_8_SBLive_sf2", "12849_16_FluidR3_GM_sf2_file", "12849_16_JCLive_sf2_file", "12849_20_FluidR3_GM_sf2_file", "12849_20_JCLive_sf2_file", "12849_21_FluidR3_GM_sf2_file", "12849_21_JCLive_sf2_file", "12849_22_FluidR3_GM_sf2_file", "12849_22_JCLive_sf2_file", "12849_27_FluidR3_GM_sf2_file", "12849_27_JCLive_sf2_file", "12849_30_FluidR3_GM_sf2_file"] },
  { note: 50, variants: ["12850_0_FluidR3_GM_sf2_file", "12850_0_JCLive_sf2_file", "12850_0_Chaos_sf2_file", "12850_0_SBLive_sf2", "12850_8_FluidR3_GM_sf2_file", "12850_8_JCLive_sf2_file", "12850_8_Chaos_sf2_file", "12850_8_SBLive_sf2", "12850_16_FluidR3_GM_sf2_file", "12850_16_JCLive_sf2_file", "12850_20_FluidR3_GM_sf2_file", "12850_20_JCLive_sf2_file", "12850_21_FluidR3_GM_sf2_file", "12850_21_JCLive_sf2_file", "12850_22_FluidR3_GM_sf2_file", "12850_22_JCLive_sf2_file", "12850_27_FluidR3_GM_sf2_file", "12850_27_JCLive_sf2_file", "12850_30_FluidR3_GM_sf2_file"] },
  { note: 51, variants: ["12851_0_FluidR3_GM_sf2_file", "12851_0_JCLive_sf2_file", "12851_0_Chaos_sf2_file", "12851_0_SBLive_sf2", "12851_8_FluidR3_GM_sf2_file", "12851_8_JCLive_sf2_file", "12851_8_Chaos_sf2_file", "12851_8_SBLive_sf2", "12851_16_FluidR3_GM_sf2_file", "12851_16_JCLive_sf2_file", "12851_20_FluidR3_GM_sf2_file", "12851_20_JCLive_sf2_file", "12851_21_FluidR3_GM_sf2_file", "12851_21_JCLive_sf2_file", "12851_22_FluidR3_GM_sf2_file", "12851_22_JCLive_sf2_file", "12851_27_FluidR3_GM_sf2_file", "12851_27_JCLive_sf2_file", "12851_30_FluidR3_GM_sf2_file"] },
  { note: 52, variants: ["12852_0_FluidR3_GM_sf2_file", "12852_0_JCLive_sf2_file", "12852_0_Chaos_sf2_file", "12852_0_SBLive_sf2", "12852_8_FluidR3_GM_sf2_file", "12852_8_JCLive_sf2_file", "12852_8_Chaos_sf2_file", "12852_8_SBLive_sf2", "12852_16_FluidR3_GM_sf2_file", "12852_16_JCLive_sf2_file", "12852_20_FluidR3_GM_sf2_file", "12852_20_JCLive_sf2_file", "12852_21_FluidR3_GM_sf2_file", "12852_21_JCLive_sf2_file", "12852_22_FluidR3_GM_sf2_file", "12852_22_JCLive_sf2_file", "12852_27_FluidR3_GM_sf2_file", "12852_27_JCLive_sf2_file", "12852_30_FluidR3_GM_sf2_file"] },
  { note: 53, variants: ["12853_0_FluidR3_GM_sf2_file", "12853_0_JCLive_sf2_file", "12853_0_Chaos_sf2_file", "12853_0_SBLive_sf2", "12853_8_FluidR3_GM_sf2_file", "12853_8_JCLive_sf2_file", "12853_8_Chaos_sf2_file", "12853_8_SBLive_sf2", "12853_16_FluidR3_GM_sf2_file", "12853_16_JCLive_sf2_file", "12853_20_FluidR3_GM_sf2_file", "12853_20_JCLive_sf2_file", "12853_21_FluidR3_GM_sf2_file", "12853_21_JCLive_sf2_file", "12853_22_FluidR3_GM_sf2_file", "12853_22_JCLive_sf2_file", "12853_27_FluidR3_GM_sf2_file", "12853_27_JCLive_sf2_file", "12853_30_FluidR3_GM_sf2_file"] },
  { note: 54, variants: ["12854_0_FluidR3_GM_sf2_file", "12854_0_JCLive_sf2_file", "12854_0_Chaos_sf2_file", "12854_0_SBLive_sf2", "12854_8_FluidR3_GM_sf2_file", "12854_8_JCLive_sf2_file", "12854_8_Chaos_sf2_file", "12854_8_SBLive_sf2", "12854_16_FluidR3_GM_sf2_file", "12854_16_JCLive_sf2_file", "12854_20_FluidR3_GM_sf2_file", "12854_20_JCLive_sf2_file", "12854_21_FluidR3_GM_sf2_file", "12854_21_JCLive_sf2_file", "12854_22_FluidR3_GM_sf2_file", "12854_22_JCLive_sf2_file", "12854_27_FluidR3_GM_sf2_file", "12854_27_JCLive_sf2_file", "12854_30_FluidR3_GM_sf2_file"] },
  { note: 55, variants: ["12855_0_FluidR3_GM_sf2_file", "12855_0_JCLive_sf2_file", "12855_0_Chaos_sf2_file", "12855_0_SBLive_sf2", "12855_8_FluidR3_GM_sf2_file", "12855_8_JCLive_sf2_file", "12855_8_Chaos_sf2_file", "12855_8_SBLive_sf2", "12855_16_FluidR3_GM_sf2_file", "12855_16_JCLive_sf2_file", "12855_20_FluidR3_GM_sf2_file", "12855_20_JCLive_sf2_file", "12855_21_FluidR3_GM_sf2_file", "12855_21_JCLive_sf2_file", "12855_22_FluidR3_GM_sf2_file", "12855_22_JCLive_sf2_file", "12855_27_FluidR3_GM_sf2_file", "12855_27_JCLive_sf2_file", "12855_30_FluidR3_GM_sf2_file"] },
  { note: 56, variants: ["12856_0_FluidR3_GM_sf2_file", "12856_0_JCLive_sf2_file", "12856_0_Chaos_sf2_file", "12856_0_SBLive_sf2", "12856_8_FluidR3_GM_sf2_file", "12856_8_JCLive_sf2_file", "12856_8_Chaos_sf2_file", "12856_8_SBLive_sf2", "12856_16_FluidR3_GM_sf2_file", "12856_16_JCLive_sf2_file", "12856_20_FluidR3_GM_sf2_file", "12856_20_JCLive_sf2_file", "12856_21_FluidR3_GM_sf2_file", "12856_21_JCLive_sf2_file", "12856_22_FluidR3_GM_sf2_file", "12856_22_JCLive_sf2_file", "12856_27_FluidR3_GM_sf2_file", "12856_27_JCLive_sf2_file", "12856_30_FluidR3_GM_sf2_file"] },
  { note: 57, variants: ["12857_0_FluidR3_GM_sf2_file", "12857_0_JCLive_sf2_file", "12857_0_Chaos_sf2_file", "12857_0_SBLive_sf2", "12857_8_FluidR3_GM_sf2_file", "12857_8_JCLive_sf2_file", "12857_8_Chaos_sf2_file", "12857_8_SBLive_sf2", "12857_16_FluidR3_GM_sf2_file", "12857_16_JCLive_sf2_file", "12857_20_FluidR3_GM_sf2_file", "12857_20_JCLive_sf2_file", "12857_21_FluidR3_GM_sf2_file", "12857_21_JCLive_sf2_file", "12857_22_FluidR3_GM_sf2_file", "12857_22_JCLive_sf2_file", "12857_27_FluidR3_GM_sf2_file", "12857_27_JCLive_sf2_file", "12857_30_FluidR3_GM_sf2_file"] },
  { note: 58, variants: ["12858_0_FluidR3_GM_sf2_file", "12858_0_JCLive_sf2_file", "12858_0_Chaos_sf2_file", "12858_0_SBLive_sf2", "12858_8_FluidR3_GM_sf2_file", "12858_8_JCLive_sf2_file", "12858_8_Chaos_sf2_file", "12858_8_SBLive_sf2", "12858_16_FluidR3_GM_sf2_file", "12858_16_JCLive_sf2_file", "12858_20_FluidR3_GM_sf2_file", "12858_20_JCLive_sf2_file", "12858_21_JCLive_sf2_file", "12858_22_FluidR3_GM_sf2_file", "12858_22_JCLive_sf2_file", "12858_27_FluidR3_GM_sf2_file", "12858_27_JCLive_sf2_file", "12858_30_FluidR3_GM_sf2_file"] },
  { note: 59, variants: ["12859_0_FluidR3_GM_sf2_file", "12859_0_JCLive_sf2_file", "12859_0_Chaos_sf2_file", "12859_0_SBLive_sf2", "12859_8_FluidR3_GM_sf2_file", "12859_8_JCLive_sf2_file", "12859_8_Chaos_sf2_file", "12859_8_SBLive_sf2", "12859_16_FluidR3_GM_sf2_file", "12859_16_JCLive_sf2_file", "12859_20_FluidR3_GM_sf2_file", "12859_20_JCLive_sf2_file", "12859_21_FluidR3_GM_sf2_file", "12859_21_JCLive_sf2_file", "12859_22_FluidR3_GM_sf2_file", "12859_22_JCLive_sf2_file", "12859_27_FluidR3_GM_sf2_file", "12859_27_JCLive_sf2_file", "12859_30_FluidR3_GM_sf2_file"] },
  { note: 60, variants: ["12860_0_FluidR3_GM_sf2_file", "12860_0_JCLive_sf2_file", "12860_0_Chaos_sf2_file", "12860_0_SBLive_sf2", "12860_8_FluidR3_GM_sf2_file", "12860_8_JCLive_sf2_file", "12860_8_Chaos_sf2_file", "12860_8_SBLive_sf2", "12860_16_FluidR3_GM_sf2_file", "12860_16_JCLive_sf2_file", "12860_20_FluidR3_GM_sf2_file", "12860_20_JCLive_sf2_file", "12860_21_FluidR3_GM_sf2_file", "12860_21_JCLive_sf2_file", "12860_22_FluidR3_GM_sf2_file", "12860_22_JCLive_sf2_file", "12860_27_FluidR3_GM_sf2_file", "12860_27_JCLive_sf2_file", "12860_30_FluidR3_GM_sf2_file"] },
  { note: 61, variants: ["12861_0_FluidR3_GM_sf2_file", "12861_0_JCLive_sf2_file", "12861_0_Chaos_sf2_file", "12861_0_SBLive_sf2", "12861_8_FluidR3_GM_sf2_file", "12861_8_JCLive_sf2_file", "12861_8_Chaos_sf2_file", "12861_8_SBLive_sf2", "12861_16_FluidR3_GM_sf2_file", "12861_16_JCLive_sf2_file", "12861_20_FluidR3_GM_sf2_file", "12861_20_JCLive_sf2_file", "12861_21_FluidR3_GM_sf2_file", "12861_21_JCLive_sf2_file", "12861_22_FluidR3_GM_sf2_file", "12861_22_JCLive_sf2_file", "12861_27_FluidR3_GM_sf2_file", "12861_27_JCLive_sf2_file", "12861_30_FluidR3_GM_sf2_file"] },
  { note: 62, variants: ["12862_0_FluidR3_GM_sf2_file", "12862_0_JCLive_sf2_file", "12862_0_Chaos_sf2_file", "12862_0_SBLive_sf2", "12862_8_FluidR3_GM_sf2_file", "12862_8_JCLive_sf2_file", "12862_8_Chaos_sf2_file", "12862_8_SBLive_sf2", "12862_16_FluidR3_GM_sf2_file", "12862_16_JCLive_sf2_file", "12862_20_FluidR3_GM_sf2_file", "12862_20_JCLive_sf2_file", "12862_21_FluidR3_GM_sf2_file", "12862_21_JCLive_sf2_file", "12862_22_FluidR3_GM_sf2_file", "12862_22_JCLive_sf2_file", "12862_27_FluidR3_GM_sf2_file", "12862_27_JCLive_sf2_file", "12862_30_FluidR3_GM_sf2_file"] },
  { note: 63, variants: ["12863_0_FluidR3_GM_sf2_file", "12863_0_JCLive_sf2_file", "12863_0_Chaos_sf2_file", "12863_0_SBLive_sf2", "12863_8_FluidR3_GM_sf2_file", "12863_8_JCLive_sf2_file", "12863_8_Chaos_sf2_file", "12863_8_SBLive_sf2", "12863_16_FluidR3_GM_sf2_file", "12863_16_JCLive_sf2_file", "12863_20_FluidR3_GM_sf2_file", "12863_20_JCLive_sf2_file", "12863_21_FluidR3_GM_sf2_file", "12863_21_JCLive_sf2_file", "12863_22_FluidR3_GM_sf2_file", "12863_22_JCLive_sf2_file", "12863_27_FluidR3_GM_sf2_file", "12863_27_JCLive_sf2_file", "12863_30_FluidR3_GM_sf2_file"] },
  { note: 64, variants: ["12864_0_FluidR3_GM_sf2_file", "12864_0_JCLive_sf2_file", "12864_0_Chaos_sf2_file", "12864_0_SBLive_sf2", "12864_8_FluidR3_GM_sf2_file", "12864_8_JCLive_sf2_file", "12864_8_Chaos_sf2_file", "12864_8_SBLive_sf2", "12864_16_FluidR3_GM_sf2_file", "12864_16_JCLive_sf2_file", "12864_20_FluidR3_GM_sf2_file", "12864_20_JCLive_sf2_file", "12864_21_FluidR3_GM_sf2_file", "12864_21_JCLive_sf2_file", "12864_22_FluidR3_GM_sf2_file", "12864_22_JCLive_sf2_file", "12864_27_FluidR3_GM_sf2_file", "12864_27_JCLive_sf2_file", "12864_30_FluidR3_GM_sf2_file"] },
  { note: 65, variants: ["12865_0_FluidR3_GM_sf2_file", "12865_0_JCLive_sf2_file", "12865_0_Chaos_sf2_file", "12865_0_SBLive_sf2", "12865_8_FluidR3_GM_sf2_file", "12865_8_JCLive_sf2_file", "12865_8_Chaos_sf2_file", "12865_8_SBLive_sf2", "12865_16_FluidR3_GM_sf2_file", "12865_16_JCLive_sf2_file", "12865_20_FluidR3_GM_sf2_file", "12865_20_JCLive_sf2_file", "12865_21_JCLive_sf2_file", "12865_22_FluidR3_GM_sf2_file", "12865_22_JCLive_sf2_file", "12865_27_FluidR3_GM_sf2_file", "12865_27_JCLive_sf2_file", "12865_30_FluidR3_GM_sf2_file"] },
  { note: 66, variants: ["12866_0_FluidR3_GM_sf2_file", "12866_0_JCLive_sf2_file", "12866_0_Chaos_sf2_file", "12866_0_SBLive_sf2", "12866_8_FluidR3_GM_sf2_file", "12866_8_JCLive_sf2_file", "12866_8_Chaos_sf2_file", "12866_8_SBLive_sf2", "12866_16_FluidR3_GM_sf2_file", "12866_16_JCLive_sf2_file", "12866_20_FluidR3_GM_sf2_file", "12866_20_JCLive_sf2_file", "12866_21_JCLive_sf2_file", "12866_22_FluidR3_GM_sf2_file", "12866_22_JCLive_sf2_file", "12866_27_FluidR3_GM_sf2_file", "12866_27_JCLive_sf2_file", "12866_30_FluidR3_GM_sf2_file"] },
  { note: 67, variants: ["12867_0_FluidR3_GM_sf2_file", "12867_0_JCLive_sf2_file", "12867_0_Chaos_sf2_file", "12867_0_SBLive_sf2", "12867_8_FluidR3_GM_sf2_file", "12867_8_JCLive_sf2_file", "12867_8_Chaos_sf2_file", "12867_8_SBLive_sf2", "12867_16_FluidR3_GM_sf2_file", "12867_16_JCLive_sf2_file", "12867_20_FluidR3_GM_sf2_file", "12867_20_JCLive_sf2_file", "12867_21_FluidR3_GM_sf2_file", "12867_21_JCLive_sf2_file", "12867_22_FluidR3_GM_sf2_file", "12867_22_JCLive_sf2_file", "12867_27_FluidR3_GM_sf2_file", "12867_27_JCLive_sf2_file", "12867_30_FluidR3_GM_sf2_file"] },
  { note: 68, variants: ["12868_0_FluidR3_GM_sf2_file", "12868_0_JCLive_sf2_file", "12868_0_Chaos_sf2_file", "12868_0_SBLive_sf2", "12868_8_FluidR3_GM_sf2_file", "12868_8_JCLive_sf2_file", "12868_8_Chaos_sf2_file", "12868_8_SBLive_sf2", "12868_16_FluidR3_GM_sf2_file", "12868_16_JCLive_sf2_file", "12868_20_FluidR3_GM_sf2_file", "12868_20_JCLive_sf2_file", "12868_21_FluidR3_GM_sf2_file", "12868_21_JCLive_sf2_file", "12868_22_FluidR3_GM_sf2_file", "12868_22_JCLive_sf2_file", "12868_27_FluidR3_GM_sf2_file", "12868_27_JCLive_sf2_file", "12868_30_FluidR3_GM_sf2_file"] },
  { note: 69, variants: ["12869_0_FluidR3_GM_sf2_file", "12869_0_JCLive_sf2_file", "12869_0_Chaos_sf2_file", "12869_0_SBLive_sf2", "12869_8_FluidR3_GM_sf2_file", "12869_8_JCLive_sf2_file", "12869_8_Chaos_sf2_file", "12869_8_SBLive_sf2", "12869_16_FluidR3_GM_sf2_file", "12869_16_JCLive_sf2_file", "12869_20_FluidR3_GM_sf2_file", "12869_20_JCLive_sf2_file", "12869_21_FluidR3_GM_sf2_file", "12869_21_JCLive_sf2_file", "12869_22_FluidR3_GM_sf2_file", "12869_22_JCLive_sf2_file", "12869_27_FluidR3_GM_sf2_file", "12869_27_JCLive_sf2_file", "12869_30_FluidR3_GM_sf2_file"] },
  { note: 70, variants: ["12870_0_FluidR3_GM_sf2_file", "12870_0_JCLive_sf2_file", "12870_0_Chaos_sf2_file", "12870_0_SBLive_sf2", "12870_8_FluidR3_GM_sf2_file", "12870_8_JCLive_sf2_file", "12870_8_Chaos_sf2_file", "12870_8_SBLive_sf2", "12870_16_FluidR3_GM_sf2_file", "12870_16_JCLive_sf2_file", "12870_20_FluidR3_GM_sf2_file", "12870_20_JCLive_sf2_file", "12870_21_FluidR3_GM_sf2_file", "12870_21_JCLive_sf2_file", "12870_22_FluidR3_GM_sf2_file", "12870_22_JCLive_sf2_file", "12870_27_FluidR3_GM_sf2_file", "12870_27_JCLive_sf2_file", "12870_30_FluidR3_GM_sf2_file"] },
  { note: 73, variants: ["12873_0_FluidR3_GM_sf2_file", "12873_0_JCLive_sf2_file", "12873_0_Chaos_sf2_file", "12873_0_SBLive_sf2", "12873_8_FluidR3_GM_sf2_file", "12873_8_JCLive_sf2_file", "12873_8_Chaos_sf2_file", "12873_8_SBLive_sf2", "12873_16_FluidR3_GM_sf2_file", "12873_16_JCLive_sf2_file", "12873_20_FluidR3_GM_sf2_file", "12873_20_JCLive_sf2_file", "12873_21_FluidR3_GM_sf2_file", "12873_21_JCLive_sf2_file", "12873_22_FluidR3_GM_sf2_file", "12873_22_JCLive_sf2_file", "12873_27_FluidR3_GM_sf2_file", "12873_27_JCLive_sf2_file", "12873_30_FluidR3_GM_sf2_file"] },
  { note: 74, variants: ["12874_0_FluidR3_GM_sf2_file", "12874_0_JCLive_sf2_file", "12874_0_Chaos_sf2_file", "12874_0_SBLive_sf2", "12874_8_FluidR3_GM_sf2_file", "12874_8_JCLive_sf2_file", "12874_8_Chaos_sf2_file", "12874_8_SBLive_sf2", "12874_16_FluidR3_GM_sf2_file", "12874_16_JCLive_sf2_file", "12874_20_FluidR3_GM_sf2_file", "12874_20_JCLive_sf2_file", "12874_21_FluidR3_GM_sf2_file", "12874_21_JCLive_sf2_file", "12874_22_FluidR3_GM_sf2_file", "12874_22_JCLive_sf2_file", "12874_27_FluidR3_GM_sf2_file", "12874_27_JCLive_sf2_file", "12874_30_FluidR3_GM_sf2_file"] },
  { note: 82, variants: [] },
];

/** Programas que se usan en la biblioteca: id → nombre GM. */
export const WAF_NEEDED_PROGRAMS: Record<number, string> = {
  0: "Acoustic Grand Piano",
  1: "Bright Acoustic Piano",
  2: "Electric Grand Piano",
  3: "Honky-tonk Piano",
  4: "Electric Piano 1",
  5: "Electric Piano 2",
  8: "Clavi",
  10: "Music Box",
  11: "Vibraphone",
  12: "Marimba",
  13: "Xylophone",
  15: "Dulcimer",
  16: "Drawbar Organ",
  17: "Percussive Organ",
  18: "Rock Organ",
  21: "Accordion",
  22: "Harmonica",
  23: "Tango Accordion",
  24: "Acoustic Guitar (nylon)",
  25: "Acoustic Guitar (steel)",
  26: "Electric Guitar (jazz)",
  27: "Electric Guitar (clean)",
  28: "Electric Guitar (muted)",
  29: "Overdriven Guitar",
  30: "Distortion Guitar",
  32: "Acoustic Bass",
  33: "Electric Bass (finger)",
  34: "Electric Bass (pick)",
  35: "Fretless Bass",
  36: "Slap Bass 1",
  37: "Slap Bass 2",
  39: "Synth Bass 2",
  40: "Violin",
  44: "Tremolo Strings",
  45: "Pizzicato Strings",
  46: "Orchestral Harp",
  47: "Timpani",
  48: "String Ensemble 1",
  49: "String Ensemble 2",
  50: "SynthStrings 1",
  51: "SynthStrings 2",
  52: "Choir Aahs",
  53: "Voice Oohs",
  54: "Synth Voice",
  56: "Trumpet",
  57: "Trombone",
  58: "Tuba",
  59: "Muted Trumpet",
  60: "French Horn",
  61: "Brass Section",
  62: "SynthBrass 1",
  63: "SynthBrass 2",
  64: "Soprano Sax",
  65: "Alto Sax",
  66: "Tenor Sax",
  67: "Baritone Sax",
  68: "Oboe",
  70: "Bassoon",
  71: "Clarinet",
  72: "Piccolo",
  73: "Flute",
  75: "Pan Flute",
  77: "Shakuhachi",
  82: "Lead 3 (calliope)",
  88: "Pad 1 (new age)",
  89: "Pad 2 (warm)",
  91: "Pad 5 (bowed)",
  96: "FX 1 (rain)",
  99: "FX 4 (atmosphere)",
  100: "FX 5 (brightness)",
  103: "FX 8 (sci-fi)",
  105: "Sitar",
  113: "Agogo",
};
