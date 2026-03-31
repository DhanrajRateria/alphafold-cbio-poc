// src/components/ResultPanel.tsx
// Displays the structured mutation mapping results from the API.

import React from 'react';
import type { MutationMappingResult } from '@/pages/api/map-mutation';

interface ResultPanelProps {
  result: MutationMappingResult;
}

const StatCard: React.FC<{ label: string; value: string | number; accent?: boolean; mono?: boolean }> = ({
  label,
  value,
  accent,
  mono,
}) => (
  <div className="bio-panel p-3">
    <p className="text-bio-muted text-xs uppercase tracking-wider font-mono mb-1">{label}</p>
    <p
      className={`text-sm font-medium ${mono ? 'font-mono' : ''} ${
        accent ? 'text-bio-accent' : 'text-slate-100'
      }`}
    >
      {value}
    </p>
  </div>
);

const ConfidenceBadge: React.FC<{ score: number }> = ({ score }) => {
  const { label, color } =
    score > 90 ? { label: 'Very High', color: '#0053d6' } :
    score > 70 ? { label: 'Confident', color: '#65cbf3' } :
    score > 50 ? { label: 'Low', color: '#f6d001' } :
                 { label: 'Very Low', color: '#ff7d45' };

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono"
      style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }}></span>
      {label} ({score.toFixed(1)})
    </span>
  );
};

function renderSequenceSnippet(
  sequence: string,
  highlightPos: number, // 1-based
  radius = 20
): React.ReactNode {
  const start = Math.max(0, highlightPos - radius - 1);
  const end = Math.min(sequence.length, highlightPos + radius);
  const before = sequence.slice(start, highlightPos - 1);
  const residue = sequence[highlightPos - 1] ?? '';
  const after = sequence.slice(highlightPos, end);

  return (
    <span className="sequence-display">
      {start > 0 && <span className="text-bio-muted">…</span>}
      {before}
      <span className="highlight">{residue}</span>
      {after}
      {end < sequence.length && <span className="text-bio-muted">…</span>}
    </span>
  );
}

export const ResultPanel: React.FC<ResultPanelProps> = ({ result }) => {
  const identityPct = result.alignmentIdentity.toFixed(1);
  const identityColor =
    result.alignmentIdentity > 95 ? 'text-bio-green' :
    result.alignmentIdentity > 80 ? 'text-bio-accent' :
    'text-bio-yellow';

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-bio-accent font-mono text-sm uppercase tracking-widest">
          Mapping Results
        </h3>
        <span className="badge badge-success">
          <span className="w-1.5 h-1.5 rounded-full bg-bio-green animate-pulse"></span>
          Complete
        </span>
      </div>

      {/* Position mapping */}
      <div className="bio-panel p-4 border-l-2 border-bio-accent">
        <p className="text-bio-muted font-mono text-xs uppercase tracking-wider mb-3">Position Mapping</p>
        <div className="flex items-center gap-3 font-mono">
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-100">{result.mutationPosition}</p>
            <p className="text-xs text-bio-muted mt-0.5">Ensembl pos.</p>
          </div>
          <div className="flex-1 flex flex-col items-center">
            <div className="flex items-center gap-1 w-full">
              <div className="flex-1 h-px bg-bio-border"></div>
              <svg className="w-4 h-4 text-bio-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <div className="flex-1 h-px bg-bio-border"></div>
            </div>
            <p className="text-xs text-bio-muted mt-1">NW alignment</p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-bold ${result.mappedUniprotPosition !== null ? 'text-bio-accent' : 'text-bio-red'}`}>
              {result.mappedUniprotPosition ?? 'GAP'}
            </p>
            <p className="text-xs text-bio-muted mt-0.5">UniProt pos.</p>
          </div>
        </div>
        <div className={`mt-2 text-xs font-mono ${identityColor}`}>
          Alignment identity: {identityPct}%
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Transcript" value={result.transcriptId} mono />
        <StatCard label="UniProt ID" value={result.uniprotAccession} accent mono />
        <StatCard label="Ensembl length" value={`${result.ensemblProteinLength} aa`} mono />
        <StatCard label="UniProt length" value={`${result.uniprotSequenceLength} aa`} mono />
      </div>

      {/* AlphaFold confidence */}
      <div className="bio-panel p-3">
        <p className="text-bio-muted font-mono text-xs uppercase tracking-wider mb-2">AlphaFold Model Confidence</p>
        <div className="flex items-center justify-between">
          <ConfidenceBadge score={result.alphaFoldModelConfidence} />
          <span className="text-bio-muted font-mono text-xs">
            v{result.alphaFoldVersion}
          </span>
        </div>
        {/* Confidence bar */}
        <div className="mt-3 h-2 rounded-full overflow-hidden bg-bio-border">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${result.alphaFoldModelConfidence}%`,
              background:
                result.alphaFoldModelConfidence > 90 ? '#0053d6' :
                result.alphaFoldModelConfidence > 70 ? '#65cbf3' :
                result.alphaFoldModelConfidence > 50 ? '#f6d001' :
                '#ff7d45',
            }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-bio-muted font-mono text-xs">0</span>
          <span className="text-bio-muted font-mono text-xs">Mean pLDDT · 100</span>
        </div>
      </div>

      {/* Sequence context - Ensembl */}
      <div className="bio-panel p-3">
        <p className="text-bio-muted font-mono text-xs uppercase tracking-wider mb-2">
          Ensembl Sequence Context (pos. {result.mutationPosition})
        </p>
        <div className="bg-bio-dark rounded p-2 text-xs overflow-x-auto">
          {renderSequenceSnippet(result.ensemblProteinSequence, result.mutationPosition)}
        </div>
      </div>

      {/* Sequence context - UniProt mapped */}
      {result.mappedUniprotPosition !== null && (
        <div className="bio-panel p-3">
          <p className="text-bio-muted font-mono text-xs uppercase tracking-wider mb-2">
            UniProt Sequence Context (pos. {result.mappedUniprotPosition})
          </p>
          <div className="bg-bio-dark rounded p-2 text-xs overflow-x-auto">
            {renderSequenceSnippet(result.uniprotSequence, result.mappedUniprotPosition)}
          </div>
        </div>
      )}

      {/* Alignment detail */}
      <div className="bio-panel p-3">
        <p className="text-bio-muted font-mono text-xs uppercase tracking-wider mb-2">Alignment Detail</p>
        <p className="text-slate-400 font-mono text-xs leading-relaxed break-words">
          {result.alignmentDetails}
        </p>
      </div>

      {/* PDB link */}
      <div className="bio-panel p-3">
        <p className="text-bio-muted font-mono text-xs uppercase tracking-wider mb-2">Structure Files</p>
        <div className="flex flex-col gap-1">
          <a
            href={result.alphaFoldPdbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-bio-accent font-mono text-xs hover:underline flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download PDB
          </a>
          <a
            href={result.alphaFoldCifUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-bio-accent font-mono text-xs hover:underline flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download mmCIF
          </a>
        </div>
      </div>
    </div>
  );
};

export default ResultPanel;