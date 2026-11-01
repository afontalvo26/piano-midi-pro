import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// FreePats' own CC0 bank records the hand clap with an AKG microphone.
// This is a separate, opt-in pack; it does not change Virtuosity core.
const REPOSITORY = 'freepats/world-percussion';
const COMMIT = 'e54eb2912a0d6d4444ab205d52f778e27da0fc96';
const DESTINATION = new URL('../app/public/audio/freepats-handclap/core/', import.meta.url);
const STAGING = new URL('../.logs/freepats-handclap-source/', import.meta.url);
const SOURCE_FILES = [
  '01_02.flac', '01_03.flac', '01_05.flac', '01_06.flac', '01_07.flac',
  '01_08.flac', '01_09.flac', '02_02.flac', '02_05.flac',
];

function digest(algorithm, bytes) {
  return createHash(algorithm).update(bytes).digest('hex');
}

function gitBlobHash(bytes) {
  return digest('sha1', Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]));
}

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000),
    headers: { 'User-Agent': 'Piano-MIDI-Pro-asset-build' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  await mkdir(DESTINATION, { recursive: true });
  await mkdir(STAGING, { recursive: true });
  const tree = JSON.parse((await get(`https://api.github.com/repos/${REPOSITORY}/git/trees/${COMMIT}?recursive=1`))
    .toString('utf8'));
  if (tree.truncated || !Array.isArray(tree.tree)) throw new Error('Árbol Git incompleto');
  const entries = new Map(tree.tree.map((item) => [item.path, item]));
  const sources = ['LICENSE.txt', 'README.txt', 'WorldPercussion 20200905.sfz',
    ...SOURCE_FILES.map((name) => `samples/HandClap/${name}`)];
  const verified = new Map();
  for (const path of sources) {
    const entry = entries.get(path);
    if (entry?.type !== 'blob' || !Number.isSafeInteger(entry.size)) {
      throw new Error(`Falta archivo oficial: ${path}`);
    }
    const data = await get(`https://raw.githubusercontent.com/${REPOSITORY}/${COMMIT}/${encodeURI(path)}`);
    if (data.length !== entry.size || gitBlobHash(data) !== entry.sha) {
      throw new Error(`Integridad Git inválida: ${path}`);
    }
    verified.set(path, { data, entry });
  }
  const readme = verified.get('README.txt').data.toString('utf8');
  const sfz = verified.get('WorldPercussion 20200905.sfz').data.toString('utf8');
  if (!readme.includes('Hand clap: Recorded on June 2019 by Roberto, with an AKG condenser microphone.') ||
      !readme.includes('Creative Commons CC0 public domain dedication') ||
      !sfz.includes('key=59') || SOURCE_FILES.some((file) => !sfz.includes(`samples/HandClap/${file}`))) {
    throw new Error('Procedencia o mapa SFZ de hand clap cambió en la fuente');
  }
  const license = verified.get('LICENSE.txt').data;
  if (!license.toString('utf8').includes('CC0')) throw new Error('Licencia CC0 ausente');
  await writeFile(new URL('LICENSE.txt', DESTINATION), license);
  await writeFile(new URL('README-source.txt', DESTINATION), verified.get('README.txt').data);
  const samples = [];
  for (const file of SOURCE_FILES) {
    const path = `samples/HandClap/${file}`;
    const { data, entry } = verified.get(path);
    const stagingPath = join(fileURLToPath(STAGING), file);
    const outputName = basename(file, extname(file)) + '.ogg';
    const partialPath = join(fileURLToPath(DESTINATION), outputName + '.partial');
    const outputPath = join(fileURLToPath(DESTINATION), outputName);
    await writeFile(stagingPath, data);
    const conversion = spawnSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error',
      '-y', '-i', stagingPath, '-map_metadata', '-1', '-c:a', 'libvorbis', '-q:a', '7',
      '-f', 'ogg', partialPath], { timeout: 30_000, encoding: 'utf8' });
    if (conversion.status !== 0) throw new Error(`Conversión falló: ${path}: ${conversion.stderr || conversion.error}`);
    await rename(partialPath, outputPath);
    const encoded = await readFile(outputPath);
    samples.push({ id: basename(file, extname(file)), sourcePath: path,
      sourceGitSha1: entry.sha, sourceSha256: digest('sha256', data),
      file: outputName, sha256: digest('sha256', encoded), byteLength: encoded.length });
    await rm(stagingPath);
    process.stdout.write(`${samples.length}/${SOURCE_FILES.length} ${outputName}\n`);
  }
  const manifest = {
    packId: 'freepats-handclap', version: COMMIT,
    source: `https://github.com/${REPOSITORY}/tree/${COMMIT}`,
    license: 'CC0-1.0', licenseSha256: digest('sha256', license),
    readmeSha256: digest('sha256', verified.get('README.txt').data),
    sfzSha256: digest('sha256', verified.get('WorldPercussion 20200905.sfz').data),
    performer: 'Roberto', recording: 'June 2019, AKG condenser microphone',
    sourceMidiNote: 59, projectGmNote: 39,
    note: 'Nine original FLAC hand-clap recordings converted to Ogg Vorbis; no synthesis or loudness processing. Opt-in pack, separate from Virtuosity core.',
    samples,
  };
  await writeFile(new URL('manifest.json', DESTINATION), JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write(`Pack preparado: ${samples.length} muestras, ${samples.reduce((sum, item) => sum + item.byteLength, 0)} bytes\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
