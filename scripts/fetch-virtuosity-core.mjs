import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Official CC0 source, pinned to the exact revision used for this optional pack.
const REPOSITORY = 'sfzinstruments/virtuosity_drums';
const COMMIT = '9f04cf9a734527edfbb0a4eee1f674e45bbf71bc';
const DESTINATION = new URL('../app/public/audio/virtuosity/core/', import.meta.url);
const STAGING = new URL('../.logs/virtuosity-source/', import.meta.url);

const groups = [
  { id: 'kick', directory: 'Samples/kickmic/kick', stem: 'kickmic_kick_snoff', layers: [1, 2, 3, 4], roundRobins: [1, 2] },
  { id: 'snare', directory: 'Samples/snaremic/snare', stem: 'snaremic_snare_center', layers: [1, 6, 11, 16, 21, 26, 31, 36], roundRobins: [null] },
  { id: 'hatClosed', directory: 'Samples/oh/hh', stem: 'oh_hh_closed', layers: [1, 2, 3, 4], roundRobins: [1, 2] },
  { id: 'hatOpen', directory: 'Samples/oh/hh', stem: 'oh_hh_open', layers: [1, 2, 3, 4], roundRobins: [1, 2] },
  { id: 'cowbell', directory: 'Samples/perc/close/cowbell', stem: 'Cowbell1_Normal', layers: [1, 2, 3], roundRobins: [1, 2] },
];

function sourcePath(group, velocityLayer, roundRobin) {
  if (group.id === 'cowbell') {
    return `${group.directory}/${group.stem}_v${velocityLayer}_rr${roundRobin}_Close.wav`;
  }
  return `${group.directory}/${group.stem}_vl${velocityLayer}${roundRobin === null ? '' : `_rr${roundRobin}`}.flac`;
}

function digest(algorithm, bytes) {
  return createHash(algorithm).update(bytes).digest('hex');
}

function gitBlobHash(bytes) {
  return digest('sha1', Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]));
}

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'Piano-MIDI-Pro-asset-build' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  await mkdir(DESTINATION, { recursive: true });
  await mkdir(STAGING, { recursive: true });
  const treeResponse = await get(`https://api.github.com/repos/${REPOSITORY}/git/trees/${COMMIT}?recursive=1`);
  const tree = JSON.parse(treeResponse.toString('utf8'));
  if (tree.truncated || !Array.isArray(tree.tree)) throw new Error('Árbol Git incompleto');
  const entries = new Map(tree.tree.map((item) => [item.path, item]));

  const paths = ['LICENSE'];
  for (const group of groups) {
    for (const velocityLayer of group.layers) {
      for (const roundRobin of group.roundRobins) {
        paths.push(sourcePath(group, velocityLayer, roundRobin));
      }
    }
  }

  const samples = [];
  for (const path of paths) {
    const entry = entries.get(path);
    if (entry?.type !== 'blob' || !Number.isSafeInteger(entry.size)) throw new Error(`Archivo ausente en la revisión oficial: ${path}`);
    const source = await get(`https://raw.githubusercontent.com/${REPOSITORY}/${COMMIT}/${path}`);
    if (source.length !== entry.size || gitBlobHash(source) !== entry.sha) throw new Error(`Integridad Git inválida: ${path}`);
    if (path === 'LICENSE') {
      await writeFile(new URL('LICENSE', DESTINATION), source);
      continue;
    }
    const stagingPath = join(fileURLToPath(STAGING), basename(path));
    await writeFile(stagingPath, source);
    const outputName = basename(path, extname(path)) + '.ogg';
    const pendingPath = join(fileURLToPath(DESTINATION), outputName + '.partial');
    const outputPath = join(fileURLToPath(DESTINATION), outputName);
    const conversion = spawnSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', stagingPath,
      '-map_metadata', '-1', '-c:a', 'libvorbis', '-q:a', '7', '-f', 'ogg', pendingPath], { timeout: 30_000, encoding: 'utf8' });
    if (conversion.status !== 0) throw new Error(`Conversión falló: ${path}: ${conversion.stderr || conversion.error}`);
    await rename(pendingPath, outputPath);
    const encoded = await readFile(outputPath);
    const group = groups.find((candidate) => path.startsWith(`${candidate.directory}/${candidate.stem}_`));
    const layerMatch = path.match(/_v(?:l)?(\d+)/);
    const robinMatch = path.match(/_rr(\d+)/);
    if (!group || !layerMatch) throw new Error(`Mapa incompleto: ${path}`);
    samples.push({ id: `${group.id}-${layerMatch[1]}-${robinMatch?.[1] ?? '1'}`, articulation: group.id,
      velocityLayer: Number(layerMatch[1]), roundRobin: Number(robinMatch?.[1] ?? 1),
      sourcePath: path, sourceGitSha1: entry.sha, sourceSha256: digest('sha256', source),
      file: outputName, sha256: digest('sha256', encoded), byteLength: encoded.length });
    await rm(stagingPath);
    process.stdout.write(`${samples.length}/${paths.length - 1} ${outputName}\n`);
  }
  const license = await readFile(new URL('LICENSE', DESTINATION));
  const manifest = {
    packId: 'virtuosity-core',
    version: COMMIT,
    source: `https://github.com/${REPOSITORY}/tree/${COMMIT}`,
    license: 'CC0-1.0',
    licenseSha256: digest('sha256', license),
    creators: ['Versilian Studios LLC', 'Karoryfer Lecolds'],
    performer: 'Austin McMahon',
    note: 'Original FLAC recordings converted to Ogg Vorbis without sound synthesis or loudness processing. Optional subset; physical audition pending.',
    samples,
  };
  await writeFile(new URL('manifest.json', DESTINATION), JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write(`Pack preparado: ${samples.length} muestras, ${samples.reduce((total, sample) => total + sample.byteLength, 0)} bytes\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
