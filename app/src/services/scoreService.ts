// Re-exports of the MusicXML parsing and music analysis layer.
export { parseMusicXML, scoreToParts } from "../parsers/MusicXMLParser";
export { analyzeScore } from "../analysis/MusicAnalyzer";
export type { AnalysisResult } from "../analysis/MusicAnalyzer";
