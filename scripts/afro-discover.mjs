// Barrido de champeta africana / soukous / highlife en karaokegratis.com.ar.
//
// Reusa la tecnica de scripts/salsa-discover.mjs (buscar -> post -> zip) pero con
// validacion relajada: aca no hay un genero "sello" claro, asi que se valida
// exigiendo que el titulo de la pagina contenga algun token del artista buscado.
//
// Uso: node scripts/afro-discover.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const SITE = 'https://www.karaokegratis.com.ar';
const OUT_JOBS = path.resolve('scripts/afro-champeta.jobs.json');

const get = async (u) => {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
    return { s: r.status, t: await r.text() };
  } catch (e) {
    return { s: 'ERR', t: '', e: e.message };
  }
};

/** @type {{q: string, artista: string}[]} */
const CANDIDATOS = [
  // ── Prince Nico Mbarga (highlife nigeriano, el eje del pedido) ──
  { q: 'prince nico mbarga sweet mother', artista: 'Prince Nico Mbarga', want: 'Sweet Mother' },
  { q: 'prince nico mbarga', artista: 'Prince Nico Mbarga', want: 'Prince Nico' },
  { q: 'sweet mother', artista: 'Prince Nico Mbarga', want: 'Sweet Mother (suelto)' },
  { q: 'rocafil jazz', artista: 'Rocafil Jazz', want: 'Rocafil Jazz' },
  { q: 'prince nico mbarga aki special', artista: 'Prince Nico Mbarga', want: 'Aki Special' },
  // ── Soukous / rumba congolesa ──
  { q: 'franco tpok jazz', artista: 'Franco & TPOK Jazz', want: 'Franco' },
  { q: 'franco mario', artista: 'Franco', want: 'Mario' },
  { q: 'tabu ley rochereau', artista: 'Tabu Ley Rochereau', want: 'Tabu Ley' },
  { q: 'kanda bongo man', artista: 'Kanda Bongo Man', want: 'Kanda Bongo Man' },
  { q: 'pepe kalle', artista: 'Pepe Kalle', want: 'Pepe Kalle' },
  { q: 'papa wemba', artista: 'Papa Wemba', want: 'Papa Wemba' },
  { q: 'diblo dibala', artista: 'Diblo Dibala', want: 'Diblo Dibala' },
  { q: 'aurlus mabele', artista: 'Aurlus Mabele', want: 'Aurlus Mabele' },
  { q: 'loketo', artista: 'Loketo', want: 'Loketo' },
  { q: 'wenge musica', artista: 'Wenge Musica', want: 'Wenge Musica' },
  { q: 'extra musica', artista: 'Extra Musica', want: 'Extra Musica' },
  { q: 'quadra kora man', artista: 'Quartier Latin', want: 'Quartier Latin' },
  { q: 'koffi olomide', artista: 'Koffi Olomide', want: 'Koffi Olomide' },
  { q: 'sam mangwana', artista: 'Sam Mangwana', want: 'Sam Mangwana' },
  { q: 'dr nico kasanda', artista: 'Dr Nico', want: 'Dr Nico' },
  { q: 'loi sapu', artista: 'Loi Sapu', want: 'Loi Sapu' },
  // ── Highlife / afrobeat / otros africanos ──
  { q: 'e t mensah', artista: 'E.T. Mensah', want: 'ET Mensah' },
  { q: 'osibisa', artista: 'Osibisa', want: 'Osibisa' },
  { q: 'fela kuti', artista: 'Fela Kuti', want: 'Fela Kuti' },
  { q: 'manu dibango soul makossa', artista: 'Manu Dibango', want: 'Soul Makossa' },
  { q: 'youssou ndour', artista: 'Youssou N Dour', want: 'Youssou N Dour' },
  { q: 'salif keita', artista: 'Salif Keita', want: 'Salif Keita' },
  { q: 'mory kante', artista: 'Mory Kante', want: 'Mory Kante' },
  { q: 'toure kunda', artista: 'Toure Kunda', want: 'Toure Kunda' },
  { q: 'alpha blondy', artista: 'Alpha Blondy', want: 'Alpha Blondy' },
  { q: 'lucky dube', artista: 'Lucky Dube', want: 'Lucky Dube' },
  { q: 'zaiko langa langa', artista: 'Zaiko Langa Langa', want: 'Zaiko Langa Langa' },
  { q: 'les quatres etoiles', artista: 'Les Quatre Etoiles', want: 'Les Quatre Etoiles' },
  // ── Champeta criolla colombiana (por si aparece) ──
  { q: 'champeta', artista: 'Champeta', want: 'Champeta' },
  { q: 'louis towers', artista: 'Louis Towers', want: 'Louis Towers' },
  { q: 'viviano torres', artista: 'Viviano Torres', want: 'Viviano Torres' },
  { q: 'charles king champeta', artista: 'Charles King', want: 'Charles King' },
  { q: 'bazurto all stars', artista: 'Bazurto All Stars', want: 'Bazurto' },
  { q: 'mr black el presidente', artista: 'Mr Black', want: 'Mr Black' },
];

