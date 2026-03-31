// src/utils/alignment.ts
// Needleman-Wunsch Global Sequence Alignment
// Used to map Ensembl protein positions to canonical UniProt positions,
// solving the "isoform trap" when transcript isoforms differ from the
// canonical UniProt entry.

export interface AlignmentResult {
  alignedSeq1: string;       // Ensembl sequence with gaps
  alignedSeq2: string;       // UniProt sequence with gaps
  score: number;             // Alignment score
  identity: number;          // Percent identity (0–100)
  positionMap: Map<number, number>; // ensemblPos (1-based) -> uniprotPos (1-based)
}

// Scoring parameters (BLOSUM62-inspired simple scheme)
const MATCH = 2;
const MISMATCH = -1;
const GAP_OPEN = -4;
const GAP_EXTEND = -1;

type Direction = 'DIAG' | 'UP' | 'LEFT' | 'NONE';

/**
 * Needleman-Wunsch global alignment with affine gap penalties.
 *
 * Space complexity: O(m*n) — acceptable for typical protein lengths (<2000 aa).
 * For very long sequences, a banded or linear-space variant would be preferred;
 * but for a PoC this is correct and readable.
 */
export function needlemanWunsch(seq1: string, seq2: string): AlignmentResult {
  const m = seq1.length;
  const n = seq2.length;

  // DP matrices: M = match/mismatch, X = gap in seq2, Y = gap in seq1
  const M = Array.from({ length: m + 1 }, () => new Float32Array(n + 1).fill(-Infinity));
  const X = Array.from({ length: m + 1 }, () => new Float32Array(n + 1).fill(-Infinity));
  const Y = Array.from({ length: m + 1 }, () => new Float32Array(n + 1).fill(-Infinity));

  // Traceback matrices
  const traceM: Direction[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill('NONE'));
  const traceX: Direction[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill('NONE'));
  const traceY: Direction[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill('NONE'));

  // Initialization
  M[0][0] = 0;
  for (let i = 1; i <= m; i++) {
    X[i][0] = GAP_OPEN + (i - 1) * GAP_EXTEND;
    traceX[i][0] = 'UP';
  }
  for (let j = 1; j <= n; j++) {
    Y[0][j] = GAP_OPEN + (j - 1) * GAP_EXTEND;
    traceY[0][j] = 'LEFT';
  }

  // Fill
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const matchScore = seq1[i - 1] === seq2[j - 1] ? MATCH : MISMATCH;

      // M[i][j]: came from a match/mismatch
      const mFromM = M[i - 1][j - 1] + matchScore;
      const mFromX = X[i - 1][j - 1] + matchScore;
      const mFromY = Y[i - 1][j - 1] + matchScore;
      M[i][j] = Math.max(mFromM, mFromX, mFromY);
      if (M[i][j] === mFromM) traceM[i][j] = 'DIAG';
      else if (M[i][j] === mFromX) traceM[i][j] = 'DIAG';
      else traceM[i][j] = 'DIAG';

      // X[i][j]: gap in seq2 (seq1 advances)
      const xOpen = M[i - 1][j] + GAP_OPEN;
      const xExtend = X[i - 1][j] + GAP_EXTEND;
      X[i][j] = Math.max(xOpen, xExtend);
      traceX[i][j] = X[i][j] === xOpen ? 'DIAG' : 'UP';

      // Y[i][j]: gap in seq1 (seq2 advances)
      const yOpen = M[i][j - 1] + GAP_OPEN;
      const yExtend = Y[i][j - 1] + GAP_EXTEND;
      Y[i][j] = Math.max(yOpen, yExtend);
      traceY[i][j] = Y[i][j] === yOpen ? 'DIAG' : 'LEFT';
    }
  }

  // Find best score at (m, n)
  const finalScore = Math.max(M[m][n], X[m][n], Y[m][n]);

  // Traceback
  let alignedSeq1 = '';
  let alignedSeq2 = '';
  let i = m;
  let j = n;

  // Which matrix are we starting from?
  let currentMatrix: 'M' | 'X' | 'Y' =
    finalScore === M[m][n] ? 'M' : finalScore === X[m][n] ? 'X' : 'Y';

  while (i > 0 || j > 0) {
    if (currentMatrix === 'M') {
      alignedSeq1 = seq1[i - 1] + alignedSeq1;
      alignedSeq2 = seq2[j - 1] + alignedSeq2;
      const dir = traceM[i][j];
      if (dir === 'DIAG') {
        const prev = Math.max(M[i-1][j-1], X[i-1][j-1], Y[i-1][j-1]);
        currentMatrix = prev === M[i-1][j-1] ? 'M' : prev === X[i-1][j-1] ? 'X' : 'Y';
      }
      i--; j--;
    } else if (currentMatrix === 'X') {
      alignedSeq1 = seq1[i - 1] + alignedSeq1;
      alignedSeq2 = '-' + alignedSeq2;
      const dir = traceX[i][j];
      if (dir === 'DIAG') currentMatrix = 'M';
      else currentMatrix = 'X';
      i--;
    } else {
      alignedSeq1 = '-' + alignedSeq1;
      alignedSeq2 = seq2[j - 1] + alignedSeq2;
      const dir = traceY[i][j];
      if (dir === 'DIAG') currentMatrix = 'M';
      else currentMatrix = 'Y';
      j--;
    }
  }

  // Build position map: ensemblPos (1-based) -> uniprotPos (1-based)
  const positionMap = new Map<number, number>();
  let ensemblIdx = 0; // counts non-gap positions in alignedSeq1
  let uniprotIdx = 0; // counts non-gap positions in alignedSeq2

  for (let k = 0; k < alignedSeq1.length; k++) {
    const c1 = alignedSeq1[k];
    const c2 = alignedSeq2[k];

    if (c1 !== '-') ensemblIdx++;
    if (c2 !== '-') uniprotIdx++;

    if (c1 !== '-' && c2 !== '-') {
      // Both residues are aligned; map Ensembl position to UniProt position
      positionMap.set(ensemblIdx, uniprotIdx);
    }
  }

  // Calculate percent identity
  let matches = 0;
  for (let k = 0; k < alignedSeq1.length; k++) {
    if (alignedSeq1[k] !== '-' && alignedSeq2[k] !== '-' && alignedSeq1[k] === alignedSeq2[k]) {
      matches++;
    }
  }
  const alignmentLength = Math.max(m, n);
  const identity = alignmentLength > 0 ? (matches / alignmentLength) * 100 : 0;

  return {
    alignedSeq1,
    alignedSeq2,
    score: finalScore,
    identity,
    positionMap,
  };
}

/**
 * Map a single 1-based Ensembl residue position to the canonical UniProt position.
 * Returns null if the position falls in a gap or is out of range.
 */
export function mapPosition(
  ensemblPos: number,
  seq1: string,
  seq2: string
): { uniprotPos: number | null; identity: number; alignmentDetails: string } {
  const result = needlemanWunsch(seq1, seq2);
  const uniprotPos = result.positionMap.get(ensemblPos) ?? null;

  // Human-readable snippet around the mapped position
  const snippetRadius = 5;
  const start = Math.max(0, ensemblPos - snippetRadius - 1);
  const end = Math.min(seq1.length, ensemblPos + snippetRadius);
  const alignmentDetails =
    `Ensembl [${start + 1}–${end}]: ...${seq1.slice(start, end)}... ` +
    `| Identity: ${result.identity.toFixed(1)}% | Score: ${result.score}`;

  return { uniprotPos, identity: result.identity, alignmentDetails };
}