// Descubrimiento del catalogo de salsa brava en karaokegratis.com.ar
//
// karaokegratis sirve un .zip por cancion (contiene un .kar = MIDI karaoke) en
// /wp-content/uploads/2018/06/<Artista> - <Cancion>.zip, sin registro.
// Es la misma fuente que uso scripts/boleros-download.mjs para el pack de boleros.
//
// Este script NO descarga: solo mapea post -> zip y escribe el jobs.json que
// consume el descargador.
//
// Uso: node scripts/salsa-discover.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const SITE = 'https://www.karaokegratis.com.ar';
const OUT_JOBS = path.resolve('scripts/salsa-brava.jobs.json');

const get = async (u) => {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    return { s: r.status, t: await r.text() };
  } catch (e) {
    return { s: 'ERR', t: '', e: e.message };
  }
};

/**
 * Posts candidatos: se buscan por titulo con el buscador de WordPress y se
 * confirman leyendo la pagina (que es donde vive el link al .zip).
 * `want` es el nombre canonico del ranking para el nombre de archivo final.
 * @type {{q: string, want: string, artista: string}[]}
 */
const CANDIDATOS = [
  // ── Nivel 1: autores del canon ──
  { q: 'ruben blades pedro navaja', want: 'Pedro Navaja', artista: 'Ruben Blades & Willie Colon' },
  { q: 'celia cruz quimbara', want: 'Quimbara', artista: 'Celia Cruz & Johnny Pacheco' },
  { q: 'cheo feliciano anacaona', want: 'Anacaona', artista: 'Cheo Feliciano' },
  { q: 'hector lavoe el cantante', want: 'El Cantante', artista: 'Hector Lavoe' },
  { q: 'ruben blades plastico', want: 'Plastico', artista: 'Ruben Blades & Willie Colon' },
  // ── Ismael Rivera ──
  { q: 'ismael rivera las caras lindas', want: 'Las Caras Lindas', artista: 'Ismael Rivera' },
  { q: 'ismael rivera el nazareno', want: 'El Nazareno', artista: 'Ismael Rivera' },
  { q: 'ismael rivera mi jaragual', want: 'Mi Jaragual', artista: 'Ismael Rivera' },
  { q: 'ismael rivera es tarde', want: 'Es Tarde', artista: 'Ismael Rivera' },
  // ── Cheo Feliciano ──
  { q: 'cheo feliciano el raton', want: 'El Raton', artista: 'Cheo Feliciano' },
  // ── Sonora Poncena ──
  { q: 'sonora poncena fuego en el 23', want: 'Fuego En El 23', artista: 'La Sonora Poncena' },
  // ── El Gran Combo ──
  { q: 'gran combo de puerto rico brujeria', want: 'Brujeria', artista: 'El Gran Combo' },
  { q: 'gran combo nido de amor', want: 'Nido De Amor', artista: 'El Gran Combo' },
  // ── Willie Colon ──
  { q: 'willie colon el gran varon', want: 'El Gran Varon', artista: 'Willie Colon' },
  // ── Ruben Blades ──
  { q: 'ruben blades juan pachanga', want: 'Juan Pachanga', artista: 'Ruben Blades' },
  { q: 'ruben blades sin tu carino', want: 'Sin Tu Carino', artista: 'Ruben Blades' },
  { q: 'ruben blades creo en ti', want: 'Creo En Ti', artista: 'Ruben Blades' },
  { q: 'ruben blades decisiones', want: 'Decisiones', artista: 'Ruben Blades' },
  // ── Celia Cruz ──
  { q: 'celia cruz burundanga', want: 'Burundanga', artista: 'Celia Cruz' },
  { q: 'celia cruz la vida es un carnaval', want: 'La Vida Es Un Carnaval', artista: 'Celia Cruz' },
  // ── Hector Lavoe ──
  { q: 'hector lavoe todo me gusta de ti', want: 'Todo Me Gusta De Ti', artista: 'Hector Lavoe' },
  // ── varios ──
  { q: 'varios el cantante', want: 'El Cantante (varios)', artista: 'Varios' },
  { q: 'ruben blades y mana sabanas frias', want: 'Sabanas Frias', artista: 'Ruben Blades & Mana' },
  // ── ampliacion: resto del canon y clasicos bailables ──
  { q: 'tito puente oye como va', want: 'Oye Como Va', artista: 'Tito Puente' },
  { q: 'tito puente ran kan kan', want: 'Ran Kan Kan', artista: 'Tito Puente' },
  { q: 'celia cruz yo vivire', want: 'Yo Vivire', artista: 'Celia Cruz' },
  { q: 'celia cruz la negra tiene tumbao', want: 'La Negra Tiene Tumbao', artista: 'Celia Cruz' },
  { q: 'oscar dleon lloraras', want: 'Lloraras', artista: 'Oscar D Leon' },
  { q: 'oscar dleon calculadora', want: 'Calculadora', artista: 'Oscar D Leon' },
  { q: 'oscar dleon detalles', want: 'Detalles', artista: 'Oscar D Leon' },
  { q: 'ruben blades amor y control', want: 'Amor Y Control', artista: 'Ruben Blades' },
  { q: 'ruben blades el padre antonio', want: 'El Padre Antonio', artista: 'Ruben Blades' },
  { q: 'ruben blades ligia elena', want: 'Ligia Elena', artista: 'Ruben Blades' },
  { q: 'ruben blades maestra vida', want: 'Maestra Vida', artista: 'Ruben Blades' },
  { q: 'ruben blades tiburon', want: 'Tiburon', artista: 'Ruben Blades' },
  { q: 'ruben blades ojos de perro azul', want: 'Ojos De Perro Azul', artista: 'Ruben Blades' },
  { q: 'hector lavoe mi gente', want: 'Mi Gente', artista: 'Hector Lavoe' },
  { q: 'hector lavoe que locura', want: 'Que Locura', artista: 'Hector Lavoe' },
  { q: 'hector lavoe el todo poderoso', want: 'El Todopoderoso', artista: 'Hector Lavoe' },
  { q: 'hector lavoe hacha y machete', want: 'Hacha Y Machete', artista: 'Hector Lavoe' },
  { q: 'hector lavoe periodico de ayer', want: 'Periodico De Ayer', artista: 'Hector Lavoe' },
  { q: 'hector lavoe la murga', want: 'La Murga', artista: 'Hector Lavoe' },
  { q: 'cheo feliciano los amigos', want: 'Los Amigos', artista: 'Cheo Feliciano' },
  { q: 'cheo feliciano franqueza cruel', want: 'Franqueza Cruel', artista: 'Cheo Feliciano' },
  { q: 'ismael rivera el bombon de elena', want: 'El Bombon De Elena', artista: 'Ismael Rivera' },
  { q: 'ismael rivera las ingratitudes', want: 'Las Ingratitudes', artista: 'Ismael Rivera' },
  { q: 'el gran combo el menu', want: 'El Menu', artista: 'El Gran Combo' },
  { q: 'el gran combo ojos chinos', want: 'Ojos Chinos', artista: 'El Gran Combo' },
  { q: 'el gran combo la muerte', want: 'La Muerte', artista: 'El Gran Combo' },
  { q: 'el gran combo arroz con habichuela', want: 'Arroz Con Habichuela', artista: 'El Gran Combo' },
  { q: 'sonora poncena yare', want: 'Yare', artista: 'La Sonora Poncena' },
  { q: 'sonora poncena canto al amor', want: 'Canto Al Amor', artista: 'La Sonora Poncena' },
  { q: 'sonora poncena cancion', want: 'Cancion', artista: 'La Sonora Poncena' },
  { q: 'sonora poncena boranda', want: 'Boranda', artista: 'La Sonora Poncena' },
  { q: 'willie colon che che cole', want: 'Che Che Cole', artista: 'Willie Colon' },
  { q: 'willie colon aguanile', want: 'Aguanile', artista: 'Willie Colon' },
  { q: 'willie colon idilio', want: 'Idilio', artista: 'Willie Colon' },
  { q: 'willie colon la murga', want: 'La Murga (Colon)', artista: 'Willie Colon' },
  { q: 'ray barretto indestructible', want: 'Indestructible', artista: 'Ray Barretto' },
  { q: 'ray barretto que viva la musica', want: 'Que Viva La Musica', artista: 'Ray Barretto' },
  { q: 'ray barretto el watusi', want: 'El Watusi', artista: 'Ray Barretto' },
  { q: 'eddie palmieri azucar', want: 'Azucar', artista: 'Eddie Palmieri' },
  { q: 'eddie palmieri vamonos pal monte', want: 'Vamonos Pal Monte', artista: 'Eddie Palmieri' },
  { q: 'joe cuba bang bang', want: 'Bang Bang', artista: 'Joe Cuba' },
  { q: 'tommy olivencia plante bandera', want: 'Plante Bandera', artista: 'Tommy Olivencia' },
  { q: 'roberto roena que se sepa', want: 'Que Se Sepa', artista: 'Roberto Roena' },
  { q: 'roberto roena cui cui', want: 'Cui Cui', artista: 'Roberto Roena' },
  { q: 'la lupe puro teatro', want: 'Puro Teatro', artista: 'La Lupe' },
  { q: 'la lupe que te pedi', want: 'Que Te Pedi', artista: 'La Lupe' },
  { q: 'ruben blades olvidando el tema', want: 'Olvidando El Tema', artista: 'Ruben Blades' },
  { q: 'celia cruz toro mata', want: 'Toro Mata', artista: 'Celia Cruz' },
  { q: 'celia cruz y pacheco', want: 'Celia Y Pacheco', artista: 'Celia Cruz & Johnny Pacheco' },
  { q: 'la tipica 73', want: 'Tipica 73', artista: 'La Tipica 73' },
  { q: 'pete el conde rodriguez', want: 'Pete El Conde', artista: 'Pete El Conde Rodriguez' },
  { q: 'bobby valentin', want: 'Bobby Valentin', artista: 'Bobby Valentin' },
  { q: 'charlie palmieri', want: 'Charlie Palmieri', artista: 'Charlie Palmieri' },
  { q: 'justo betancourt pa bravo yo', want: 'Pa Bravo Yo', artista: 'Justo Betancourt' },
  { q: 'angel canales', want: 'Angel Canales', artista: 'Angel Canales' },
  { q: 'markolino dimond brujeria', want: 'Brujeria (Dimond)', artista: 'Markolino Dimond' },
  { q: 'fania all stars quitdate tu', want: 'Quitate Tu', artista: 'Fania All Stars' },
  { q: 'fania all stars viva tirado', want: 'Viva Tirado', artista: 'Fania All Stars' },
  { q: 'andy montanez', want: 'Andy Montanez', artista: 'Andy Montanez' },
  { q: 'ismael miranda', want: 'Ismael Miranda', artista: 'Ismael Miranda' },
  { q: 'larry harlow abran paso', want: 'Abran Paso', artista: 'Larry Harlow' },
  { q: 'tito rodriguez', want: 'Tito Rodriguez', artista: 'Tito Rodriguez' },
  { q: 'mongo santamaria', want: 'Mongo Santamaria', artista: 'Mongo Santamaria' },
  { q: 'joe bataan', want: 'Joe Bataan', artista: 'Joe Bataan' },
  { q: 'ricardo ray bobby cruz sonido bestial', want: 'Sonido Bestial', artista: 'Ricardo Ray & Bobby Cruz' },
  { q: 'ricardo ray bobby cruz', want: 'Ricardo Ray Bobby Cruz', artista: 'Ricardo Ray & Bobby Cruz' },
  { q: 'harlow latin opera gracia divina', want: 'Gracia Divina', artista: 'Larry Harlow & Celia Cruz' },
  { q: 'los blanco la avispa', want: 'La Avispa', artista: 'Los Blanco' },
  { q: 'fruko el caminante', want: 'El Caminante', artista: 'Fruko Y Sus Tesos' },
  { q: 'fruko patron de los reclusos', want: 'Patron De Los Reclusos', artista: 'Fruko Y Sus Tesos' },
  { q: 'grupo niche anamile', want: 'Anamile', artista: 'Grupo Niche' },
  { q: 'joe arroyo rebelion', want: 'Rebelion', artista: 'Joe Arroyo' },
  { q: 'dimension latina vuelta y vuelta', want: 'Vuelta Y Vuelta', artista: 'La Dimension Latina' },
];

