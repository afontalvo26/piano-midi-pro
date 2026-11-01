import "./ProjectSoundLibrariesPanel.css";

const libraries = [
  {
    name: "Salamander Grand Piano",
    creator: "Piano grabado por Alexander Holm",
    role: "Piano de Studio y proyectos · 7 grabaciones locales OGG con AAC de respaldo",
    license: "CC BY 3.0 · crédito obligatorio",
    source: "https://github.com/sfzinstruments/SalamanderGrandPiano",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
  },
  {
    name: "Virtuosity Drums",
    creator: "Versilian Studios y Karoryfer Samples · interpretación de Austin McMahon",
    role: "Kit acústico · 38 grabaciones locales OGG con AAC de respaldo",
    license: "CC0 1.0",
    source: "https://github.com/sfzinstruments/virtuosity_drums",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  {
    name: "FreePats Hand Clap",
    creator: "Grabación de Roberto para FreePats World Percussion",
    role: "Clap del rack · 9 variaciones locales OGG con AAC de respaldo",
    license: "CC0 1.0",
    source: "https://github.com/freepats/world-percussion",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
] as const;

export function ProjectSoundLibrariesPanel() {
  return <section className="sound-libraries piano-app__card" aria-label="Bibliotecas de sonido y licencias">
    <h2>Bibliotecas de sonido y licencias</h2>
    <p>Los instrumentos incluidos reproducen grabaciones de sus fuentes indicadas. Conserva estos créditos al compartir un proyecto o un paquete de muestras.</p>
    <ul>{libraries.map((library) => <li key={library.name}>
      <strong>{library.name}</strong><span>{library.creator}</span><span>{library.role}</span>
      <span>{library.license}</span>
      <div><a href={library.source} target="_blank" rel="noopener noreferrer">Fuente</a>
        <a href={library.licenseUrl} target="_blank" rel="noopener noreferrer">Licencia</a></div>
    </li>)}</ul>
    <p>Los archivos AAC son conversiones de estas mismas grabaciones, se cargan sólo si falla la decodificación OGG y conservan origen y hash verificables. La salida en Safari físico todavía requiere prueba auditiva.</p>
    <p>Los instrumentos FluidR3 se cargan desde la red bajo su <a
      href="https://github.com/musescore/MuseScore/blob/main/share/sound/FluidR3Mono_License.md"
      target="_blank" rel="noopener noreferrer">licencia distribuida por MuseScore</a>; son una opción adicional y no forman parte del núcleo local.</p>
    <p>Las muestras que importas permanecen en este navegador. Necesitas autorización propia para distribuir sus bytes. El kit 808 grabado aún no está incluido.</p>
  </section>;
}
