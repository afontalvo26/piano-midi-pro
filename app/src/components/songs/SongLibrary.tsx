// ============================================================
// SongLibrary - top-level browser for the demo + imported songs.
// Owns layout state (grid/list, active genre, import panel toggle)
// and derives memoized filtered + grouped views from props. Keeps
// search state lifted (controlled) so App.tsx can persist it across
// navigation tabs.
// ============================================================

import { useCallback, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { Genre, SongData } from "../../types/song";
import { GENRE_META, GENRE_ORDER } from "../../types/song";
import { ImportPanel } from "../score/ImportPanel";
import { GenreNav } from "./GenreNav";
import { SongCard } from "./SongCard";
import "./SongLibrary.css";

export interface SongLibraryProps {
  songs: SongData[];
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  onSelectSong: (song: SongData) => void;
  onImportFile: (file: File) => void;
  importLoading?: boolean;
  importError?: string | null;
  importLastFile?: string | null;
}

type GenreKey = Genre | "uncategorized";
type ActiveFilter = Genre | "all";
type LayoutMode = "grid" | "list";

const UNCATEGORIZED: GenreKey = "uncategorized";

const SearchIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const ClearIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M6 6 18 18M18 6 6 18" />
  </svg>
);

const GridIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const ListIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export function SongLibrary({
  songs,
  searchQuery,
  onSearchQueryChange,
  onSelectSong,
  onImportFile,
  importLoading = false,
  importError = null,
  importLastFile = null,
}: SongLibraryProps) {
  const [active, setActive] = useState<ActiveFilter>("all");
  const [layout, setLayout] = useState<LayoutMode>("grid");
  const [importOpen, setImportOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 769px)").matches;
  });

  // Apply search filter once. Empty query keeps the original list intact.
  const filteredSongs = useMemo<SongData[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter((s) => {
      if (s.title.toLowerCase().includes(q)) return true;
      if (s.artist && s.artist.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [songs, searchQuery]);

  // Group filtered songs by genre (uploads without genre go under
  // UNCATEGORIZED). We compute counts off `songs` (not filtered) so the
  // genre pills don't flicker as the user types.
  const countsByGenre = useMemo(() => {
    const out = new Map<GenreKey, number>();
    for (const s of songs) {
      const k: GenreKey = s.genre ?? UNCATEGORIZED;
      out.set(k, (out.get(k) ?? 0) + 1);
    }
    return out;
  }, [songs]);

  const groupedFiltered = useMemo(() => {
    const out = new Map<GenreKey, SongData[]>();
    for (const s of filteredSongs) {
      const k: GenreKey = s.genre ?? UNCATEGORIZED;
      const arr = out.get(k);
      if (arr) arr.push(s);
      else out.set(k, [s]);
    }
    return out;
  }, [filteredSongs]);

  // Genres that actually have at least one song available (built from
  // unfiltered counts so chips are stable across searches).
  const visibleGenres = useMemo(
    () =>
      GENRE_ORDER.filter((g) => (countsByGenre.get(g) ?? 0) > 0).map((g) => {
        const meta = GENRE_META[g];
        return {
          id: meta.id,
          label: meta.label,
          emoji: meta.emoji,
          color: meta.color,
          colorAlt: meta.colorAlt,
          count: countsByGenre.get(g) ?? 0,
        };
      }),
    [countsByGenre],
  );

  const totalCount = songs.length;
  const filteredCount = filteredSongs.length;

  const handleClearSearch = useCallback(() => {
    onSearchQueryChange("");
  }, [onSearchQueryChange]);

  const handleClearFilters = useCallback(() => {
    onSearchQueryChange("");
    setActive("all");
  }, [onSearchQueryChange]);

  // Build the list of (group key, songs) tuples to render, in the
  // order the user expects: uploads first (so freshly imported files
  // are visible), then GENRE_ORDER.
  const groupsToRender = useMemo<
    { key: GenreKey; label: string; emoji: string; songs: SongData[] }[]
  >(() => {
    if (active !== "all") {
      const songsForGenre = groupedFiltered.get(active) ?? [];
      const meta = GENRE_META[active];
      return songsForGenre.length
        ? [
            {
              key: active,
              label: meta.label,
              emoji: meta.emoji,
              songs: songsForGenre,
            },
          ]
        : [];
    }

    const result: {
      key: GenreKey;
      label: string;
      emoji: string;
      songs: SongData[];
    }[] = [];

    const uploads = groupedFiltered.get(UNCATEGORIZED);
    if (uploads && uploads.length) {
      result.push({
        key: UNCATEGORIZED,
        label: "Mis importaciones",
        emoji: "📥",
        songs: uploads,
      });
    }

    for (const g of GENRE_ORDER) {
      const arr = groupedFiltered.get(g);
      if (!arr || arr.length === 0) continue;
      const meta = GENRE_META[g];
      result.push({
        key: g,
        label: meta.label,
        emoji: meta.emoji,
        songs: arr,
      });
    }
    return result;
  }, [groupedFiltered, active]);

  const isEmpty = filteredCount === 0;
  const showGroupHeaders = active === "all";

  return (
    <div className="lib-root" data-layout={layout}>
      {/* ── Hero header ─────────────────────────────────── */}
      <header className="lib-hero">
        <div className="lib-hero__bg" aria-hidden="true" />
        <div className="lib-hero__content">
          <span className="lib-hero__eyebrow">Biblioteca</span>
          <h1 className="lib-hero__title">Biblioteca de Canciones</h1>
          <p className="lib-hero__subtitle">
            <span className="lib-hero__count">{totalCount}</span>{" "}
            {totalCount === 1 ? "pieza lista" : "piezas listas"} para tocar
          </p>
        </div>
      </header>

      {/* ── Control bar ─────────────────────────────────── */}
      <div className="lib-controls">
        <label className="lib-search">
          <span className="lib-search__icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            type="search"
            className="lib-search__input"
            placeholder="Buscar por título o artista…"
            aria-label="Buscar canciones por título o artista"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              className="lib-search__clear"
              aria-label="Limpiar búsqueda"
              onClick={handleClearSearch}
            >
              <ClearIcon />
            </button>
          )}
        </label>

        <div
          className="lib-layout-toggle"
          role="group"
          aria-label="Cambiar disposición"
        >
          <button
            type="button"
            className={`lib-layout-btn ${layout === "grid" ? "is-active" : ""}`}
            aria-pressed={layout === "grid"}
            aria-label="Vista cuadrícula"
            onClick={() => setLayout("grid")}
          >
            <GridIcon />
          </button>
          <button
            type="button"
            className={`lib-layout-btn ${layout === "list" ? "is-active" : ""}`}
            aria-pressed={layout === "list"}
            aria-label="Vista lista"
            onClick={() => setLayout("list")}
          >
            <ListIcon />
          </button>
        </div>
      </div>

      {/* ── Genre nav ───────────────────────────────────── */}
      <div className="lib-genre-nav-wrap">
        <GenreNav
          genres={visibleGenres}
          active={active}
          totalCount={totalCount}
          onChange={setActive}
        />
      </div>

      {/* ── Import section (collapsible) ────────────────── */}
      <section className="lib-import" aria-label="Subir tu propio MIDI">
        <button
          type="button"
          className="lib-import__toggle"
          aria-expanded={importOpen}
          aria-controls="lib-import-panel"
          onClick={() => setImportOpen((v) => !v)}
        >
          <span className="lib-import__toggle-icon" aria-hidden="true">
            🎼
          </span>
          <span className="lib-import__toggle-text">
            Subir tu propio MIDI o partitura
          </span>
          <span
            className={`lib-import__chevron ${importOpen ? "is-open" : ""}`}
            aria-hidden="true"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>
        {importOpen && (
          <div id="lib-import-panel" className="lib-import__body">
            <ImportPanel
              onFileSelect={onImportFile}
              isLoading={importLoading}
              error={importError}
              lastImported={importLastFile}
            />
          </div>
        )}
      </section>

      {/* ── Songs ───────────────────────────────────────── */}
      {isEmpty ? (
        <div className="lib-empty" role="status">
          <div className="lib-empty__icon" aria-hidden="true">
            🔍
          </div>
          <p className="lib-empty__title">No encontramos coincidencias</p>
          <p className="lib-empty__sub">
            Probá con otra palabra o limpiá los filtros para ver toda la
            biblioteca.
          </p>
          <button
            type="button"
            className="lib-empty__btn"
            onClick={handleClearFilters}
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="lib-results">
          {groupsToRender.map((group) => {
            const isUncategorized = group.key === UNCATEGORIZED;
            const meta = isUncategorized
              ? null
              : GENRE_META[group.key as Genre];
            const headerStyle: CSSProperties & {
              "--genre-c"?: string;
              "--genre-c-alt"?: string;
            } = meta
              ? { "--genre-c": meta.color, "--genre-c-alt": meta.colorAlt }
              : {
                  "--genre-c": "var(--accent-primary)",
                  "--genre-c-alt": "var(--accent-secondary)",
                };
            return (
              <section
                key={group.key}
                className="lib-group"
                style={headerStyle}
              >
                {showGroupHeaders && (
                  <header className="lib-group__head">
                    <span
                      className="lib-group__emoji"
                      aria-hidden="true"
                    >
                      {group.emoji}
                    </span>
                    <h2 className="lib-group__label">{group.label}</h2>
                    <span className="lib-group__count">
                      {group.songs.length}
                    </span>
                  </header>
                )}
                <div className={`lib-grid lib-grid--${layout}`}>
                  {group.songs.map((song) => (
                    <SongCard
                      key={`${group.key}-${song.source}-${song.title}`}
                      song={song}
                      onSelect={onSelectSong}
                      layout={layout}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