const RUIDO =
  /bruno-mars|olivia-rodrigo|ed-sheeran|adele|maluma|farruko|j-balvin|bad-bunny|pimpinela|eros-ramazzotti|nat-king-cole|cri-cri|joaquin-sabina|arcangel|rafaga|queens|mosquito|neil-young|im-the-ocean|14-bis|883-|2-be-3|5ive|50-cent|4-non-blondes|3-doors|10cc|70s-|80s-|60s-|angeles-azules|lafourcade|nunca-es-suficiente/i;

const VACIAS = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'y', 'su', 'the', 'les', 'los', 'sweet', 'mother']);

async function resolver(cand) {
  const r = await get(`${SITE}/?s=${encodeURIComponent(cand.q)}`);
  if (r.s !== 200) return { error: `busqueda HTTP ${r.s}` };
  const posts = [
    ...new Set(
      [...r.t.matchAll(/href="(https:\/\/www\.karaokegratis\.com\.ar\/20\d\d\/\d\d\/[^"?#]+)"/g)].map((m) => m[1])
    ),
  ].filter((p) => !/\/20\d\d\/\d\d\/$/.test(p));

  const tokens = cand.artista
    .split(/[^\p{L}]+/u)
    .map((s) => s.toLowerCase())
    .filter((s) => s.length > 3 && !VACIAS.has(s));

  // 1) intento estricto: algun token del artista en el titulo
  for (const post of posts) {
    if (RUIDO.test(post)) continue;
    const p = await get(post);
    if (p.s !== 200) continue;
    const zip = (p.t.match(/href="([^"]*\.zip)"/i) || [])[1];
    if (!zip) continue;
    const titulo = (p.t.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
    const bajo = titulo.toLowerCase();
    if (tokens.length && !tokens.some((t) => bajo.includes(t))) continue;
    return { post, zip, titulo: titulo.slice(0, 130) };
  }
  return { error: 'sin post con zip' };
}

const out = [];
const fallos = [];
for (const c of CANDIDATOS) {
  const r = await resolver(c);
  if (r.zip) {
    const zipName = decodeURIComponent(r.zip.split('/').pop()).replace(/\.zip$/i, '');
    const base = `Champeta_-_${zipName.replace(/[^\w]+/g, '_')}`;
    if (out.some((o) => o.url === r.zip || o.file === `${base}.kar`)) {
      console.log(`DUP  ${c.artista} - ${c.want} (${zipName})`);
      continue;
    }
    out.push({ url: r.zip, file: `${base}.kar` });
    console.log(`OK   ${c.artista} -> ${zipName}`);
  } else {
    fallos.push({ ...c, error: r.error });
    console.log(`FALLA ${c.artista} - ${c.want} (${r.error})`);
  }
}

await fs.writeFile(OUT_JOBS, JSON.stringify(out, null, 2), 'utf8');
console.log(`\nresueltos: ${out.length}/${CANDIDATOS.length}`);
console.log(`jobs -> ${OUT_JOBS}`);
