// ============================================================
// PianoPet — Interactive canvas mascot for Piano MIDI Pro
// Pure canvas 2D. No sprites. Reactive to BPM + notes + state.
// ============================================================

export type PetSkinId = 'bear' | 'cat' | 'panda' | 'bunny' | 'robot';

export interface PetSkin {
  id: PetSkinId;
  name: string;
  emoji: string;
  body: string;
  belly: string;
  accent: string;
  eye: string;
  nose: string;
  glow: string;
}

export const PET_SKINS: PetSkin[] = [
  { id: 'bear',  name: 'Osito DJ',      emoji: '🐻', body: '#c8a87a', belly: '#e8c89a', accent: '#9a7048', eye: '#2d1b0e', nose: '#7a4a2a', glow: '#fbbf24' },
  { id: 'cat',   name: 'Gato Maestro',  emoji: '🐱', body: '#ff9966', belly: '#ffdd99', accent: '#cc5511', eye: '#16a34a', nose: '#f472b6', glow: '#f43f5e' },
  { id: 'panda', name: 'Panda Pro',     emoji: '🐼', body: '#f0f0f0', belly: '#e4e4e4', accent: '#1c1c2e', eye: '#1c1c2e', nose: '#ef4444', glow: '#a855f7' },
  { id: 'bunny', name: 'Conejito Beat', emoji: '🐰', body: '#f0ddf8', belly: '#fce8fc', accent: '#a855f7', eye: '#7c3aed', nose: '#f472b6', glow: '#ec4899' },
  { id: 'robot', name: 'Robot MIDI',    emoji: '🤖', body: '#475569', belly: '#64748b', accent: '#0f2944', eye: '#00ffcc', nose: '#00e5b8', glow: '#06b6d4' },
];

// ── Particle types ─────────────────────────────────────────

interface StarParticle {
  x: number; y: number;
  vx: number; vy: number;
  color: string;
  alpha: number;
  r: number;
}

interface ZBubble {
  x: number; y: number;
  text: string;
  alpha: number;
  size: number;
}

interface FloatingNote {
  x: number; y: number;
  vy: number;
  alpha: number;
  rotation: number;
  color: string;
}

// ── Pet state ──────────────────────────────────────────────

export type PetMood = 'sleep' | 'idle' | 'walk' | 'dance' | 'celebrate';

export interface PetState {
  x: number;
  vx: number;
  walkTarget: number;
  mood: PetMood;
  frame: number;
  facingRight: boolean;
  // Animation
  jumpOffset: number;
  armAngle: number;
  legPhase: number;
  blinkTimer: number;
  scale: number;
  scaleTarget: number;
  celebrateTimer: number;
  reactTimer: number;
  // Particles
  stars: StarParticle[];
  zBubbles: ZBubble[];
  musicNotes: FloatingNote[];
  // Tracking
  lastNoteCount: number;
  initialized: boolean;
  prevIsPlaying: boolean;
}

export function createPetState(): PetState {
  return {
    x: 200, vx: 0, walkTarget: 200,
    mood: 'idle',
    frame: 0,
    facingRight: true,
    jumpOffset: 0,
    armAngle: 0,
    legPhase: 0,
    blinkTimer: 80 + Math.random() * 120,
    scale: 0,
    scaleTarget: 1,
    celebrateTimer: 0,
    reactTimer: 0,
    stars: [], zBubbles: [], musicNotes: [],
    lastNoteCount: 0,
    initialized: false,
    prevIsPlaying: false,
  };
}

// ── Main entry point ───────────────────────────────────────

export interface PetInput {
  isPlaying: boolean;
  activeNoteCount: number;
  bpm: number;
  skinId: PetSkinId;
  fxColor: string;
  currentTime: number;
  width: number;
  height: number;
}

