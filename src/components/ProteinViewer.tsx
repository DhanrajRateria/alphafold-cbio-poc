// src/components/ProteinViewer.tsx
// Renders the AlphaFold PDB structure using the NGL Viewer library.
// Colors the backbone by pLDDT confidence score (stored in B-factor column)
// and highlights the mutated residue in bright red spacefill.

import React, { useEffect, useRef, useState } from 'react';

interface ProteinViewerProps {
  pdbUrl: string;
  mappedUniprotPosition: number | null;
  uniprotAccession: string;
}

// pLDDT colour scheme (matches DeepMind/EBI convention)
const PLDDT_SCHEME = [
  { min: 90, max: 100, color: '#0053d6', label: 'Very High (>90)', hex: 0x0053d6 },
  { min: 70, max: 90,  color: '#65cbf3', label: 'Confident (70–90)', hex: 0x65cbf3 },
  { min: 50, max: 70,  color: '#f6d001', label: 'Low (50–70)', hex: 0xf6d001 },
  { min: 0,  max: 50,  color: '#ff7d45', label: 'Very Low (<50)', hex: 0xff7d45 },
];

export const ProteinViewer: React.FC<ProteinViewerProps> = ({
  pdbUrl,
  mappedUniprotPosition,
  uniprotAccession,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<unknown>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    if (!viewportRef.current || !pdbUrl) return;

    let stage: {
      removeAllComponents: () => void;
      dispose: () => void;
      loadFile: (
        url: string,
        opts: { ext: string }
      ) => Promise<{
        addRepresentation: (
          type: string,
          opts: Record<string, unknown>
        ) => void;
        autoView: () => void;
      }>;
      handleResize: () => void;
    } | null = null;

    const init = async () => {
      try {
        setIsLoading(true);
        setError(null);
        setLoadProgress(10);

        // Dynamically import NGL (browser-only)
        const NGL = await import('ngl');
        setLoadProgress(30);

        // Create stage
        stage = new NGL.Stage(viewportRef.current as HTMLElement, {
          backgroundColor: '#0d1529',
          quality: 'medium',
        }) as typeof stage;

        stageRef.current = stage;
        setLoadProgress(50);

        // Load the PDB file from AlphaFold CDN
        const component = await stage!.loadFile(pdbUrl, { ext: 'pdb' });
        setLoadProgress(80);

        // ── Cartoon representation colored by pLDDT (B-factor) ──────────────
        // AlphaFold stores pLDDT in the B-factor column.
        // We use NGL's built-in bfactor color scheme which reads this column directly.
        component.addRepresentation('cartoon', {
          colorScheme: 'bfactor',
          colorScale: [
            [0,   '#ff7d45'],   // Very Low  < 50
            [50,  '#f6d001'],   // Low        50-70
            [70,  '#65cbf3'],   // Confident  70-90
            [90,  '#0053d6'],   // Very High > 90
            [100, '#0053d6'],
          ],
          smoothSheet: true,
          quality: 'high',
        });

        // ── Mutated residue highlight ────────────────────────────────────────
        if (mappedUniprotPosition !== null) {
          // Spacefill for the specific residue
          component.addRepresentation('spacefill', {
            sele: `${mappedUniprotPosition}`,
            color: '#ff2d55',
            opacity: 0.95,
            radius: 1.8,
          });

          // Ball+stick for extra visibility
          component.addRepresentation('ball+stick', {
            sele: `${mappedUniprotPosition}`,
            color: '#ff2d55',
            bondScale: 0.3,
            atomScale: 0.4,
          });

          // Label on the mutated residue
          component.addRepresentation('label', {
            sele: `${mappedUniprotPosition} and .CA`,
            labelType: 'res',
            color: '#ffffff',
            zOffset: 2,
            attachment: 'middle-center',
            showBackground: true,
            backgroundColor: 'rgba(255,45,85,0.8)',
          });
        }

        component.autoView();
        setLoadProgress(100);
        setIsLoading(false);
      } catch (err) {
        console.error('NGL error:', err);
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load protein structure. The PDB URL may be temporarily unavailable.'
        );
        setIsLoading(false);
      }
    };

    init();

    // Handle resize
    const handleResize = () => {
      if (stageRef.current) {
        (stageRef.current as { handleResize: () => void }).handleResize();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (stageRef.current) {
        (stageRef.current as { dispose: () => void }).dispose();
        stageRef.current = null;
      }
    };
  }, [pdbUrl, mappedUniprotPosition]);

  return (
    <div className="flex flex-col h-full">
      {/* Viewer container */}
      <div className="relative flex-1 rounded-lg overflow-hidden bio-panel" style={{ minHeight: '480px' }}>

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-bio-panel">
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-bio-border"></div>
                <div
                  className="absolute inset-0 rounded-full border-2 border-transparent border-t-bio-accent spinner"
                ></div>
                <div className="absolute inset-2 rounded-full border border-transparent border-t-bio-green spinner" style={{ animationDuration: '0.7s' }}></div>
              </div>
              <div className="text-center">
                <p className="text-bio-accent font-mono text-sm">Loading Structure</p>
                <p className="text-bio-muted font-mono text-xs mt-1">{uniprotAccession}</p>
              </div>
              {/* Progress bar */}
              <div className="w-48 h-1 bg-bio-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-bio-accent rounded-full transition-all duration-500"
                  style={{ width: `${loadProgress}%` }}
                ></div>
              </div>
              <p className="text-bio-muted font-mono text-xs">{loadProgress}%</p>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {error && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-bio-panel p-6">
            <div className="text-center max-w-sm">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-900/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-bio-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-bio-red font-mono text-sm mb-2">Viewer Error</p>
              <p className="text-bio-muted text-xs leading-relaxed">{error}</p>
              <a
                href={pdbUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-bio-accent text-xs font-mono hover:underline"
              >
                Download PDB directly ↗
              </a>
            </div>
          </div>
        )}

        {/* NGL Viewport */}
        <div ref={viewportRef} className="w-full h-full" style={{ minHeight: '480px' }} />

        {/* Overlay badge */}
        {!isLoading && !error && (
          <div className="absolute top-3 left-3">
            <span className="badge badge-info">
              <span className="w-1.5 h-1.5 rounded-full bg-bio-accent inline-block animate-pulse"></span>
              AlphaFold · {uniprotAccession}
            </span>
          </div>
        )}

        {/* Controls hint */}
        {!isLoading && !error && (
          <div className="absolute bottom-3 right-3 text-bio-muted font-mono text-xs opacity-60">
            Drag to rotate · Scroll to zoom · Right-drag to pan
          </div>
        )}
      </div>

      {/* pLDDT Legend */}
      <div className="mt-3 bio-panel p-3">
        <p className="text-bio-muted font-mono text-xs mb-2 uppercase tracking-wider">pLDDT Confidence Score</p>
        <div className="flex flex-wrap gap-2">
          {PLDDT_SCHEME.map((band) => (
            <div key={band.label} className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: band.color }}
              ></span>
              <span className="text-xs text-slate-300 font-mono">{band.label}</span>
            </div>
          ))}
          {mappedUniprotPosition !== null && (
            <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-bio-border">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: '#ff2d55' }}></span>
              <span className="text-xs text-bio-red font-mono">Mutation (residue {mappedUniprotPosition})</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProteinViewer;