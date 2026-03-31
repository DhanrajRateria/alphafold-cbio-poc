// src/pages/index.tsx
// Main dashboard for the AlphaFold × cBioPortal G2S PoC.

import React, { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import axios from 'axios';
import type { MutationMappingResult, ApiError } from './api/map-mutation';
import { PipelineStep, type StepStatus } from '@/components/PipelineStep';
import { ResultPanel } from '@/components/ResultPanel';

// Dynamically import NGL viewer (browser-only)
const ProteinViewer = dynamic(
  () => import('@/components/ProteinViewer').then((m) => m.ProteinViewer),
  { ssr: false, loading: () => <ViewerSkeleton /> }
);

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const ViewerSkeleton = () => (
  <div className="bio-panel flex items-center justify-center" style={{ minHeight: 480 }}>
    <p className="text-bio-muted font-mono text-sm">Initialising viewer…</p>
  </div>
);

// ─── Example proteins ─────────────────────────────────────────────────────────

const EXAMPLES = [
  {
    label: 'BRCA1 (human)',
    transcriptId: 'ENST00000357654',
    mutationPosition: 185,
    note: 'BRCA1 · Breast cancer susceptibility protein',
  },
  {
    label: 'TP53 (human)',
    transcriptId: 'ENST00000269305',
    mutationPosition: 248,
    note: 'TP53 · Tumour suppressor p53',
  },
  {
    label: 'EGFR (human)',
    transcriptId: 'ENST00000275493',
    mutationPosition: 858,
    note: 'EGFR · Epidermal growth factor receptor',
  },
];

// ─── Pipeline step definitions ────────────────────────────────────────────────

type PipelineKey = 'ensembl' | 'uniprot' | 'alignment' | 'alphafold';

interface PipelineState {
  ensembl: StepStatus;
  uniprot: StepStatus;
  alignment: StepStatus;
  alphafold: StepStatus;
}

const defaultPipeline: PipelineState = {
  ensembl: 'idle',
  uniprot: 'idle',
  alignment: 'idle',
  alphafold: 'idle',
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function Home() {
  const [transcriptId, setTranscriptId] = useState('ENST00000357654');
  const [mutationPosition, setMutationPosition] = useState('185');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<MutationMappingResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<PipelineState>(defaultPipeline);
  const [pipelineDetails, setPipelineDetails] = useState<Record<PipelineKey, string>>({
    ensembl: '',
    uniprot: '',
    alignment: '',
    alphafold: '',
  });

  const setStep = useCallback(
    (key: PipelineKey, status: StepStatus, detail = '') => {
      setPipeline((p) => ({ ...p, [key]: status }));
      if (detail) {
        setPipelineDetails((d) => ({ ...d, [key]: detail }));
      }
    },
    []
  );

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const trimmedId = transcriptId.trim().toUpperCase();
    const pos = parseInt(mutationPosition, 10);

    if (!trimmedId) {
      setApiError('Please enter an Ensembl Transcript ID.');
      return;
    }
    if (!Number.isFinite(pos) || pos < 1) {
      setApiError('Please enter a valid mutation position (positive integer).');
      return;
    }

    setIsLoading(true);
    setResult(null);
    setApiError(null);
    setPipeline(defaultPipeline);
    setPipelineDetails({ ensembl: '', uniprot: '', alignment: '', alphafold: '' });

    // Simulate progressive pipeline feedback while the single API call runs
    // (The actual work is all server-side; we animate the steps on a timer)
    const stepTimeline: Array<[number, PipelineKey, StepStatus, string]> = [
      [200,  'ensembl',   'loading', ''],
      [1200, 'ensembl',   'success', `Fetching sequence for ${trimmedId}`],
      [1300, 'uniprot',   'loading', ''],
      [2500, 'uniprot',   'success', 'Resolving canonical UniProt entry'],
      [2600, 'alignment', 'loading', ''],
      [3400, 'alignment', 'success', 'Running Needleman-Wunsch alignment'],
      [3500, 'alphafold', 'loading', ''],
    ];

    const timers: ReturnType<typeof setTimeout>[] = [];
    stepTimeline.forEach(([delay, key, status, detail]) => {
      timers.push(setTimeout(() => setStep(key, status, detail), delay));
    });

    try {
      const resp = await axios.post<MutationMappingResult>('/api/map-mutation', {
        transcriptId: trimmedId,
        mutationPosition: pos,
      });

      // Clear pending timers and set all steps to success
      timers.forEach(clearTimeout);

      setStep('ensembl',   'success', `${resp.data.ensemblProteinLength} aa`);
      setStep('uniprot',   'success', resp.data.uniprotAccession);
      setStep('alignment', 'success', `${resp.data.alignmentIdentity.toFixed(1)}% identity`);
      setStep('alphafold', 'success', resp.data.alphaFoldPdbUrl.split('/').pop() ?? '');

      setResult(resp.data);
    } catch (err) {
      timers.forEach(clearTimeout);

      if (axios.isAxiosError(err)) {
        const errData = err.response?.data as ApiError | undefined;
        const stage = (errData?.stage ?? 'unknown') as PipelineKey;

        // Mark failed step
        (['ensembl', 'uniprot', 'alignment', 'alphafold'] as PipelineKey[]).forEach((key) => {
          if (pipeline[key] === 'loading' || key === stage) {
            setStep(key, 'error', errData?.details ?? '');
          }
        });

        setApiError(
          errData?.error ??
          `HTTP ${err.response?.status}: ${err.message}`
        );
      } else {
        setApiError(String(err));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadExample = (ex: (typeof EXAMPLES)[0]) => {
    setTranscriptId(ex.transcriptId);
    setMutationPosition(String(ex.mutationPosition));
    setResult(null);
    setApiError(null);
    setPipeline(defaultPipeline);
  };

  return (
    <>
      <Head>
        <title>AlphaFold × cBioPortal — G2S PoC</title>
        <meta name="description" content="AlphaFold 3D protein structure mutation mapper" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen grid-bg">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="border-b border-bio-border bg-bio-panel/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bio-accent/10 border border-bio-accent/30 flex items-center justify-center">
                <svg className="w-4 h-4 text-bio-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                </svg>
              </div>
              <div>
                <h1 className="text-slate-100 font-mono text-sm font-medium">
                  AlphaFold · G2S Mutation Mapper
                </h1>
                <p className="text-bio-muted font-mono text-xs">cBioPortal integration PoC</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge badge-info">Ensembl</span>
              <span className="badge badge-info">UniProt</span>
              <span className="badge badge-info">AlphaFold EBI</span>
            </div>
          </div>
        </header>

        <main className="max-w-screen-xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">

            {/* ── Left panel: inputs + pipeline ──────────────────────────── */}
            <div className="flex flex-col gap-4">

              {/* Input card */}
              <div className="bio-panel p-5">
                <h2 className="text-bio-accent font-mono text-xs uppercase tracking-widest mb-4">
                  Input Parameters
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-slate-400 font-mono text-xs mb-1.5">
                      Ensembl Transcript ID
                    </label>
                    <input
                      type="text"
                      value={transcriptId}
                      onChange={(e) => setTranscriptId(e.target.value)}
                      placeholder="e.g. ENST00000357654"
                      className="
                        w-full bg-bio-dark border border-bio-border rounded-md
                        px-3 py-2 font-mono text-sm text-slate-100
                        placeholder-bio-muted/50
                        transition-all duration-200
                      "
                      disabled={isLoading}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-mono text-xs mb-1.5">
                      Mutation Position <span className="text-bio-muted">(1-based)</span>
                    </label>
                    <input
                      type="number"
                      value={mutationPosition}
                      onChange={(e) => setMutationPosition(e.target.value)}
                      placeholder="e.g. 185"
                      min={1}
                      className="
                        w-full bg-bio-dark border border-bio-border rounded-md
                        px-3 py-2 font-mono text-sm text-slate-100
                        placeholder-bio-muted/50
                        transition-all duration-200
                      "
                      disabled={isLoading}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="
                      w-full py-2.5 px-4 rounded-md font-mono text-sm font-medium
                      transition-all duration-200
                      disabled:opacity-50 disabled:cursor-not-allowed
                      flex items-center justify-center gap-2
                    "
                    style={{
                      background: isLoading
                        ? 'rgba(0,212,255,0.1)'
                        : 'linear-gradient(135deg, #00d4ff20, #00d4ff10)',
                      border: '1px solid rgba(0,212,255,0.4)',
                      color: '#00d4ff',
                      boxShadow: isLoading ? 'none' : '0 0 20px rgba(0,212,255,0.1)',
                    }}
                  >
                    {isLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-transparent border-t-bio-accent spinner"></div>
                        Running pipeline…
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Visualise Mutation
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Example proteins */}
              <div className="bio-panel p-4">
                <p className="text-bio-muted font-mono text-xs uppercase tracking-wider mb-3">
                  Quick Examples
                </p>
                <div className="space-y-2">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex.transcriptId}
                      onClick={() => loadExample(ex)}
                      disabled={isLoading}
                      className="
                        w-full text-left px-3 py-2 rounded-md border border-bio-border
                        hover:border-bio-accent/40 hover:bg-bio-accent/5
                        transition-all duration-150 disabled:opacity-40
                      "
                    >
                      <p className="text-slate-300 font-mono text-xs font-medium">{ex.label}</p>
                      <p className="text-bio-muted text-xs mt-0.5">{ex.note}</p>
                      <p className="text-bio-muted/60 font-mono text-xs mt-0.5">
                        {ex.transcriptId} · pos {ex.mutationPosition}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Pipeline status */}
              <div className="bio-panel p-4">
                <p className="text-bio-muted font-mono text-xs uppercase tracking-wider mb-4">
                  Data Pipeline
                </p>
                <PipelineStep
                  step={1}
                  title="Ensembl REST API"
                  subtitle="Fetch protein sequence & UniProt xref"
                  status={pipeline.ensembl}
                  detail={pipelineDetails.ensembl}
                />
                <PipelineStep
                  step={2}
                  title="UniProt REST API"
                  subtitle="Resolve canonical entry & sequence"
                  status={pipeline.uniprot}
                  detail={pipelineDetails.uniprot}
                />
                <PipelineStep
                  step={3}
                  title="Needleman-Wunsch"
                  subtitle="Global alignment · isoform mapping"
                  status={pipeline.alignment}
                  detail={pipelineDetails.alignment}
                />
                <PipelineStep
                  step={4}
                  title="AlphaFold EBI API"
                  subtitle="Fetch predicted structure & pLDDT"
                  status={pipeline.alphafold}
                  detail={pipelineDetails.alphafold}
                  isLast
                />
              </div>

              {/* Error box */}
              {apiError && (
                <div className="bio-panel p-4 border-l-2 border-bio-red animate-slide-up">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-bio-red flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-bio-red font-mono text-xs font-medium mb-1">Pipeline Error</p>
                      <p className="text-slate-400 text-xs leading-relaxed">{apiError}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Right panel: viewer + results ──────────────────────────── */}
            <div className="flex flex-col gap-6">

              {/* 3D Viewer */}
              {result ? (
                <div className="flex flex-col gap-0">
                  <ProteinViewer
                    pdbUrl={result.alphaFoldPdbUrl}
                    mappedUniprotPosition={result.mappedUniprotPosition}
                    uniprotAccession={result.uniprotAccession}
                  />
                </div>
              ) : (
                /* Empty state */
                <div
                  className="bio-panel flex flex-col items-center justify-center text-center p-12 animate-pulse-slow"
                  style={{ minHeight: 520 }}
                >
                  <div className="w-20 h-20 rounded-2xl bg-bio-accent/5 border border-bio-border flex items-center justify-center mb-6">
                    <svg className="w-10 h-10 text-bio-border" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                        d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                  </div>
                  <h3 className="text-slate-400 font-mono text-sm mb-2">No structure loaded</h3>
                  <p className="text-bio-muted text-xs max-w-sm leading-relaxed">
                    Enter an Ensembl Transcript ID and mutation position, then click
                    <span className="text-bio-accent"> Visualise Mutation</span> to run the pipeline
                    and render the AlphaFold structure.
                  </p>
                  <div className="mt-6 grid grid-cols-3 gap-3 w-full max-w-sm">
                    {['Ensembl', 'UniProt', 'AlphaFold'].map((label) => (
                      <div key={label} className="bio-panel p-2 text-center">
                        <div className="w-2 h-2 rounded-full bg-bio-border mx-auto mb-1"></div>
                        <p className="text-bio-muted font-mono text-xs">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Structured results */}
              {result && <ResultPanel result={result} />}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-bio-border mt-12 py-6 px-6 text-center">
          <p className="text-bio-muted font-mono text-xs">
            AlphaFold × cBioPortal G2S Pipeline PoC ·{' '}
            <span className="text-bio-accent">Ensembl</span> ·{' '}
            <span className="text-bio-accent">UniProt</span> ·{' '}
            <span className="text-bio-accent">AlphaFold EBI</span>
          </p>
          <p className="text-bio-muted/50 font-mono text-xs mt-1">
            No mocks — all data from live public APIs
          </p>
        </footer>
      </div>
    </>
  );
}