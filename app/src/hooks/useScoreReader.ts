import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useLocalStorageState } from "../utils/settings";
import { parseMusicXML, analyzeScore } from "../services/scoreService";
import type { AnalysisResult } from "../services/scoreService";
import type { ScoreDocument, ScorePart } from "../types/score";

export interface UseScoreReaderApi {
  scoreDocument: ScoreDocument | null;
  scoreAnalysis: AnalysisResult | null;
  scoreParts: ScorePart[];
  scoreImportLoading: boolean;
  scoreImportError: string | null;
  scoreLastImported: string | null;
  scoreViewMode: "roll" | "sheet";
  setScoreViewMode: (mode: "roll" | "sheet") => void;
  importMusicXML: (
    xmlOrBytes: string | ArrayBuffer | Uint8Array | File,
    filename?: string,
  ) => Promise<void>;
  setScoreParts: Dispatch<SetStateAction<ScorePart[]>>;
  clearScore: () => void;
}

/**
 * Encapsulates MusicXML import lifecycle:
 *  - parsing via `parseMusicXML`
 *  - musical analysis via `analyzeScore`
 *  - loading/error flags
 *  - persisted "last imported" filename and view mode
 *  - mutable copy of `scoreDocument.parts` for the mixer
 */
export function useScoreReader(): UseScoreReaderApi {
  const [scoreDocument, setScoreDocument] = useState<ScoreDocument | null>(
    null,
  );
  const [scoreAnalysis, setScoreAnalysis] = useState<AnalysisResult | null>(
    null,
  );
  const [scoreParts, setScoreParts] = useState<ScorePart[]>([]);
  const [scoreImportLoading, setScoreImportLoading] = useState(false);
  const [scoreImportError, setScoreImportError] = useState<string | null>(null);

  const [scoreLastImported, setScoreLastImported] = useLocalStorageState<
    string | null
  >("piano_score_last_imported", null);
  const [scoreViewMode, setScoreViewMode] = useLocalStorageState<
    "roll" | "sheet"
  >("piano_score_view_mode", "roll");

  // Sync mutable parts copy whenever the underlying score changes.
  useEffect(() => {
    if (scoreDocument) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScoreParts(scoreDocument.parts.map((p) => ({ ...p })));
    } else {
      setScoreParts([]);
    }
  }, [scoreDocument]);

  const importMusicXML = useCallback(
    async (
      input: string | ArrayBuffer | Uint8Array | File,
      filename?: string,
    ) => {
      setScoreImportLoading(true);
      setScoreImportError(null);
      try {
        // `parseMusicXML` expects a `File` (it inspects `file.name` to detect
        // `.mxl` archives). Wrap raw text/bytes into a File so the parser can
        // handle them transparently.
        let file: File;
        if (input instanceof File) {
          file = input;
        } else {
          const effectiveName = filename ?? "score.xml";
          const isMxl = effectiveName.toLowerCase().endsWith(".mxl");
          const mime = isMxl ? "application/vnd.recordare.musicxml" : "application/xml";
          if (typeof input === "string") {
            file = new File([input], effectiveName, { type: mime });
          } else if (input instanceof Uint8Array) {
            // Copy the underlying bytes into a fresh ArrayBuffer to satisfy
            // the BlobPart type (Uint8Array<ArrayBufferLike> is not directly
            // assignable in some TS lib configurations).
            const buf = input.slice().buffer;
            file = new File([buf], effectiveName, { type: mime });
          } else {
            // ArrayBuffer
            file = new File([input], effectiveName, { type: mime });
          }
        }

        const result = await parseMusicXML(file);
        if (!result.success || !result.score) {
          throw new Error(
            result.errors[0] ?? "Unknown MusicXML parse error",
          );
        }
        const score = result.score;
        const analysis = analyzeScore(score);
        setScoreDocument(score);
        setScoreAnalysis(analysis);
        const finalName = filename ?? (input instanceof File ? input.name : null);
        if (finalName) setScoreLastImported(finalName);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Import failed";
        setScoreImportError(msg);
      } finally {
        setScoreImportLoading(false);
      }
    },
    [setScoreLastImported],
  );

  const clearScore = useCallback(() => {
    setScoreDocument(null);
    setScoreAnalysis(null);
    setScoreParts([]);
    setScoreImportError(null);
  }, []);

  return {
    scoreDocument,
    scoreAnalysis,
    scoreParts,
    scoreImportLoading,
    scoreImportError,
    scoreLastImported,
    scoreViewMode,
    setScoreViewMode,
    importMusicXML,
    setScoreParts,
    clearScore,
  };
}
