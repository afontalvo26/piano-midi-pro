// ============================================================
// ImportPanel - Drag & drop file importer
// Supports: .xml, .mxl (MusicXML), .mid, .midi
// ============================================================

import { useRef, useState, useCallback } from 'react';

interface ImportPanelProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  error?: string | null;
  lastImported?: string | null;
}

const ACCEPTED_FORMATS = [
  { ext: '.xml', label: 'MusicXML', desc: 'MuseScore, Finale, Sibelius, Noteflight' },
  { ext: '.mxl', label: 'Compressed MusicXML', desc: 'Formato comprimido estándar' },
  { ext: '.mid', label: 'MIDI', desc: 'Standard MIDI File' },
  { ext: '.midi', label: 'MIDI', desc: 'Standard MIDI File' },
];

export function ImportPanel({ onFileSelect, isLoading, error, lastImported }: ImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  }, [onFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
    e.target.value = '';
  }, [onFileSelect]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="import-panel">
      {/* Drop zone */}
      <div
        className={`import-dropzone ${isDragOver ? 'import-dropzone--active' : ''} ${isLoading ? 'import-dropzone--loading' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && handleClick()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.mxl,.mid,.midi"
          aria-label="Importar partitura MusicXML, MXL, MIDI o XML"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {isLoading ? (
          <>
            <div className="spinner" style={{ width: 32, height: 32 }} />
            <p className="import-dropzone-text">Analizando partitura...</p>
          </>
        ) : (
          <>
            <div className="import-dropzone-icon">🎼</div>
            <p className="import-dropzone-text">
              Arrastra tu partitura aquí
            </p>
            <p className="import-dropzone-sub">
              o haz clic para explorar archivos
            </p>
            <button className="btn primary import-dropzone-btn" onClick={e => { e.stopPropagation(); handleClick(); }}>
              Seleccionar archivo
            </button>
          </>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="import-error">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Success */}
      {lastImported && !error && (
        <div className="import-success">
          <span>✅</span>
          <span>Cargado: <strong>{lastImported}</strong></span>
        </div>
      )}

      {/* Format info */}
      <div className="import-formats">
        <p className="import-formats-title">Formatos soportados</p>
        <div className="import-formats-list">
          {ACCEPTED_FORMATS.map(f => (
            <div key={f.ext} className="import-format-item">
              <span className="import-format-ext">{f.ext}</span>
              <div>
                <span className="import-format-label">{f.label}</span>
                <span className="import-format-desc">{f.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tips */}
      <div className="import-tips">
        <p className="import-tips-title">💡 Consejos</p>
        <ul>
          <li>Exporta desde <strong>MuseScore</strong>: Archivo → Exportar → MusicXML</li>
          <li>Exporta desde <strong>Finale</strong>: File → Export → MusicXML</li>
          <li>Exporta desde <strong>Sibelius</strong>: File → Export → MusicXML</li>
          <li>Descarga partituras gratis en <strong>MuseScore.com</strong> (formato .mxl)</li>
        </ul>
      </div>
    </div>
  );
}