export function updateAndDrawPet(
  ctx: CanvasRenderingContext2D,
  pet: PetState,
  input: PetInput,
): void {
  const { isPlaying, activeNoteCount, bpm, skinId, fxColor, currentTime, width, height } = input;
  const skin = PET_SKINS.find(s => s.id === skinId) ?? PET_SKINS[0];

  // Size: responsive 14-18% of canvas height
  const size = Math.min(Math.max(height * 0.17, 50), 100);

  // Initialize on first call or reset
  if (!pet.initialized) {
    pet.x = width * 0.5;
    pet.walkTarget = width * (0.25 + Math.random() * 0.5);
    pet.initialized = true;
    pet.scale = 0; // pop-in from zero
  }

  pet.frame++;

  // Beat sync
  const safeBpm = Math.max(bpm, 20);
  const beatDuration = 60 / safeBpm;
  const beatPhase = (currentTime % beatDuration) / beatDuration; // 0..1
  const beatSin = Math.sin(beatPhase * Math.PI * 2);             // -1..1

  // Events
  const noteJustStarted = activeNoteCount > 0 && pet.lastNoteCount === 0;
  const bigChord = activeNoteCount >= 4;
  const justWokeUp = isPlaying && !pet.prevIsPlaying;

  if (noteJustStarted || justWokeUp) pet.reactTimer = 20;
  if (bigChord && isPlaying && pet.celebrateTimer <= 0) {
    pet.celebrateTimer = 55;
    // burst stars on chord
    spawnStars(pet, pet.x, height - 6 - size * 0.8, 10, [fxColor, skin.glow, '#fbbf24', '#f43f5e']);
  }

  pet.lastNoteCount = activeNoteCount;
  pet.prevIsPlaying = isPlaying;
  pet.celebrateTimer = Math.max(0, pet.celebrateTimer - 1);
  pet.reactTimer    = Math.max(0, pet.reactTimer - 1);
  pet.blinkTimer--;
  if (pet.blinkTimer <= 0) pet.blinkTimer = 90 + Math.random() * 150;

  // ── Mood machine ────────────────────────────────────────
  if (!isPlaying) {
    pet.mood = 'sleep';
  } else if (pet.celebrateTimer > 0) {
    pet.mood = 'celebrate';
  } else if (activeNoteCount > 0) {
    pet.mood = 'dance';
  } else {
    pet.mood = 'walk';
  }

  // ── Physics & animation ─────────────────────────────────
  const footY = height - 6;
  const bpmFactor = safeBpm / 120;

  if (pet.mood === 'walk') {
    const walkSpeed = Math.min(bpmFactor * 1.8, 4);
    const dx = pet.walkTarget - pet.x;
    if (Math.abs(dx) < 12) {
      pet.walkTarget = size * 0.9 + Math.random() * (width - size * 1.8);
    }
    pet.vx += dx > 0 ? 0.45 : -0.45;
    pet.vx = Math.sign(pet.vx) * Math.min(Math.abs(pet.vx), walkSpeed);
    pet.vx *= 0.88;
    if (pet.vx > 0.15) pet.facingRight = true;
    if (pet.vx < -0.15) pet.facingRight = false;
    pet.x = clamp(pet.x + pet.vx, size * 0.7, width - size * 0.7);
    pet.legPhase += 0.13 * bpmFactor;
    pet.jumpOffset = Math.abs(Math.sin(pet.legPhase)) * 2.5;
    pet.armAngle = Math.sin(pet.legPhase) * 0.35;

  } else if (pet.mood === 'dance') {
    pet.vx *= 0.82;
    pet.x += pet.vx;
    pet.x = clamp(pet.x + Math.sin(pet.frame * 0.045) * 0.7, size * 0.7, width - size * 0.7);
    // Bop up on beat upswing
    pet.jumpOffset = Math.max(0, beatSin) * 11 * (activeNoteCount > 0 ? 1 : 0.5);
    pet.legPhase += 0.15 * bpmFactor;
    pet.armAngle = Math.sin(pet.frame * 0.11) * 0.75;

    // Floating music notes
    if (pet.frame % 22 === 0 && pet.musicNotes.length < 8) {
      pet.musicNotes.push({
        x: pet.x + (Math.random() - 0.5) * size * 0.6,
        y: footY - size * 1.15,
        vy: -0.85 - Math.random() * 0.55,
        alpha: 0.9,
        rotation: (Math.random() - 0.5) * 0.6,
        color: [fxColor, skin.glow, '#fbbf24'][Math.floor(Math.random() * 3)],
      });
    }

  } else if (pet.mood === 'celebrate') {
    pet.jumpOffset = Math.abs(Math.sin(pet.frame * 0.19)) * 24;
    pet.armAngle += 0.22; // spinning arms
    pet.legPhase += 0.18;
    pet.x += Math.sin(pet.frame * 0.072) * 1.3;
    pet.x = clamp(pet.x, size * 0.7, width - size * 0.7);

    // Continuous star bursts
    if (pet.frame % 6 === 0 && pet.stars.length < 22) {
      spawnStars(pet, pet.x, footY - size * 0.9, 2, [fxColor, skin.glow, '#fbbf24', '#f43f5e', '#a855f7', '#06b6d4']);
    }

    // Confetti notes
    if (pet.frame % 18 === 0 && pet.musicNotes.length < 10) {
      pet.musicNotes.push({
        x: pet.x + (Math.random() - 0.5) * size * 0.8,
        y: footY - size * 1.3,
        vy: -1.2 - Math.random() * 0.8,
        alpha: 1,
        rotation: Math.random() * Math.PI * 2,
        color: [fxColor, skin.glow, '#fbbf24', '#f43f5e'][Math.floor(Math.random() * 4)],
      });
    }

  } else if (pet.mood === 'sleep') {
    pet.vx = 0;
    pet.jumpOffset = 0;
    pet.armAngle = 0.18;
    // ZZZ
    if (pet.frame % 42 === 0 && pet.zBubbles.length < 5) {
      pet.zBubbles.push({
        x: pet.x + size * 0.32,
        y: footY - size * 1.1,
        text: pet.zBubbles.length % 2 === 0 ? 'z' : 'Z',
        alpha: 0.85,
        size: 8 + Math.random() * 8,
      });
    }
  }

  // ── Update particles ─────────────────────────────────────
  pet.stars = pet.stars.filter(s => s.alpha > 0.04);
  for (const s of pet.stars) {
    s.x += s.vx; s.y += s.vy; s.vy += 0.09;
    s.alpha -= 0.021; s.r *= 0.978;
  }

  pet.zBubbles = pet.zBubbles.filter(b => b.alpha > 0.04);
  for (const b of pet.zBubbles) {
    b.y -= 0.48;
    b.x += Math.sin(pet.frame * 0.07) * 0.3;
    b.alpha -= 0.011;
    b.size = Math.min(b.size + 0.035, 18);
  }

  pet.musicNotes = pet.musicNotes.filter(n => n.alpha > 0.04);
  for (const n of pet.musicNotes) {
    n.y += n.vy;
    n.x += Math.sin(n.y * 0.06) * 0.5;
    n.alpha -= 0.016;
  }

  // ── Scale ────────────────────────────────────────────────
  if (pet.mood === 'celebrate') pet.scaleTarget = 1.12;
  else if (pet.mood === 'dance') pet.scaleTarget = 1 + Math.max(0, beatSin) * 0.07;
  else if (pet.mood === 'sleep') pet.scaleTarget = 0.9;
  else pet.scaleTarget = 1;
  pet.scale += (pet.scaleTarget - pet.scale) * 0.14;

  // ── Draw ─────────────────────────────────────────────────

  // 1. Star particles (behind character)
  for (const s of pet.stars) {
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle = s.color;
    ctx.shadowBlur = 9;
    ctx.shadowColor = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(0.5, s.r), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 2. Floating music notes
  for (const n of pet.musicNotes) {
    ctx.save();
    ctx.globalAlpha = n.alpha;
    ctx.fillStyle = n.color;
    ctx.shadowBlur = 7;
    ctx.shadowColor = n.color;
    ctx.translate(n.x, n.y);
    ctx.rotate(n.rotation);
    drawMusicNoteGlyph(ctx, 0, 0, 7);
    ctx.restore();
  }

  // 3. Character
  const px = pet.x;
  const py = footY - pet.jumpOffset;
  const isBlinking = pet.blinkTimer < 5;

  ctx.save();
  ctx.translate(px, py);
  ctx.scale(pet.scale * (pet.facingRight ? 1 : -1), pet.scale);

  if (pet.mood === 'dance' || pet.mood === 'celebrate') {
    ctx.shadowBlur = 18;
    ctx.shadowColor = skin.glow;
  }

  drawCharacter(ctx, size, skin, pet.mood, pet.armAngle, pet.legPhase, isBlinking);
  ctx.restore();

  // 4. ZZZ bubbles (drawn unflipped so text is readable)
  for (const b of pet.zBubbles) {
    ctx.save();
    ctx.globalAlpha = b.alpha;
    ctx.font = `bold ${Math.round(b.size)}px sans-serif`;
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.text, b.x, b.y);
    ctx.restore();
  }
}

