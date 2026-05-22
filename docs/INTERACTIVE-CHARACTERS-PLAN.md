
# Sistema de Personajes Interactivos con Física Realista CSS/SVG
## Plan Técnico Comprehensivo - Piano MIDI Pro

**Fecha:** Mayo 21, 2026  
**Versión:** 1.0  
**Estado:** Diseño y Especificación Técnica

---

## 📋 Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Investigación Técnica 2026](#investigación-técnica-2026)
3. [Sistema de Física Realista](#sistema-de-física-realista)
4. [Conceptos de Personajes](#conceptos-de-personajes)
5. [Comportamientos Interactivos](#comportamientos-interactivos)
6. [Arquitectura Técnica](#arquitectura-técnica)
7. [Roadmap de Prototipos](#roadmap-de-prototipos)
8. [Guías de Implementación](#guías-de-implementación)
9. [Métricas de Éxito](#métricas-de-éxito)

---

## 1. Resumen Ejecutivo

### 1.1 Objetivo del Proyecto

Desarrollar un sistema de personajes interactivos avanzados para Piano MIDI Pro que reemplace los personajes decorativos actuales (canvas 2D básicos) con personajes que utilicen física realista y las técnicas más modernas de CSS/SVG disponibles en 2026.

### 1.2 Enfoque Técnico

- **Tecnología Base:** CSS/SVG con JavaScript mínimo para física
- **Renderizado:** 60 FPS obligatorio
- **Física:** Motor personalizado con ecuaciones matemáticas precisas
- **Interactividad:** Respuesta en tiempo real a eventos MIDI
- **Modularidad:** Prototipos aislados e independientes

### 1.3 Restricciones Clave

- ✅ NO modificar aplicación principal
- ✅ Prototipos completamente aislados
- ✅ HTML/CSS/SVG puro + JavaScript mínimo
- ✅ 60 FPS obligatorio
- ✅ Compatible con Chrome/Edge/Firefox/Safari modernos

---

## 2. Investigación Técnica 2026

### 2.1 Estado del Arte: Animaciones CSS/SVG en 2026

#### 2.1.1 CSS Animation Timeline (Nivel 2)

**Estado:** Ampliamente soportado en 2026

```css
@keyframes bounce {
  from { transform: translateY(0); }
  to { transform: translateY(-100px); }
}

.character {
  animation: bounce 1s ease-in-out;
  animation-timeline: scroll(root);
  animation-range: entry 0% cover 50%;
}
```

**Capacidades:**
- Animaciones vinculadas a scroll
- Control preciso de timing
- Sincronización con eventos del DOM
- Soporte para múltiples timelines

**Uso en Proyecto:**
- Sincronizar movimientos con notas MIDI
- Animaciones basadas en BPM
- Transiciones suaves entre estados

#### 2.1.2 CSS Motion Path (Nivel 1 + Extensiones 2026)

**Estado:** Soporte completo con extensiones

```css
.character {
  offset-path: path('M 0 0 Q 50 -100 100 0');
  offset-distance: 0%;
  offset-rotate: auto;
  animation: move-along-path 2s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes move-along-path {
  to { offset-distance: 100%; }
}
```

**Capacidades:**
- Trayectorias complejas con curvas Bézier
- Rotación automática según dirección
- Interpolación suave
- Soporte para SVG paths

**Uso en Proyecto:**
- Movimientos evasivos curvos
- Trayectorias parabólicas (saltos)
- Animaciones de celebración

#### 2.1.3 CSS @property (Custom Properties Tipadas)

**Estado:** Estándar en 2026

```css
@property --bounce-height {
  syntax: '<length>';
  initial-value: 0px;
  inherits: false;
}

.character {
  --bounce-height: 0px;
  transform: translateY(var(--bounce-height));
  transition: --bounce-height 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.character.jumping {
  --bounce-height: -80px;
}
```

**Capacidades:**
- Propiedades CSS animables personalizadas
- Interpolación automática de valores
- Type-safe (sintaxis definida)
- Mejor rendimiento que variables normales

**Uso en Proyecto:**
- Propiedades físicas animables (velocidad, aceleración)
- Estados de personaje interpolables
- Transiciones suaves entre valores numéricos

#### 2.1.4 View Transitions API (Nivel 2)

**Estado:** Ampliamente adoptado en 2026

```javascript
// Transición suave entre estados de personaje
async function changeCharacterState(newState) {
  if (!document.startViewTransition) {
    applyState(newState);
    return;
  }
  
  const transition = document.startViewTransition(() => {
    applyState(newState);
  });
  
  await transition.finished;
}
```

```css
::view-transition-old(character),
::view-transition-new(character) {
  animation-duration: 0.4s;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

::view-transition-old(character) {
  animation-name: fade-scale-out;
}

::view-transition-new(character) {
  animation-name: fade-scale-in;
}
```

**Capacidades:**
- Transiciones automáticas entre estados DOM
- Animaciones coordinadas de múltiples elementos
- Soporte para transiciones complejas
- Fallback automático en navegadores antiguos

**Uso en Proyecto:**
- Cambios de skin de personaje
- Transiciones entre modos (idle → dance → celebrate)
- Efectos de aparición/desaparición

#### 2.1.5 CSS Houdini: Animation Worklet

**Estado:** Soporte estable en Chrome/Edge, experimental en otros

```javascript
// animation-worklet.js
registerAnimator('physics-bounce', class {
  constructor(options) {
    this.gravity = 980; // px/s²
    this.velocity = 0;
    this.position = 0;
    this.restitution = 0.7; // coeficiente de rebote
  }
  
  animate(currentTime, effect) {
    const dt = (currentTime - this.lastTime) / 1000 || 0;
    this.lastTime = currentTime;
    
    // Física de gravedad
    this.velocity += this.gravity * dt;
    this.position += this.velocity * dt;
    
    // Colisión con suelo
    if (this.position >= 0) {
      this.position = 0;
      this.velocity = -this.velocity * this.restitution;
      
      // Detener si velocidad muy baja
      if (Math.abs(this.velocity) < 10) {
        this.velocity = 0;
      }
    }
    
    effect.localTime = this.position;
  }
});
```

```css
.character {
  animation-name: physics-bounce;
  animation-timeline: worklet;
}
```

**Capacidades:**
- Física en thread separado (mejor rendimiento)
- Animaciones complejas sin bloquear main thread
- Control total sobre interpolación
- Integración con CSS animations

**Uso en Proyecto:**
- Motor de física principal
- Cálculos de colisiones
- Simulación de gravedad y rebotes

**Limitación:** Requiere fallback para Firefox/Safari

#### 2.1.6 Web Animations API (WAAPI) - Nivel 2

**Estado:** Soporte completo en todos los navegadores modernos

```javascript
const character = document.querySelector('.character');

// Animación programática con física
const jumpAnimation = character.animate([
  { transform: 'translateY(0px)', easing: 'cubic-bezier(0.33, 1, 0.68, 1)' },
  { transform: 'translateY(-120px)', offset: 0.4 },
  { transform: 'translateY(0px)', easing: 'cubic-bezier(0.32, 0, 0.67, 0)' }
], {
  duration: 800,
  iterations: 1,
  fill: 'forwards'
});

// Control dinámico
jumpAnimation.playbackRate = bpm / 120; // Sincronizar con BPM
jumpAnimation.onfinish = () => {
  triggerLandingEffect();
};
```

**Capacidades:**
- Control programático completo
- Composición de animaciones
- Sincronización precisa
- Callbacks y eventos
- Modificación en tiempo real

**Uso en Proyecto:**
- Animaciones reactivas a MIDI
- Sincronización con BPM
- Composición de movimientos complejos
- Control de velocidad dinámico

#### 2.1.7 SVG SMIL - Alternativas Modernas

**Estado:** SMIL deprecado, reemplazado por CSS + WAAPI

**Alternativa Recomendada: CSS + SVG**

```html
<svg viewBox="0 0 200 200" class="character-svg">
  <defs>
    <filter id="glow">
      <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  
  <g class="character-body">
    <circle cx="100" cy="100" r="40" fill="var(--character-color)"/>
    <circle cx="85" cy="90" r="5" fill="#000" class="eye-left"/>
    <circle cx="115" cy="90" r="5" fill="#000" class="eye-right"/>
  </g>
</svg>
```

```css
.character-body {
  transform-origin: 100px 100px;
  animation: breathe 2s ease-in-out infinite;
}

@keyframes breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.eye-left, .eye-right {
  animation: blink 4s step-end infinite;
}

@keyframes blink {
  0%, 95%, 100% { opacity: 1; }
  95.1%, 97% { opacity: 0; }
}
```

**Uso en Proyecto:**
- Personajes vectoriales escalables
- Animaciones de partes del cuerpo
- Efectos visuales (glow, sombras)
- Expresiones faciales

#### 2.1.8 Scroll-Driven Animations

**Estado:** Soporte nativo en Chrome/Edge, polyfill para otros

```css
@keyframes character-react {
  from {
    transform: translateY(0) rotate(0deg);
    filter: hue-rotate(0deg);
  }
  to {
    transform: translateY(-50px) rotate(360deg);
    filter: hue-rotate(360deg);
  }
}

.character {
  animation: character-react linear;
  animation-timeline: scroll(nearest);
  animation-range: entry 0% exit 100%;
}
```

**Uso en Proyecto:**
- Reacciones a scroll de partitura
- Animaciones vinculadas a progreso de canción
- Efectos contextuales

### 2.2 Comparación de Técnicas

| Técnica | Rendimiento | Compatibilidad | Complejidad | Uso Recomendado |
|---------|-------------|----------------|-------------|-----------------|
| CSS Animations | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | Animaciones simples, loops |
| CSS Transitions | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐ | Cambios de estado |
| WAAPI | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | Control programático |
| Motion Path | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | Trayectorias complejas |
| @property | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | Propiedades personalizadas |
| View Transitions | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | Cambios de estado complejos |
| Houdini Worklet | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | Física compleja |
| requestAnimationFrame | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Física personalizada |

### 2.3 Recomendaciones Técnicas

#### Stack Tecnológico Recomendado

**Capa 1: Renderizado Base**
- SVG para geometría de personajes
- CSS Custom Properties para estado
- CSS Animations para loops básicos

**Capa 2: Física y Lógica**
- JavaScript con requestAnimationFrame
- Motor de física personalizado
- WAAPI para animaciones complejas

**Capa 3: Efectos Avanzados**
- CSS Motion Path para trayectorias
- CSS Filters para efectos visuales
- View Transitions para cambios de estado

**Capa 4: Optimización**
- CSS `will-change` para hints al navegador
- `transform` y `opacity` para animaciones GPU
- Debouncing de eventos MIDI

#### Patrón de Arquitectura

```
┌─────────────────────────────────────┐
│   MIDI Events (Piano Keys)          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Event Handler & State Manager     │
│   - Detectar colisiones             │
│   - Actualizar estado físico        │
│   - Calcular reacciones             │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Physics Engine (JavaScript)       │
│   - Gravedad                        │
│   - Colisiones                      │
│   - Momentum                        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Animation Controller (WAAPI)      │
│   - Aplicar transformaciones        │
│   - Sincronizar con CSS             │
│   - Gestionar timelines             │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Rendering Layer (CSS/SVG)         │
│   - Transformaciones GPU            │
│   - Efectos visuales                │
│   - Composición final               │
└─────────────────────────────────────┘
```

---

## 3. Sistema de Física Realista

### 3.1 Fundamentos Matemáticos

#### 3.1.1 Gravedad

**Ecuación de Movimiento Uniformemente Acelerado:**

```
y(t) = y₀ + v₀t + ½gt²
v(t) = v₀ + gt

Donde:
- y(t) = posición vertical en tiempo t
- y₀ = posición inicial
- v₀ = velocidad inicial
- g = aceleración gravitacional (9.8 m/s² → 980 px/s² en pantalla)
- t = tiempo en segundos
```

**Implementación JavaScript:**

```javascript
class GravitySimulator {
  constructor() {
    this.gravity = 980; // px/s² (ajustado para pantalla)
    this.position = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.mass = 1; // kg (normalizado)
  }
  
  update(deltaTime) {
    // Convertir deltaTime de ms a segundos
    const dt = deltaTime / 1000;
    
    // Actualizar velocidad: v = v₀ + gt
    this.velocity.y += this.gravity * dt;
    
    // Actualizar posición: y = y₀ + vt
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
  }
  
  applyForce(force) {
    // F = ma → a = F/m
    const acceleration = {
      x: force.x / this.mass,
      y: force.y / this.mass
    };
    
    // Aplicar aceleración a velocidad
    this.velocity.x += acceleration.x;
    this.velocity.y += acceleration.y;
  }
}
```

**Aplicación CSS:**

```css
@property --gravity-y {
  syntax: '<length>';
  initial-value: 0px;
  inherits: false;
}

.character {
  --gravity-y: 0px;
  transform: translateY(var(--gravity-y));
  transition: --gravity-y 0.016s linear; /* 60 FPS */
}
```

#### 3.1.2 Movimiento Proyectil (Trayectoria Parabólica)

**Ecuaciones Paramétricas:**

```
x(t) = x₀ + v₀ₓt
y(t) = y₀ + v₀ᵧt - ½gt²

Velocidad inicial descompuesta:
v₀ₓ = v₀ cos(θ)
v₀ᵧ = v₀ sin(θ)

Donde:
- θ = ángulo de lanzamiento
- v₀ = velocidad inicial
```

**Implementación:**

```javascript
class ProjectileMotion {
  constructor(initialPos, angle, speed) {
    this.position = { ...initialPos };
    this.angle = angle; // radianes
    this.speed = speed; // px/s
    
    // Descomponer velocidad
    this.velocity = {
      x: speed * Math.cos(angle),
      y: speed * Math.sin(angle)
    };
    
    this.gravity = 980;
    this.startTime = performance.now();
  }
  
  getPosition(currentTime) {
    const t = (currentTime - this.startTime) / 1000;
    
    return {
      x: this.position.x + this.velocity.x * t,
      y: this.position.y + this.velocity.y * t - 0.5 * this.gravity * t * t
    };
  }
  
  // Calcular tiempo de vuelo hasta y = groundLevel
  getFlightTime(groundLevel) {
    // Resolver: y₀ + v₀ᵧt - ½gt² = groundLevel
    // -½gt² + v₀ᵧt + (y₀ - groundLevel) = 0
    
    const a = -0.5 * this.gravity;
    const b = this.velocity.y;
    const c = this.position.y - groundLevel;
    
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return 0;
    
    const t1 = (-b + Math.sqrt(discriminant)) / (2 * a);
    const t2 = (-b - Math.sqrt(discriminant)) / (2 * a);
    
    return Math.max(t1, t2);
  }
}
```

**CSS Motion Path:**

```css
.character-jumping {
  offset-path: path('M 0 0 Q 150 -200 300 0');
  offset-distance: 0%;
  animation: projectile-motion 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

@keyframes projectile-motion {
  to { offset-distance: 100%; }
}
```

#### 3.1.3 Colisiones y Conservación de Momentum

**Colisión Elástica (1D):**

```
Conservación de momentum:
m₁v₁ + m₂v₂ = m₁v₁' + m₂v₂'

Conservación de energía cinética:
½m₁v₁² + ½m₂v₂² = ½m₁v₁'² + ½m₂v₂'²

Velocidades finales:
v₁' = ((m₁ - m₂)v₁ + 2m₂v₂) / (m₁ + m₂)
v₂' = ((m₂ - m₁)v₂ + 2m₁v₁) / (m₁ + m₂)
```

**Implementación:**

```javascript
class CollisionSystem {
  // Colisión elástica entre dos objetos
  static elasticCollision(obj1, obj2) {
    const m1 = obj1.mass;
    const m2 = obj2.mass;
    const v1 = obj1.velocity;
    const v2 = obj2.velocity;
    
    // Calcular velocidades finales
    const v1Final = {
      x: ((m1 - m2) * v1.x + 2 * m2 * v2.x) / (m1 + m2),
      y: ((m1 - m2) * v1.y + 2 * m2 * v2.y) / (m1 + m2)
    };
    
    const v2Final = {
      x: ((m2 - m1) * v2.x + 2 * m1 * v1.x) / (m1 + m2),
      y: ((m2 - m1) * v2.y + 2 * m1 * v1.y) / (m1 + m2)
    };
    
    return { v1Final, v2Final };
  }
  
  // Detectar colisión AABB (Axis-Aligned Bounding Box)
  static checkAABBCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
  }
  
  // Detectar colisión circular
  static checkCircleCollision(circle1, circle2) {
    const dx = circle2.x - circle1.x;
    const dy = circle2.y - circle1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    return distance < (circle1.radius + circle2.radius);
  }
}
```

#### 3.1.4 Coeficiente de Restitución (Bounce)

**Ecuación:**

```
e = -v_separation / v_approach

Donde:
- e = coeficiente de restitución (0 = inelástico, 1 = perfectamente elástico)
- v_separation = velocidad de separación después de colisión
- v_approach = velocidad de aproximación antes de colisión

Para rebote con suelo:
v_final = -e × v_initial
```

**Implementación:**

```javascript
class BouncePhysics {
  constructor(restitution = 0.7) {
    this.restitution = restitution; // 0.7 = rebote realista
    this.minBounceVelocity = 10; // px/s - detener si muy lento
  }
  
  applyBounce(velocity, normal = { x: 0, y: -1 }) {
    // Calcular componente de velocidad en dirección normal
    const dotProduct = velocity.x * normal.x + velocity.y * normal.y;
    
    // Reflejar velocidad con pérdida de energía
    return {
      x: velocity.x - 2 * dotProduct * normal.x * this.restitution,
      y: velocity.y - 2 * dotProduct * normal.y * this.restitution
    };
  }
  
  shouldStopBouncing(velocity) {
    const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);
    return speed < this.minBounceVelocity;
  }
  
  // Simular múltiples rebotes con pérdida de energía
  simulateBounces(initialHeight, groundLevel) {
    const bounces = [];
    let height = initialHeight;
    let bounceCount = 0;
    
    while (height > 1 && bounceCount < 10) {
      bounces.push({
        height: height,
        time: Math.sqrt(2 * height / 980) // tiempo de caída
      });
      
      height *= this.restitution * this.restitution; // pérdida de energía
      bounceCount++;
    }
    
    return bounces;
  }
}
```

**CSS con Custom Properties:**

```css
@property --bounce-velocity {
  syntax: '<number>';
  initial-value: 0;
  inherits: false;
}

@property --bounce-height {
  syntax: '<length>';
  initial-value: 0px;
  inherits: false;
}

.character-bouncing {
  --bounce-velocity: -500; /* px/s inicial */
  --bounce-height: 0px;
  transform: translateY(var(--bounce-height));
  animation: bounce-sequence 2s cubic-bezier(0.36, 0, 0.66, -0.56);
}

@keyframes bounce-sequence {
  0% { --bounce-height: 0px; }
  15% { --bounce-height: -100px; } /* Primer rebote */
  30% { --bounce-height: 0px; }
  40% { --bounce-height: -49px; } /* Segundo rebote (0.7²) */
  50% { --bounce-height: 0px; }
  58% { --bounce-height: -24px; } /* Tercer rebote (0.7⁴) */
  66% { --bounce-height: 0px; }
  72% { --bounce-height: -12px; } /* Cuarto rebote */
  78% { --bounce-height: 0px; }
  100% { --bounce-height: 0px; }
}
```

#### 3.1.5 Fricción

**Ecuación de Fricción Cinética:**

```
F_friction = μ × N

Donde:
- μ = coeficiente de fricción (0.1 - 0.9)
- N = fuerza normal (perpendicular a superficie)

Desaceleración por fricción:
a_friction = -μ × g × sign(v)
v(t) = v₀ - μ × g × t
```

**Implementación:**

```javascript
class FrictionSystem {
  constructor(coefficient = 0.3) {
    this.coefficient = coefficient; // 0.3 = fricción moderada
    this.gravity = 980;
  }
  
  applyFriction(velocity, deltaTime, isGrounded) {
    if (!isGrounded) return velocity;
    
    const dt = deltaTime / 1000;
    const frictionForce = this.coefficient * this.gravity;
    
    // Aplicar fricción solo si hay movimiento
    if (Math.abs(velocity.x) > 0.1) {
      const frictionX = -Math.sign(velocity.x) * frictionForce * dt;
      velocity.x += frictionX;
      
      // Detener si cambió de signo (evitar oscilación)
      if (Math.sign(velocity.x) !== Math.sign(velocity.x - frictionX)) {
        velocity.x = 0;
      }
    }
    
    return velocity;
  }
  
  // Calcular distancia de deslizamiento
  getSlideDistance(initialVelocity) {
    // d = v₀² / (2μg)
    return (initialVelocity ** 2) / (2 * this.coefficient * this.gravity);
  }
}
```

#### 3.1.6 Spring Physics (Sistema Masa-Resorte)

**Ecuación de Hooke:**

```
F = -k × x

Donde:
- k = constante de rigidez del resorte
- x = desplazamiento desde posición de equilibrio

Con amortiguamiento:
F = -k × x - c × v

Donde:
- c = coeficiente de amortiguamiento
- v = velocidad

Ecuación diferencial:
m × a = -k × x - c × v
a = -(k/m) × x - (c/m) × v
```

**Implementación:**

```javascript
class SpringSystem {
  constructor(stiffness = 200, damping = 10, mass = 1) {
    this.k = stiffness; // N/m
    this.c = damping; // Ns/m
    this.m = mass; // kg
    
    this.position = 0;
    this.velocity = 0;
    this.target = 0;
  }
  
  update(deltaTime) {
    const dt = deltaTime / 1000;
    
    // Calcular desplazamiento desde target
    const displacement = this.position - this.target;
    
    // Fuerza del resorte: F = -kx - cv
    const springForce = -this.k * displacement;
    const dampingForce = -this.c * this.velocity;
    const totalForce = springForce + dampingForce;
    
    // Aceleración: a = F/m
    const acceleration = totalForce / this.m;
    
    // Integración de Euler
    this.velocity += acceleration * dt;
    this.position += this.velocity * dt;
    
    return this.position;
  }
  
  setTarget(newTarget) {
    this.target = newTarget;
  }
  
  // Calcular si el sistema está en reposo
  isAtRest(threshold = 0.01) {
    return Math.abs(this.position - this.target) < threshold &&
           Math.abs(this.velocity) < threshold;
  }
}
```

**CSS Spring Animation:**

```css
.character-spring {
  --spring-x: 0px;
  transform: translateX(var(--spring-x));
  transition: --spring-x 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Cubic-bezier que simula spring con overshoot */
.character-spring.bouncy {
  transition-timing-function: cubic-bezier(0.68, -0.55, 0.265, 1.55);
}
```

#### 3.1.7 Damping (Amortiguamiento)

**Tipos de Amortiguamiento:**

```
1. Underdamped (ζ < 1): Oscila antes de estabilizarse
2. Critically damped (ζ = 1): Retorna rápido sin oscilar
3. Overdamped (ζ > 1): Retorna lento sin oscilar

ζ = c / (2√(km))

Donde:
- ζ = ratio de amortiguamiento
- c = coeficiente de amortiguamiento
- k = rigidez del resorte
- m = masa
```

**Implementación:**

```javascript
class DampingSystem {
  static UNDERDAMPED = 0.5;
  static CRITICALLY_DAMPED = 1.0;
  static OVERDAMPED = 2.0;
  
  constructor(dampingRatio = DampingSystem.CRITICALLY_DAMPED) {
    this.dampingRatio = dampingRatio;
  }
  
  applyDamping(velocity, deltaTime) {
    const dt = deltaTime / 1000;
    
    // Factor de amortiguamiento exponencial
    const dampingFactor = Math.exp(-this.dampingRatio * 5 * dt);
    
    return {
      x: velocity.x * dampingFactor,
      y: velocity.y * dampingFactor
    };
  }
  
  // Calcular tiempo para alcanzar 95% del target
  getSettlingTime(naturalFrequency) {
    // t_s ≈ 3 / (ζω_n)
    return 3 / (this.dampingRatio * naturalFrequency);
  }
}
```

#### 3.1.8 Easing Functions Realistas

**Funciones de Suavizado Físicamente Precisas:**

```javascript
class PhysicsEasing {
  // Ease-out con física de desaceleración
  static easeOutQuad(t) {
    return t * (2 - t);
  }
  
  // Ease-out con gravedad simulada
  static easeOutGravity(t) {
    return 1 - Math.pow(1 - t, 2);
  }
  
  // Bounce realista con pérdida de energía
  static easeOutBounce(t) {
    const n1 = 7.5625;
    const d1 = 2.75;
    
    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  }
  
  // Elastic con oscilación amortiguada
  static easeOutElastic(t, amplitude = 1, period = 0.3) {
    if (t === 0 || t === 1) return t;
    
    const s = period / 4;
    return amplitude * Math.pow(2, -10 * t) * 
           Math.sin((t - s) * (2 * Math.PI) / period) + 1;
  }
  
  // Spring con overshoot
  static easeOutBack(t, overshoot = 1.70158) {
    return 1 + (overshoot + 1) * Math.pow(t - 1, 3) + 
           overshoot * Math.pow(t - 1, 2);
  }
}
```

**CSS Custom Easing:**

```css
/* Bounce realista */
@keyframes bounce-realistic {
  0% { transform: translateY(-100px); animation-timing-function: ease-in; }
  15% { transform: translateY(0); animation-timing-function: ease-out; }
  30% { transform: translateY(-49px); animation-timing-function: ease-in; }
  45% { transform: translateY(0); animation-timing-function: ease-out; }
  58% { transform: translateY(-24px); animation-timing-function: ease-in; }
  71% { transform: translateY(0); animation-timing-function: ease-out; }
  82% { transform: translateY(-12px); animation-timing-function: ease-in; }
  93% { transform: translateY(0); }
  100% { transform: translateY(0); }
}

/* Spring con overshoot */
.spring-animation {
  animation: spring-overshoot 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

/* Elastic */
.elastic-animation {
  animation: elastic-bounce 1s cubic-bezier(0.68, -0.6, 0.32, 1.6);
}
```

### 3.2 Motor de Física Integrado

**Arquitectura del Motor:**

```javascript
class PhysicsEngine {
  constructor() {
    this.entities = [];
    this.gravity = new GravitySimulator();
    this.collision = new CollisionSystem();
    this.bounce = new BouncePhysics(0.7);
    this.friction = new FrictionSystem(0.3);
    this.spring = new SpringSystem(200, 10, 1);
    this.damping = new DampingSystem(DampingSystem.CRITICALLY_DAMPED);
    
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.fixedTimeStep = 1000 / 60; // 60 FPS
  }
  
  addEntity(entity) {
    this.entities.push(entity);
  }
  
  removeEntity(entity) {
    const index = this.entities.indexOf(entity);
    if (index > -1) {
      this.entities.splice(index, 1);
    }
  }
  
  update() {
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    
    // Fixed timestep para física estable
    this.accumulator += deltaTime;
    
    while (this.accumulator >= this.fixedTimeStep) {
      this.fixedUpdate(this.fixedTimeStep);
      this.accumulator -= this.fixedTimeStep;
    }
    
    // Interpolar para suavidad visual
    const alpha = this.accumulator / this.fixedTimeStep;
    this.interpolate(alpha);
  }
  
  fixedUpdate(dt) {
    // 1. Aplicar fuerzas
    for (const entity of this.entities) {
      if (entity.useGravity) {
        entity.velocity.y += this.gravity.gravity * (dt / 1000);
      }
      
      if (entity.useSpring) {
        const springPos = this.spring.update(dt);
        entity.position.x = springPos;
      }
    }
    
    // 2. Aplicar fricción
    for (const entity of this.entities) {
      if (entity.useFriction && entity.isGrounded) {
        entity.velocity = this.friction.applyFriction(
          entity.velocity, dt, entity.isGrounded
        );
      }
    }
    
    // 3. Actualizar posiciones
    for (const entity of this.entities) {
      entity.position.x += entity.velocity.x * (dt / 1000);
      entity.position.y += entity.velocity.y * (dt / 1000);
    }
    
    // 4. Detectar y resolver colisiones
    this.resolveCollisions();
    
    // 5. Aplicar restricciones (límites de pantalla, etc.)
    this.applyConstraints();
  }
  
  resolveCollisions() {
    for (let i = 0; i < this.entities.length; i++) {
      for (let j = i + 1; j < this.entities.length; j++) {
        const e1 = this.entities[i];
        const e2 = this.entities[j];
        
        if (this.collision.checkCircleCollision(e1, e2)) {
          const { v1Final, v2Final } = this.collision.elasticCollision(e1, e2);
          e1.velocity = v1Final;
          e2.velocity = v2Final;
        }
      }
      
      // Colisión con suelo
      const entity = this.entities[i];
      if (entity.position.y >= entity.groundLevel) {
        entity.position.y = entity.groundLevel;
        entity.velocity = this.bounce.applyBounce(entity.velocity);
        entity.isGrounded = true;
        
        if (this.bounce.shouldStopBouncing(entity.velocity)) {
          entity.velocity.y = 0;
        }
      } else {
        entity.isGrounded = false;
      }
    }
  }
  
  applyConstraints() {
    for (const entity of this.entities) {
      // Límites horizontales
      if (entity.position.x < entity.minX) {
        entity.position.x = entity.minX;
        entity.velocity.x = -entity.velocity.x * 0.5;
      }
      if (entity.position.x > entity.maxX) {
        entity.position.x = entity.maxX;
        entity.velocity.x = -entity.velocity.x * 0.5;
      }
    }
  }
  
  interpolate(alpha) {
    // Interpolar posiciones para suavidad entre frames
    for (const entity of this.entities) {
      entity.renderPosition = {
        x: entity.previousPosition.x + 
           (entity.position.x - entity.previousPosition.x) * alpha,
        y: entity.previousPosition.y + 
           (entity.position.y - entity.previousPosition.y) * alpha
      };
    }
  }
}
```

### 3.3 Integración con CSS/SVG

**Sincronización JavaScript → CSS:**

```javascript
class CSSPhysicsSync {
  constructor(element, physicsEntity) {
    this.element = element;
    this.entity = physicsEntity;
  }
  
  sync() {
    // Actualizar custom properties
    this.element.style.setProperty('--physics-x', `${this.entity.renderPosition.x}px`);
    this.element.style.setProperty('--physics-y', `${this.entity.renderPosition.y}px`);
    this.element.style.setProperty('--physics-rotation', `${this.entity.rotation}deg`);
    this.element.style.setProperty('--physics-scale', this.entity.scale);
    
    // Aplicar transformación
    this.element.style.transform = `
      translate(var(--physics-x), var(--physics-y))
      rotate(var(--physics-rotation))
      scale(var(--physics-scale))
    `;
  }
}
```

**CSS con Variables de Física:**

```css
.character {
  --physics-x: 0px;
  --physics-y: 0px;
  --physics-rotation: 0deg;
  --physics-scale: 1;
  
  transform: 
    translate(var(--physics-x), var(--physics-y))
    rotate(var(--physics-rotation))
    scale(var(--physics-scale));
  
  /* Optimización GPU */
  will-change: transform;
  transform-style: preserve-3d;
}
```

---

## 4. Conceptos de Personajes

### 4.1 Opción A: Formas Geométricas Abstractas

#### Concepto: "Geo Beats"

**Descripción Visual:**
Personajes compuestos por formas geométricas puras (círculos, triángulos, cuadrados) que se combinan para crear criaturas abstractas con personalidad. Inspirados en diseño Bauhaus y arte geométrico moderno.

**Variantes:**

1. **"Circle" - El Bailarín**
   - Cuerpo: Círculo principal (40px radio)
   - Ojos: Dos círculos pequeños (5px radio)
   - Extremidades: 4 líneas curvas que se animan
   - Color base: Gradiente púrpura-azul (#a78bfa → #60a5fa)
   - Personalidad: Enérgico, rebota constantemente

2. **"Triangle" - El Saltarín**
   - Cuerpo: Triángulo equilátero (60px lado)
   - Ojos: Dos triángulos invertidos
   - Extremidades: Líneas rectas angulares
   - Color base: Gradiente naranja-amarillo (#fb923c → #fbbf24)
   - Personalidad: Impulsivo, saltos altos

3. **"Square" - El Marchador**
   - Cuerpo: Cuadrado redondeado (50x50px, border-radius: 10px)
   - Ojos: Dos cuadrados pequeños
   - Extremidades: Rectángulos que rotan
   - Color base: Gradiente verde-esmeralda (#34d399 → #10b981)
   - Personalidad: Metódico, movimientos precisos

4. **"Poly" - El Transformador**
   - Cuerpo: Polígono que cambia de forma (3-8 lados)
   - Ojos: Puntos que se adaptan a la forma
   - Extremidades: Líneas que emergen de vértices
   - Color base: Gradiente arcoíris dinámico
   - Personalidad: Camaleónico, se adapta al ritmo

**Sistema de Articulación:**

```javascript
const geoBeatsArticulation = {
  body: {