/** Palabras que delatan que un resultado NO es salsa brava. */
const RUIDO = /bruno-mars|olivia-rodrigo|ed-sheeran|adele|maluma|farruko|j-balvin|bad-bunny|pimpinela|eros-ramazzotti|nat-king-cole|cri-cri|joaquin-sabina|arcangel|ra fade|rafaga|guaco|aldeanos|chayanne|melany|sonora-dinamita|sonora-kaliente|banda-sonora|sonora-colorada|sonora-santanera|sonora-matancera|jesucristo|betty-la-fea|decadentes|soledad|tamara|leandro|los-ratones|el-mataor|eva-ayllon|valentin-elizalde|lou-bega|mambo-politecnico|14-bis|883-|2-be-3|5ive|50-cent|4-non-blondes|3-doors|10cc|70s-|80s-|60s-|angeles-azules|natalia-lafourcade|queens|mosquito|nunca-es-suficiente|sabanas-frias|nino-y-mana/i;

const slugDe = (u) => u.replace(`${SITE}/`, '');

async function resolver(cand) {
  const r = await get(`${SITE}/?s=${encodeURIComponent(cand.q)}`);
  if (r.s !== 200) return { ...cand, error: `busqueda HTTP ${r.s}` };
  const posts = [
    ...new Set(
      [...r.t.matchAll(/href="(https:\/\/www\.karaokegratis\.com\.ar\/20\d\d\/\d\d\/[^"?#]+)"/g)].map((m) => m[1])
    ),
  ].filter((p) => !/\/20\d\d\/\d\d\/$/.test(p));

  for (const post of posts) {
    if (RUIDO.test(post)) continue;
    const p = await get(post);
    if (p.s !== 200) continue;
    const zip = (p.t.match(/href="([^"]*\.zip)"/i) || [])[1];
    if (!zip) continue;
    const titulo = (p.t.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
    // descartar si el titulo de la pagina no menciona al artista buscado
    const primera = cand.artista.split(/[&(]/)[0].trim().toLowerCase().split(/\s+/)[0];
    if (primera.length > 3 && !titulo.toLowerCase().includes(primera)) continue;
    return { ...cand, post, zip, titulo: titulo.slice(0, 120) };
  }
  return { ...cand, error: 'sin post con zip' };
}

const out = [];
const fallos = [];
for (const c of CANDIDATOS) {
  const r = await resolver(c);
  if (r.zip) {
    // el nombre del zip real es la fuente de verdad para el nombre de archivo
    const zipName = decodeURIComponent(r.zip.split('/').pop()).replace(/\.zip$/i, '');
    const base = `Salsa_-_${zipName.replace(/[^\w]+/g, '_')}`;
    // dedupe: el mismo zip puede salir de varias busquedas (p.ej. "Celia y
    // Pacheco" devolvia cuatro temas distintos del mismo disco).
    if (out.some((o) => o.url === r.zip || o.file === `${base}.kar`)) {
      console.log(`DUP  ${c.artista} - ${c.want}  (${zipName})`);
      continue;
    }
    out.push({ url: r.zip, file: `${base}.kar` });
    console.log(`OK   ${c.artista} - ${c.want}`);
    console.log(`     ${r.zip}`);
  } else {
    fallos.push({ ...c, error: r.error });
    console.log(`FALLA ${c.artista} - ${c.want}  (${r.error})`);
  }
}

await fs.writeFile(OUT_JOBS, JSON.stringify(out, null, 2), 'utf8');
console.log(`\nresueltos: ${out.length}/${CANDIDATOS.length}`);
console.log(`jobs -> ${OUT_JOBS}`);
if (fallos.length) {
  console.log('\nsin resolver:');
  for (const f of fallos) console.log(`  - ${f.artista} - ${f.want}: ${f.error}`);
}