// ── Drawing helpers ────────────────────────────────────────

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  s: number,
  skin: PetSkin,
  mood: PetMood,
  armAngle: number,
  legPhase: number,
  isBlinking: boolean,
) {
  // Coordinate origin: foot center (bottom of character), Y up = negative
  const bY  = -s * 0.50;   // body center Y
  const bRx = s * 0.215;   // body horiz radius
  const bRy = s * 0.325;   // body vert radius
  const hY  = -s * 0.92;   // head center Y
  const hR  = s * 0.26;    // head radius

  const legL =  Math.sin(legPhase) * 0.34;
  const legR = -Math.sin(legPhase) * 0.34;

  // ── Back leg ─────────────────────────────────────────────
  ctx.save();
  ctx.translate(-bRx * 0.5, -s * 0.1);
  ctx.rotate(legL + 0.14);
  drawLimb(ctx, s * 0.115, s * 0.27, skin.body, skin.accent);
  ctx.restore();

  // ── Back arm ─────────────────────────────────────────────
  ctx.save();
  ctx.translate(-bRx * 0.92, bY - bRy * 0.18);
  ctx.rotate(-Math.PI * 0.27 - armAngle * 0.45);
  drawLimb(ctx, s * 0.1, s * 0.21, skin.accent, skin.body);
  ctx.restore();

  // ── Body ─────────────────────────────────────────────────
  ctx.fillStyle = skin.body;
  ctx.beginPath();
  ctx.ellipse(0, bY, bRx, bRy, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly patch
  ctx.fillStyle = skin.belly;
  ctx.beginPath();
  ctx.ellipse(0, bY + bRy * 0.22, bRx * 0.61, bRy * 0.56, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Ears & head type ─────────────────────────────────────
  if (skin.id === 'bunny') {
    drawBunnyEars(ctx, hY, hR, skin);
  } else if (skin.id === 'cat') {
    drawCatEars(ctx, hY, hR, skin);
  } else {
    // Round ears (bear / panda / robot)
    const eR = s * 0.098;
    const earFill = (skin.id === 'panda' || skin.id === 'robot') ? skin.accent : skin.body;
    ctx.fillStyle = earFill;
    ctx.beginPath(); ctx.arc(-hR * 0.66, hY - hR * 0.71, eR * 1.15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( hR * 0.66, hY - hR * 0.71, eR * 1.15, 0, Math.PI * 2); ctx.fill();
    if (skin.id !== 'robot') {
      ctx.fillStyle = skin.belly;
      ctx.beginPath(); ctx.arc(-hR * 0.66, hY - hR * 0.71, eR * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc( hR * 0.66, hY - hR * 0.71, eR * 0.62, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Robot antenna
  if (skin.id === 'robot') {
    ctx.strokeStyle = skin.body;
    ctx.lineWidth = s * 0.038;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, hY - hR);
    ctx.lineTo(0, hY - hR * 1.55);
    ctx.stroke();
    ctx.fillStyle = skin.eye;
    ctx.shadowBlur = 7; ctx.shadowColor = skin.eye;
    ctx.beginPath(); ctx.arc(0, hY - hR * 1.63, s * 0.042, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ── Head ─────────────────────────────────────────────────
  ctx.fillStyle = skin.body;
  if (skin.id === 'robot') {
    const hw = hR * 1.08;
    ctx.beginPath();
    roundRectPath(ctx, -hw, hY - hw, hw * 2, hw * 2, s * 0.07);
    ctx.fill();
    ctx.fillStyle = skin.accent;
    ctx.beginPath();
    roundRectPath(ctx, -hw * 0.78, hY - hw * 0.66, hw * 1.56, hw * 1.48, s * 0.045);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, hY, hR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Panda eye patches
  if (skin.id === 'panda') {
    ctx.fillStyle = skin.accent;
    ctx.beginPath(); ctx.ellipse(-hR * 0.34, hY, hR * 0.27, hR * 0.24, -0.28, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( hR * 0.34, hY, hR * 0.27, hR * 0.24,  0.28, 0, Math.PI * 2); ctx.fill();
  }

  // ── Face ─────────────────────────────────────────────────
  const eyeY = hY - hR * 0.07;
  const sleeping = mood === 'sleep';
  const happy = mood === 'dance' || mood === 'celebrate';

  if (skin.id === 'robot') {
    // LED eyes
    ctx.shadowBlur = 9; ctx.shadowColor = skin.eye;
    ctx.fillStyle = skin.eye;
    const ew = hR * 0.22, eh = hR * 0.17;
    if (!isBlinking && !sleeping) {
      ctx.beginPath(); roundRectPath(ctx, -hR * 0.48 - ew * 0.5, eyeY - eh * 0.5, ew, eh, 3); ctx.fill();
      ctx.beginPath(); roundRectPath(ctx, hR * 0.26, eyeY - eh * 0.5, ew, eh, 3); ctx.fill();
    } else {
      ctx.fillRect(-hR * 0.48 - ew * 0.5, eyeY - 1.5, ew, 3);
      ctx.fillRect(hR * 0.26, eyeY - 1.5, ew, 3);
    }
    // LED mouth
    for (let i = 0; i < 5; i++) {
      const active = happy ? Math.random() > 0.28 : i % 2 === 0;
      if (active) ctx.fillRect(-hR * 0.47 + i * hR * 0.22, hY + hR * 0.34, hR * 0.18, hR * 0.13);
    }
    ctx.shadowBlur = 0;

  } else if (sleeping) {
    // Closed-eye arcs
    ctx.fillStyle = skin.eye;
    ctx.strokeStyle = skin.eye;
    ctx.lineWidth = Math.max(1.5, hR * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-hR * 0.32, eyeY, hR * 0.14, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc( hR * 0.32, eyeY, hR * 0.14, Math.PI, 0); ctx.stroke();

    // Muzzle + sleepy smile
    ctx.fillStyle = skin.belly;
    ctx.beginPath(); ctx.ellipse(0, hY + hR * 0.29, hR * 0.3, hR * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = skin.nose;
    ctx.lineWidth = Math.max(1.5, hR * 0.055);
    ctx.beginPath(); ctx.arc(0, hY + hR * 0.32, hR * 0.1, 0.35, Math.PI - 0.35); ctx.stroke();

  } else {
    // Organic eyes
    const eyeSY = isBlinking ? 0.08 : 1;
    ctx.fillStyle = skin.eye;
    ctx.beginPath(); ctx.ellipse(-hR * 0.32, eyeY, hR * 0.115, hR * 0.14 * eyeSY, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( hR * 0.32, eyeY, hR * 0.115, hR * 0.14 * eyeSY, 0, 0, Math.PI * 2); ctx.fill();

    if (!isBlinking) {
      // Eye shine
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.beginPath(); ctx.arc(-hR * 0.27, eyeY - hR * 0.07, hR * 0.044, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc( hR * 0.37, eyeY - hR * 0.07, hR * 0.044, 0, Math.PI * 2); ctx.fill();
    }

    // Muzzle
    ctx.fillStyle = skin.belly;
    ctx.beginPath(); ctx.ellipse(0, hY + hR * 0.28, hR * 0.3, hR * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    // Nose
    ctx.fillStyle = skin.nose;
    ctx.beginPath(); ctx.arc(0, hY + hR * 0.2, hR * 0.09, 0, Math.PI * 2); ctx.fill();

    // Mouth
    ctx.strokeStyle = skin.nose;
    ctx.lineWidth = Math.max(1.5, hR * 0.055);
    ctx.lineCap = 'round';
    if (happy) {
      ctx.beginPath(); ctx.arc(0, hY + hR * 0.27, hR * 0.16, 0.22, Math.PI - 0.22); ctx.stroke();
      // Blush
      ctx.fillStyle = 'rgba(255, 120, 120, 0.24)';
      ctx.beginPath(); ctx.ellipse(-hR * 0.53, hY + hR * 0.22, hR * 0.2, hR * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse( hR * 0.53, hY + hR * 0.22, hR * 0.2, hR * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, hY + hR * 0.31, hR * 0.11, 0.3, Math.PI - 0.3); ctx.stroke();
    }
  }

  // ── Front arm ────────────────────────────────────────────
  ctx.save();
  ctx.translate(bRx * 0.92, bY - bRy * 0.18);
  ctx.rotate(-Math.PI * 0.14 + armAngle * 0.58);
  drawLimb(ctx, s * 0.1, s * 0.21, skin.accent, skin.body);
  ctx.restore();

  // ── Front leg ────────────────────────────────────────────
  ctx.save();
  ctx.translate(bRx * 0.5, -s * 0.1);
  ctx.rotate(legR - 0.14);
  drawLimb(ctx, s * 0.115, s * 0.27, skin.body, skin.accent);
  ctx.restore();

  // ── Cat tail ─────────────────────────────────────────────
  if (skin.id === 'cat') {
    ctx.strokeStyle = skin.body;
    ctx.lineWidth = s * 0.1;
    ctx.lineCap = 'round';
    const tw = Math.sin(legPhase * 1.4) * 0.45;
    ctx.beginPath();
    ctx.moveTo(bRx * 0.85, bY + bRy * 0.62);
    ctx.quadraticCurveTo(bRx * 1.55, bY, bRx * 1.38 + Math.sin(tw) * s * 0.22, bY - bRy * 0.52);
    ctx.stroke();
  }

  // ── Accessories ──────────────────────────────────────────
  if (skin.id === 'bear' || skin.id === 'cat') {
    // DJ Headphones
    const hpColor = skin.id === 'bear' ? '#2d1b0e' : '#1a1a2e';
    ctx.strokeStyle = hpColor;
    ctx.lineWidth = s * (skin.id === 'bear' ? 0.038 : 0.042);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, hY - hR * 0.48, hR * 0.84, Math.PI + 0.22, -0.22);
    ctx.stroke();
    ctx.fillStyle = hpColor;
    ctx.beginPath(); ctx.arc(-hR * 0.8, hY - hR * 0.66, hR * 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( hR * 0.8, hY - hR * 0.66, hR * 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin.glow;
    ctx.shadowBlur = 5; ctx.shadowColor = skin.glow;
    ctx.beginPath(); ctx.arc(-hR * 0.8, hY - hR * 0.66, hR * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( hR * 0.8, hY - hR * 0.66, hR * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

  } else if (skin.id === 'bunny') {
    // Mini crown
    ctx.fillStyle = '#fbbf24';
    ctx.shadowBlur = 6; ctx.shadowColor = '#fbbf24aa';
    ctx.beginPath();
    ctx.moveTo(-hR * 0.38, hY - hR * 0.88);
    ctx.lineTo(-hR * 0.38, hY - hR * 1.1);
    ctx.lineTo(-hR * 0.16, hY - hR * 0.96);
    ctx.lineTo(0,           hY - hR * 1.18);
    ctx.lineTo( hR * 0.16, hY - hR * 0.96);
    ctx.lineTo( hR * 0.38, hY - hR * 1.1);
    ctx.lineTo( hR * 0.38, hY - hR * 0.88);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // Crown gems
    for (const gx of [-hR * 0.2, 0, hR * 0.2]) {
      ctx.fillStyle = ['#ef4444', '#a855f7', '#06b6d4'][Math.floor((gx / hR + 0.25) * 10) % 3];
      ctx.beginPath(); ctx.arc(gx, hY - hR * 1.06, hR * 0.055, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ── Sub-drawing helpers ────────────────────────────────────

function drawLimb(ctx: CanvasRenderingContext2D, rx: number, len: number, mainColor: string, tipColor: string) {
  ctx.fillStyle = mainColor;
  ctx.beginPath();
  ctx.ellipse(0, len * 0.44, rx, len * 0.47, 0, 0, Math.PI * 2);
  ctx.fill();
  // Paw / foot
  ctx.fillStyle = tipColor;
  ctx.beginPath();
  ctx.arc(0, len * 0.87, rx * 1.05, 0, Math.PI * 2);
  ctx.fill();
}

function drawBunnyEars(ctx: CanvasRenderingContext2D, hY: number, hR: number, skin: PetSkin) {
  for (const side of [-1, 1] as const) {
    ctx.save();
    ctx.translate(side * hR * 0.41, hY - hR * 0.78);
    ctx.rotate(side * 0.13);
    ctx.fillStyle = skin.body;
    ctx.beginPath();
    ctx.ellipse(0, -hR * 1.0, hR * 0.22, hR * 1.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin.belly;
    ctx.beginPath();
    ctx.ellipse(0, -hR * 1.0, hR * 0.12, hR * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawCatEars(ctx: CanvasRenderingContext2D, hY: number, hR: number, skin: PetSkin) {
  for (const side of [-1, 1] as const) {
    ctx.save();
    ctx.translate(side * hR * 0.5, hY - hR * 0.8);
    ctx.fillStyle = skin.body;
    ctx.beginPath();
    ctx.moveTo(-hR * 0.22, 0);
    ctx.lineTo(side * hR * 0.07, -hR * 0.58);
    ctx.lineTo(hR * 0.22, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = skin.belly;
    ctx.beginPath();
    ctx.moveTo(-hR * 0.13, -hR * 0.05);
    ctx.lineTo(side * hR * 0.04, -hR * 0.4);
    ctx.lineTo(hR * 0.13, -hR * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawMusicNoteGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  // Beamed sixteenth-note pair
  ctx.beginPath();
  ctx.arc(x - size * 0.1,  y + size * 0.42, size * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + size * 0.76, y + size * 0.38, size * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + size * 0.17, y - size * 0.62, size * 0.1, size * 1.0);
  ctx.fillRect(x + size * 0.94, y - size * 0.62, size * 0.1, size * 0.9);
  ctx.fillRect(x + size * 0.17, y - size * 0.62, size * 0.87, size * 0.13);
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function spawnStars(
  pet: PetState,
  cx: number, cy: number,
  count: number,
  colors: string[],
) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd   = 2 + Math.random() * 3.5;
    pet.stars.push({
      x: cx + (Math.random() - 0.5) * 20,
      y: cy + (Math.random() - 0.5) * 10,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - 0.8,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      r: 2.5 + Math.random() * 3.5,
    });
  }
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
