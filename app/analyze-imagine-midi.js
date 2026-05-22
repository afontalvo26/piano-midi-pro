// Script para analizar el archivo MIDI de "Imagine" de John Lennon
import fs from 'fs';
import pkg from '@tonejs/midi';
const { Midi } = pkg;

const midiPath = './public/demo/John_Lennon_-_Imagine.mid';

console.log('='.repeat(80));
console.log('ANÁLISIS DEL ARCHIVO MIDI: Imagine - John Lennon');
console.log('='.repeat(80));
console.log('');

// Leer y parsear el archivo MIDI
const midiData = fs.readFileSync(midiPath);
const midi = new Midi(midiData);

// Información general
console.log('📊 INFORMACIÓN GENERAL');
console.log('-'.repeat(80));
console.log(`Nombre: ${midi.name || 'Sin nombre'}`);
console.log(`Duración: ${midi.duration.toFixed(2)} segundos`);
console.log(`BPM: ${midi.header.tempos[0]?.bpm || 'No especificado'}`);
console.log(`PPQ (Pulses Per Quarter): ${midi.header.ppq}`);
console.log(`Time Signature: ${midi.header.timeSignatures[0]?.timeSignature.join('/') || 'No especificado'}`);
console.log(`Número de pistas: ${midi.tracks.length}`);
console.log('');

// Analizar cada pista
console.log('🎹 ANÁLISIS DE PISTAS');
console.log('-'.repeat(80));

midi.tracks.forEach((track, index) => {
  console.log(`\nPista ${index}:`);
  console.log(`  Nombre: ${track.name || 'Sin nombre'}`);
  console.log(`  Canal MIDI: ${track.channel !== undefined ? track.channel + 1 : 'No especificado'}`);
  console.log(`  Instrumento: ${track.instrument?.name || 'No especificado'} (Program ${track.instrument?.number || 'N/A'})`);
  console.log(`  Número de notas: ${track.notes.length}`);
  
  if (track.notes.length > 0) {
    const midis = track.notes.map(n => n.midi);
    const minMidi = Math.min(...midis);
    const maxMidi = Math.max(...midis);
    console.log(`  Rango MIDI: ${minMidi} - ${maxMidi} (${midiToNoteName(minMidi)} - ${midiToNoteName(maxMidi)})`);
    
    // Mostrar primeras 10 notas
    console.log(`  Primeras 10 notas:`);
    track.notes.slice(0, 10).forEach((note, i) => {
      console.log(`    ${i + 1}. ${midiToNoteName(note.midi)} (MIDI ${note.midi}) - Tiempo: ${note.time.toFixed(3)}s, Duración: ${note.duration.toFixed(3)}s, Velocity: ${note.velocity.toFixed(2)}`);
    });
  }
  
  // Control changes
  if (track.controlChanges && Object.keys(track.controlChanges).length > 0) {
    console.log(`  Control Changes:`);
    Object.entries(track.controlChanges).forEach(([cc, changes]) => {
      console.log(`    CC${cc}: ${changes.length} eventos`);
    });
  }
});

// Análisis de notas simultáneas
console.log('');
console.log('🎵 ANÁLISIS DE NOTAS SIMULTÁNEAS');
console.log('-'.repeat(80));

// Recopilar todas las notas de todas las pistas
const allNotes = [];
midi.tracks.forEach((track, trackIndex) => {
  track.notes.forEach(note => {
    allNotes.push({
      trackIndex,
      trackName: track.name || `Pista ${trackIndex}`,
      midi: note.midi,
      time: note.time,
      duration: note.duration,
      velocity: note.velocity
    });
  });
});

// Ordenar por tiempo
allNotes.sort((a, b) => a.time - b.time);

// Buscar notas que suenan al mismo tiempo (dentro de 0.01s)
const simultaneousGroups = [];
let currentGroup = [allNotes[0]];

for (let i = 1; i < allNotes.length; i++) {
  const timeDiff = allNotes[i].time - currentGroup[0].time;
  
  if (timeDiff < 0.01) {
    // Misma nota o muy cercana
    currentGroup.push(allNotes[i]);
  } else {
    if (currentGroup.length > 1) {
      simultaneousGroups.push([...currentGroup]);
    }
    currentGroup = [allNotes[i]];
  }
}

if (currentGroup.length > 1) {
  simultaneousGroups.push(currentGroup);
}

console.log(`\nEncontrados ${simultaneousGroups.length} grupos de notas simultáneas`);
console.log(`\nPrimeros 20 grupos de notas simultáneas:`);

simultaneousGroups.slice(0, 20).forEach((group, i) => {
  console.log(`\n${i + 1}. Tiempo: ${group[0].time.toFixed(3)}s - ${group.length} notas:`);
  group.forEach(note => {
    console.log(`   - ${note.trackName}: ${midiToNoteName(note.midi)} (MIDI ${note.midi}), Velocity: ${note.velocity.toFixed(2)}`);
  });
  
  // Verificar si hay mismo MIDI
  const midiNumbers = group.map(n => n.midi);
  const uniqueMidis = new Set(midiNumbers);
  if (uniqueMidis.size < midiNumbers.length) {
    console.log(`   ⚠️  MISMO MIDI EN MÚLTIPLES PISTAS!`);
  }
});

// Estadísticas finales
console.log('');
console.log('📈 ESTADÍSTICAS');
console.log('-'.repeat(80));
console.log(`Total de notas en el archivo: ${allNotes.length}`);
console.log(`Grupos de notas simultáneas: ${simultaneousGroups.length}`);
console.log(`Porcentaje de notas simultáneas: ${((simultaneousGroups.reduce((sum, g) => sum + g.length, 0) / allNotes.length) * 100).toFixed(1)}%`);

// Función helper para convertir MIDI a nombre de nota
function midiToNoteName(midi) {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  const note = notes[midi % 12];
  return `${note}${octave}`;
}

console.log('');
console.log('='.repeat(80));
console.log('Análisis completado');
console.log('='.repeat(80));

// Made with Bob
