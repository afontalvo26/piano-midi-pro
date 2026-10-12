// ============================================================
// NeonRunnerAvatar — SVG physics-based character
// Replaces PianoPetRive with pure CSS/SVG + JS physics
// ============================================================

import { useEffect, useRef } from "react";

export interface NeonRunnerAvatarProps {
  canvasWidth: number;
  canvasHeight: number;
  groundY: number;
  activeKeys: ReadonlySet<number>; // MIDI numbers of pressed keys
  keyPositions: Map<number, { x: number; width: number }>; // MIDI -> {x, width}
  show: boolean;
  fxColor?: string;
}

interface CharState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  squash: number;
  field: number;
  ring: number;
  ringR: number;
}

interface Threat {
  x: number;
  t: number;
  power: number;
}

export function NeonRunnerAvatar({
  canvasWidth,
  canvasHeight,
  groundY,
  activeKeys,
  keyPositions,
  show,
  fxColor = "#6cf0ff",
}: NeonRunnerAvatarProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const charRef = useRef<CharState>({
    x: canvasWidth * 0.22,
    y: groundY,
    vx: 0,
    vy: 0,
    squash: 0,
    field: 0,
    ring: 0,
    ringR: 20,
  });
  const threatsRef = useRef<Threat[]>([]);
  const lastFrameRef = useRef(0);
  const rafRef = useRef<number>(0);
  const prevActiveKeysRef = useRef<Set<number>>(new Set());

  // Detect new key presses and trigger physics
  useEffect(() => {
    if (!show) return;

    const newKeys = new Set(
      [...activeKeys].filter((k) => !prevActiveKeysRef.current.has(k)),
    );

    newKeys.forEach((midi) => {
      const pos = keyPositions.get(midi);
      if (!pos) return;

      const now = performance.now();
      const keyX = pos.x + pos.width / 2;
      threatsRef.current.push({ x: keyX, t: now, power: 1.0 });

      // Apply impulse if character is near
      const char = charRef.current;
      const dx = char.x - keyX;
      const range = pos.width * 1.35 + 28;

      if (Math.abs(dx) < range && char.y > groundY - 68) {
        const proximity = 1 - Math.abs(dx) / range;
        const impulse = 620 + 450 + proximity * 260;
        char.vy = Math.min(char.vy, -impulse);
        char.vx += (dx >= 0 ? 1 : -1) * (240 + 220 + proximity * 280);
        char.squash = -0.16;
        char.ring = 1;
        char.ringR = 22;
        char.field = 1;
      }
    });

    prevActiveKeysRef.current = new Set(activeKeys);
  }, [activeKeys, keyPositions, show, groundY]);

  // Physics update loop
  useEffect(() => {
    if (!show) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const update = (now: number) => {
      const dt = Math.min(0.033, (now - lastFrameRef.current) / 1000 || 0.016);
      lastFrameRef.current = now;

      const char = charRef.current;
      const threats = threatsRef.current;

      // Clean old threats
      while (threats.length && now - threats[0].t > 620) threats.shift();

      // Calculate steering force from threats
      let steer = 0;
      threats.forEach((th) => {
        const age = (now - th.t) / 620;
        const dx = char.x - th.x;
        const falloff =
          Math.max(0, Math.min(1, 1 - Math.abs(dx) / 170)) * (1 - age);
        steer += (dx >= 0 ? 1 : -1) * 1200 * falloff * th.power;
      });

      // Apply steering
      char.vx += steer * dt;
      char.vx *= Math.pow(0.06, dt);
      char.x += char.vx * dt;

      // Boundaries
      if (char.x < 42) {
        char.x = 42;
        char.vx = Math.abs(char.vx) * 0.45;
      }
      if (char.x > canvasWidth - 42) {
        char.x = canvasWidth - 42;
        char.vx = -Math.abs(char.vx) * 0.45;
      }

      // Gravity
      char.vy += 1850 * dt;
      char.y += char.vy * dt;

      // Ground collision
      if (char.y > groundY) {
        char.y = groundY;
        if (Math.abs(char.vy) > 110) {
          char.vy *= -0.22;
          char.squash = 0.22;
        } else {
          char.vy = 0;
        }
      }

      // Smooth transitions
      char.squash += (0 - char.squash) * (1 - Math.pow(0.0008, dt));
      char.field += (0 - char.field) * (1 - Math.pow(0.004, dt));
      char.ring += (0 - char.ring) * (1 - Math.pow(0.006, dt));
      char.ringR += 86 * dt;

      // Update SVG transforms
      if (svgRef.current) {
        const air = Math.max(0, Math.min(1, (groundY - char.y) / 160));
        const stretch =
          Math.max(-0.12, Math.min(0.16, -char.vy / 1900)) - char.squash;
        const sx = 1 - stretch * 0.46;
        const sy = 1 + stretch;
        const rot = Math.max(-14, Math.min(14, char.vx / 42));

        const avatarRoot = svgRef.current.querySelector("#avatarRoot");
        const shadow = svgRef.current.querySelector("#shadow");
        const hitRing = svgRef.current.querySelector("#hitRing");
        const forceField = svgRef.current.querySelector("#forceField");

        if (avatarRoot) {
          avatarRoot.setAttribute(
            "transform",
            `translate(${char.x.toFixed(2)} ${char.y.toFixed(2)}) rotate(${rot.toFixed(2)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`,
          );
        }

        if (shadow) {
          shadow.setAttribute("cx", char.x.toString());
          shadow.setAttribute("cy", (groundY + 12).toString());
          shadow.setAttribute("rx", (34 + (1 - air) * 18).toString());
          shadow.setAttribute("ry", (5 + (1 - air) * 5).toString());
          shadow.setAttribute("opacity", (0.25 + (1 - air) * 0.42).toString());
        }

        if (hitRing) {
          hitRing.setAttribute("cx", char.x.toString());
          hitRing.setAttribute("cy", (char.y - 28).toString());
          hitRing.setAttribute("r", char.ringR.toString());
          hitRing.setAttribute("opacity", char.ring.toFixed(3));
        }

        if (forceField) {
          forceField.setAttribute("cx", char.x.toString());
          forceField.setAttribute("cy", (char.y - 31).toString());
          const fieldOpacity = Math.max(
            0,
            Math.min(0.85, char.field + Math.min(1, Math.abs(steer) / 2200) * 0.45),
          );
          forceField.setAttribute("opacity", fieldOpacity.toString());
          forceField.setAttribute(
            "transform",
            `rotate(${(now / 22) % 360} ${char.x} ${char.y - 31})`,
          );
        }
      }

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [show, canvasWidth, groundY]);

  if (!show) return null;

  return (
    <div
      className="neon-runner-overlay"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
      >
        <defs>
          <linearGradient id="avatarBody" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#f2edff" />
            <stop offset=".28" stopColor="#bba6ff" />
            <stop offset=".7" stopColor={fxColor} />
            <stop offset="1" stopColor="#493a96" />
          </linearGradient>
          <radialGradient id="coreGrad" cx="42%" cy="35%" r="70%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".42" stopColor="#8df8ff" />
            <stop offset="1" stopColor="#7c55ff" />
          </radialGradient>
          <filter id="avatarGlow" x="-70%" y="-90%" width="240%" height="260%">
            <feGaussianBlur stdDeviation="7" result="b" />
            <feColorMatrix
              in="b"
              type="matrix"
              values="0 0 0 0 .35 0 0 0 0 .2 0 0 0 0 1 0 0 0 .8 0"
              result="g"
            />
            <feMerge>
              <feMergeNode in="g" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="cyanGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <ellipse id="shadow" cx="0" cy="0" rx="32" ry="8" fill="rgba(0,0,0,.55)" style={{ filter: "blur(3px)" }} />
        <circle id="hitRing" cx="0" cy="0" r="20" fill="none" stroke="rgba(255,79,199,.72)" strokeWidth="4" opacity="0" />
        <circle id="forceField" cx="0" cy="0" r="55" fill="none" stroke={`${fxColor}88`} strokeWidth="2" strokeDasharray="10 7" opacity="0" />

        <g id="avatarRoot" transform="translate(210 282)" filter="url(#avatarGlow)">
          <path className="avatar-limb" d="M -22 -30 C -48 -28 -55 -12 -42 2" fill="none" stroke="#c5b7ff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" opacity=".92" />
          <path className="avatar-limb alt" d="M 22 -30 C 48 -27 56 -12 41 2" fill="none" stroke="#72f4ff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" opacity=".92" />
          <path className="avatar-limb alt" d="M -13 -4 C -26 13 -20 23 -6 25" fill="none" stroke="#72f4ff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" opacity=".92" />
          <path className="avatar-limb" d="M 13 -4 C 26 13 20 23 6 25" fill="none" stroke="#c5b7ff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" opacity=".92" />
          <path className="antenna" d="M 0 -67 C 2 -81 13 -88 28 -91" stroke="#c8bbff" strokeWidth="2.5" strokeLinecap="round" />
          <circle className="orb" cx="32" cy="-93" r="6" fill="#9d7cff" />
          <path className="avatar-body" d="M 0 -76 C 31 -76 45 -53 45 -32 C 45 -2 24 15 0 15 C -24 15 -45 -2 -45 -32 C -45 -53 -31 -76 0 -76 Z" fill="url(#avatarBody)" stroke="rgba(255,255,255,.62)" strokeWidth="1.25" />
          <ellipse className="avatar-core" cx="0" cy="-28" rx="27" ry="33" fill="url(#coreGrad)" opacity=".95" />
          <rect className="avatar-visor" x="-25" y="-48" width="50" height="17" rx="8" fill="#101522" stroke="rgba(211, 246, 255, .92)" strokeWidth="1" />
          <circle className="avatar-eye" cx="-10" cy="-39" r="4" fill="#70f6ff" filter="url(#cyanGlow)" />
          <circle className="avatar-eye" cx="10" cy="-39" r="4" fill="#70f6ff" filter="url(#cyanGlow)" />
          <path d="M -14 -21 C -4 -14 5 -14 15 -21" fill="none" stroke="rgba(15,21,34,.8)" strokeWidth="3" strokeLinecap="round" />
          <path d="M -29 -58 L -17 -66 L -12 -55" fill="none" stroke="rgba(255,255,255,.65)" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>

      <style>{`
        .avatar-limb {
          animation: limbFloat 1.2s ease-in-out infinite alternate;
        }
        .avatar-limb.alt {
          animation-delay: -.55s;
        }
        .antenna {
          animation: antenna 1.4s ease-in-out infinite alternate;
          transform-origin: 0 -56px;
        }
        .orb {
          animation: orb 1.8s ease-in-out infinite alternate;
        }
        .avatar-eye {
          animation: visorPulse 1.55s ease-in-out infinite;
        }
        @keyframes visorPulse {
          0%, 100% { opacity: .65; }
          50% { opacity: 1; }
        }
        @keyframes limbFloat {
          from { transform: translateY(-1px); }
          to { transform: translateY(3px); }
        }
        @keyframes antenna {
          from { transform: rotate(-5deg); }
          to { transform: rotate(6deg); }
        }
        @keyframes orb {
          from { transform: translateY(-1px) scale(.92); }
          to { transform: translateY(2px) scale(1.08); }
        }
      `}</style>
    </div>
  );
}

// Made with Bob
