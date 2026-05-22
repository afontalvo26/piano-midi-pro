/* eslint-disable react-refresh/only-export-components */
// ============================================================
// ScoreViewer - OpenSheetMusicDisplay wrapper
// Renders MusicXML as professional sheet music with live cursor
// ============================================================

import { useEffect, useRef, useState, useCallback } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import type { ScoreDocument } from "../../types/score";

interface ScoreViewerProps {
  score: ScoreDocument | null;
  currentTime: number;
  onMeasureClick?: (measureNumber: number, time: number) => void;
  visiblePartIds?: string[];
}

const CURSOR_COLOR = "#ef4444";
const CURSOR_ALPHA = 0.25;

export function ScoreViewer({
  score,
  currentTime,
  onMeasureClick,
  visiblePartIds,
}: ScoreViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const lastMeasureRef = useRef<number>(-1);
  const xmlCacheRef = useRef<string | null>(null);

  // Build minimal MusicXML from ScoreDocument for OSMD
  // (OSMD requires raw XML string or URL)
  const buildXmlFromScore = useCallback((sc: ScoreDocument): string => {
    // If we have the original XML cached, use it
    // Otherwise reconstruct a minimal version
    if (xmlCacheRef.current) return xmlCacheRef.current;

    // Build simplified MusicXML from flat data
    const partsXml = sc.parts
      .map((part) => {
        const measuresXml = part.measures
          .map((m) => {
            const notesXml = m.notes
              .map((n) => {
                if (n.isRest) {
                  return `<note><rest/><duration>4</duration><type>${n.notatedDuration}</type></note>`;
                }
                const step = n.pitchName?.replace("#", "") ?? "C";
                const alter = n.pitchName?.includes("#")
                  ? "<alter>1</alter>"
                  : "";
                const octave = n.octave ?? 4;
                const dots = n.dots > 0 ? "<dot/>".repeat(n.dots) : "";
                const articXml = n.articulations.includes("staccato")
                  ? "<notations><articulations><staccato/></articulations></notations>"
                  : n.articulations.includes("accent")
                    ? "<notations><articulations><accent/></articulations></notations>"
                    : n.articulations.includes("tenuto")
                      ? "<notations><articulations><tenuto/></articulations></notations>"
                      : "";
                return `<note>
  <pitch><step>${step}</step>${alter}<octave>${octave}</octave></pitch>
  <duration>4</duration>
  <type>${n.notatedDuration}</type>${dots}${articXml}
</note>`;
              })
              .join("\n");

            const timeSig = m.timeSignature
              ? `<time><beats>${m.timeSignature.numerator}</beats><beat-type>${m.timeSignature.denominator}</beat-type></time>`
              : "";
            const keySig = m.keySignature
              ? `<key><fifths>${m.keySignature.fifths}</fifths><mode>${m.keySignature.mode}</mode></key>`
              : "";
            const attribs =
              timeSig || keySig
                ? `<attributes><divisions>1</divisions>${keySig}${timeSig}</attributes>`
                : "";
            const tempo =
              m.tempoChanges.length > 0
                ? `<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(m.tempoChanges[0].bpm)}</per-minute></metronome></direction-type><sound tempo="${Math.round(m.tempoChanges[0].bpm)}"/></direction>`
                : "";

            return `<measure number="${m.number}">${attribs}${tempo}${notesXml}</measure>`;
          })
          .join("\n");

        return `<part id="${part.id}">${measuresXml}</part>`;
      })
      .join("\n");

    const partListXml = sc.parts
      .map(
        (p) =>
          `<score-part id="${p.id}"><part-name>${p.name}</part-name></score-part>`,
      )
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN"
  "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${sc.metadata.title}</work-title></work>
  <part-list>${partListXml}</part-list>
  ${partsXml}
</score-partwise>`;
  }, []);

  // Handle click to seek
  const handleContainerClick = useCallback(
    (e: MouseEvent) => {
      if (!osmdRef.current || !score || !onMeasureClick) return;
      // Find which measure was clicked using OSMD's graphic objects
      try {
        const cursor = osmdRef.current.cursor;
        if (cursor) {
          // Simple approach: find the nearest measure based on x position
          const container = containerRef.current;
          if (!container) return;
          const rect = container.getBoundingClientRect();
          const relX = e.clientX - rect.left;
          void (e.clientY - rect.top); // relY unused but kept for future hit-test

          // Walk through measures to find clicked one
          let closestMeasure = 1;
          let closestDist = Infinity;
          score.parts[0]?.measures.forEach((m) => {
            // This is a heuristic since we can't easily get measure screen positions from OSMD
            // without diving deep into internal API
            const dist = Math.abs(
              relX - (m.number / score.metadata.totalMeasures) * rect.width,
            );
            if (dist < closestDist) {
              closestDist = dist;
              closestMeasure = m.number;
            }
          });

          const measureData = score.parts[0]?.measures.find(
            (m) => m.number === closestMeasure,
          );
          if (measureData) {
            onMeasureClick(closestMeasure, measureData.startTime);
          }
        }
      } catch {
        /* ignore */
      }
    },
    [score, onMeasureClick],
  );

  // Load score into OSMD
  useEffect(() => {
    if (!score || !containerRef.current) return;

    setLoading(true);
    setError(null);
    setLoaded(false);
    lastMeasureRef.current = -1;

    const container = containerRef.current;

    const loadScore = async () => {
      try {
        // Create or reuse OSMD instance
        if (!osmdRef.current) {
          osmdRef.current = new OpenSheetMusicDisplay(container, {
            autoResize: true,
            drawTitle: true,
            drawComposer: true,
            drawCredits: true,
            drawMeasureNumbers: true,
            coloringMode: 0,
            followCursor: true,
            cursorsOptions: [
              {
                type: 0,
                color: CURSOR_COLOR,
                alpha: CURSOR_ALPHA,
                follow: true,
              },
            ],
          });
        } else {
          // Clear previous
          osmdRef.current.clear();
        }

        // Build XML
        const xml = buildXmlFromScore(score);
        await osmdRef.current.load(xml);
        osmdRef.current.render();

        // Initialize cursor
        if (osmdRef.current.cursor) {
          osmdRef.current.cursor.reset();
          osmdRef.current.cursor.show();
        }

        // Click handler to seek to measure
        if (onMeasureClick) {
          container.addEventListener("click", handleContainerClick);
        }

        setLoaded(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Error cargando partitura: ${msg}`);
      } finally {
        setLoading(false);
      }
    };

    loadScore();

    return () => {
      container.removeEventListener("click", handleContainerClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score?.id]);

  // Update cursor position based on currentTime
  useEffect(() => {
    if (!osmdRef.current || !loaded || !score) return;
    const cursor = osmdRef.current.cursor;
    if (!cursor) return;

    try {
      // Find current measure based on currentTime
      let targetMeasure = 1;
      for (const part of score.parts) {
        for (const measure of part.measures) {
          if (
            measure.startTime <= currentTime &&
            measure.startTime + measure.duration > currentTime
          ) {
            targetMeasure = measure.number;
            break;
          }
        }
        break; // Use first part for measure timing
      }

      if (targetMeasure !== lastMeasureRef.current) {
        // Move OSMD cursor to target measure
        cursor.reset();
        for (let i = 1; i < targetMeasure; i++) {
          cursor.next();
          if (cursor.Iterator?.EndReached) break;
        }
        lastMeasureRef.current = targetMeasure;
      }
    } catch {
      /* cursor may not be initialized */
    }
  }, [currentTime, loaded, score]);

  // Re-render when visible parts change
  useEffect(() => {
    if (!osmdRef.current || !loaded) return;
    // OSMD doesn't natively support part visibility toggle at runtime easily,
    // but we flag it via CSS opacity for now
    if (visiblePartIds && containerRef.current) {
      const svgs = containerRef.current.querySelectorAll("g.vf-staff");
      svgs.forEach((svg, idx) => {
        const partId = score?.parts[idx]?.id;
        if (partId && !visiblePartIds.includes(partId)) {
          (svg as HTMLElement).style.opacity = "0.15";
        } else {
          (svg as HTMLElement).style.opacity = "1";
        }
      });
    }
  }, [visiblePartIds, loaded, score]);

  return (
    <div className="score-viewer-wrapper">
      {loading && (
        <div className="score-viewer-loading">
          <div className="spinner" />
          <span>Cargando partitura...</span>
        </div>
      )}
      {error && (
        <div className="score-viewer-error">
          <span>⚠️ {error}</span>
        </div>
      )}
      {!score && !loading && (
        <div className="score-viewer-empty">
          <div className="score-viewer-empty-icon">🎼</div>
          <p>Carga una partitura MusicXML para ver la notación</p>
          <p style={{ fontSize: "0.8rem", opacity: 0.5, marginTop: "8px" }}>
            Formatos soportados: .xml, .mxl (MuseScore, Finale, Sibelius,
            Noteflight)
          </p>
        </div>
      )}
      <div
        ref={containerRef}
        className="score-viewer-osmd"
        style={{ display: score && !loading ? "block" : "none" }}
      />
    </div>
  );
}

// ---- Cache helper: store original XML for faithful rendering ----
export function cacheScoreXML(scoreId: string, xml: string) {
  try {
    sessionStorage.setItem(`score-xml-${scoreId}`, xml);
  } catch {
    /* storage full */
  }
}

export function getCachedScoreXML(scoreId: string): string | null {
  return sessionStorage.getItem(`score-xml-${scoreId}`);
}
