// ---- Score XML cache helpers ----
// Store original MusicXML per score id so OSMD can re-render faithfully.
// Kept separate from ScoreViewer.tsx so callers can cache XML without
// pulling in the heavy OSMD bundle.

export function cacheScoreXML(scoreId: string, xml: string): void {
  try {
    sessionStorage.setItem(`score-xml-${scoreId}`, xml);
  } catch {
    /* storage full — silently skip */
  }
}

export function getCachedScoreXML(scoreId: string): string | null {
  return sessionStorage.getItem(`score-xml-${scoreId}`);
}
