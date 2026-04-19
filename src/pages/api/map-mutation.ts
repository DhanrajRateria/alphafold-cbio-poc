// src/pages/api/map-mutation.ts
// Orchestrates the full biological data pipeline:
//   Ensembl REST → UniProt REST → Needleman-Wunsch alignment → AlphaFold EBI API

import type { NextApiRequest, NextApiResponse } from 'next';
import axios, { AxiosError } from 'axios';
import { mapPosition } from '@/utils/alignment';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MutationMappingResult {
  // Input echo
  transcriptId: string;
  mutationPosition: number;

  // Ensembl data
  ensemblProteinSequence: string;
  ensemblProteinLength: number;

  // UniProt data
  uniprotAccession: string;
  uniprotSequence: string;
  uniprotSequenceLength: number;

  // Alignment result
  mappedUniprotPosition: number | null;
  alignmentIdentity: number;
  alignmentDetails: string;

  // AlphaFold data
  alphaFoldPdbUrl: string;
  alphaFoldCifUrl: string;
  alphaFoldModelConfidence: number;    // mean pLDDT over full structure
  alphaFoldVersion: string;

  // Confidence at the specific residue (if available via summary)
  residueConfidence: number | null;
}

export interface ApiError {
  error: string;
  stage: string;
  details?: string;
}

// ─── Ensembl helpers ─────────────────────────────────────────────────────────

async function fetchEnsemblProtein(
  transcriptId: string
): Promise<{ sequence: string; uniprotId: string | null }> {
  const seqUrl = `https://rest.ensembl.org/sequence/id/${transcriptId}?type=protein`;
  const seqResponse = await axios.get<string>(seqUrl, {
    headers: { Accept: 'text/plain' },
    timeout: 20000,
  });
  const sequence = seqResponse.data.trim();
  if (!sequence || sequence.length < 5) {
    throw new Error(`No protein sequence returned for transcript ${transcriptId}`);
  }

  // Fetch cross-references to find canonical UniProt ID
  const xrefUrl = `https://rest.ensembl.org/xrefs/id/${transcriptId}?external_db=Uniprot/SWISSPROT&content-type=application/json`;
  let uniprotId: string | null = null;
  try {
    const xrefResp = await axios.get<Array<{ primary_id: string; dbname: string }>>(xrefUrl, {
      headers: { Accept: 'application/json' },
      timeout: 20000,
    });
    const swissEntry = xrefResp.data.find(
      (x) => x.dbname === 'Uniprot/SWISSPROT' || x.dbname === 'UniProtKB/Swiss-Prot'
    );
    uniprotId = swissEntry?.primary_id ?? null;

    // Fallback: try TrEMBL if Swiss-Prot not found
    if (!uniprotId) {
      const tremblEntry = xrefResp.data.find(
        (x) => x.dbname === 'Uniprot/SPTREMBL' || x.dbname === 'UniProtKB/TrEMBL'
      );
      uniprotId = tremblEntry?.primary_id ?? null;
    }
  } catch {
    // xref call failed; we'll search UniProt by transcript ID below
    uniprotId = null;
  }

  return { sequence, uniprotId };
}

// ─── UniProt helpers ──────────────────────────────────────────────────────────

interface UniProtEntry {
  accession: string;
  sequence: string;
}

async function fetchUniProtByAccession(accession: string): Promise<UniProtEntry> {
  const url = `https://rest.uniprot.org/uniprotkb/${accession}.json`;
  const resp = await axios.get<{
    primaryAccession: string;
    sequence: { value: string };
  }>(url, { timeout: 20000 });

  return {
    accession: resp.data.primaryAccession,
    sequence: resp.data.sequence.value,
  };
}

async function fetchUniProtByTranscript(transcriptId: string): Promise<UniProtEntry | null> {
  // Search UniProt by Ensembl transcript cross-reference
  const searchUrl = `https://rest.uniprot.org/uniprotkb/search?query=xref:ensembl-${transcriptId}&fields=accession,sequence&format=json&size=1`;
  const resp = await axios.get<{
    results: Array<{ primaryAccession: string; sequence: { value: string } }>;
  }>(searchUrl, { timeout: 20000 });

  const first = resp.data.results?.[0];
  if (!first) return null;
  return { accession: first.primaryAccession, sequence: first.sequence.value };
}

// ─── AlphaFold helpers ───────────────────────────────────────────────────────

interface AlphaFoldEntry {
  pdbUrl: string;
  cifUrl: string;
  modelConfidence: number;
  version: string;
}

async function fetchAlphaFold(uniprotId: string): Promise<AlphaFoldEntry> {
  const url = `https://alphafold.ebi.ac.uk/api/prediction/${uniprotId}`;
  const resp = await axios.get<
    Array<{
      pdbUrl: string;
      cifUrl: string;
      globalMetricValue?: number;
      meanPlddt?: number;
      modelCreatedDate?: string;
      latestVersion?: number;
    }>
  >(url, { timeout: 30000 });

  const entry = resp.data?.[0];
  if (!entry) {
    throw new Error(`No AlphaFold prediction found for UniProt ID ${uniprotId}`);
  }

  return {
    pdbUrl: entry.pdbUrl,
    cifUrl: entry.cifUrl,
    modelConfidence: entry.globalMetricValue ?? entry.meanPlddt ?? 0,
    version: entry.latestVersion?.toString() ?? 'unknown',
  };
}

// ─── Main API handler ─────────────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MutationMappingResult | ApiError>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', stage: 'routing' });
  }

  const { transcriptId, mutationPosition } = req.body as {
    transcriptId?: string;
    mutationPosition?: number;
  };

  if (!transcriptId || !mutationPosition) {
    return res.status(400).json({
      error: 'Missing required fields: transcriptId and mutationPosition',
      stage: 'validation',
    });
  }

  const pos = Number(mutationPosition);
  if (!Number.isInteger(pos) || pos < 1) {
    return res.status(400).json({
      error: 'mutationPosition must be a positive integer (1-based)',
      stage: 'validation',
    });
  }

  // ── Stage 1: Ensembl ──────────────────────────────────────────────────────
  let ensemblSeq: string;
  let ensemblUniprotId: string | null;

  try {
    const result = await fetchEnsemblProtein(transcriptId.trim().toUpperCase());
    ensemblSeq = result.sequence;
    ensemblUniprotId = result.uniprotId;
  } catch (err) {
    const msg = err instanceof AxiosError
      ? `${err.response?.status}: ${JSON.stringify(err.response?.data)}`
      : String(err);
    return res.status(502).json({
      error: `Failed to fetch protein sequence from Ensembl for transcript "${transcriptId}"`,
      stage: 'ensembl',
      details: msg,
    });
  }

  if (pos > ensemblSeq.length) {
    return res.status(400).json({
      error: `Mutation position ${pos} exceeds protein length ${ensemblSeq.length}`,
      stage: 'validation',
    });
  }

  // ── Stage 2: UniProt ──────────────────────────────────────────────────────
  let uniprotEntry: UniProtEntry;

  try {
    if (ensemblUniprotId) {
      uniprotEntry = await fetchUniProtByAccession(ensemblUniprotId);
    } else {
      const found = await fetchUniProtByTranscript(transcriptId);
      if (!found) {
        return res.status(404).json({
          error: `No canonical UniProt entry found for transcript ${transcriptId}`,
          stage: 'uniprot',
          details: 'Tried both Ensembl cross-reference and UniProt search endpoints.',
        });
      }
      uniprotEntry = found;
    }
  } catch (err) {
    const msg = err instanceof AxiosError
      ? `${err.response?.status}: ${JSON.stringify(err.response?.data)}`
      : String(err);
    return res.status(502).json({
      error: 'Failed to fetch canonical sequence from UniProt',
      stage: 'uniprot',
      details: msg,
    });
  }

  // ── Stage 3: Needleman-Wunsch Alignment ───────────────────────────────────
  const { uniprotPos, identity, alignmentDetails } = mapPosition(
    pos,
    ensemblSeq,
    uniprotEntry.sequence
  );

  // ── Stage 4: AlphaFold ────────────────────────────────────────────────────
  let afEntry: AlphaFoldEntry;

  try {
    afEntry = await fetchAlphaFold(uniprotEntry.accession);
  } catch (err) {
    const msg = err instanceof AxiosError
      ? `${err.response?.status}: ${JSON.stringify(err.response?.data)}`
      : String(err);
    return res.status(404).json({
      error: `No AlphaFold structure found for UniProt accession ${uniprotEntry.accession}`,
      stage: 'alphafold',
      details: msg,
    });
  }

  // ── Response ──────────────────────────────────────────────────────────────
  const result: MutationMappingResult = {
    transcriptId: transcriptId.trim().toUpperCase(),
    mutationPosition: pos,

    ensemblProteinSequence: ensemblSeq,
    ensemblProteinLength: ensemblSeq.length,

    uniprotAccession: uniprotEntry.accession,
    uniprotSequence: uniprotEntry.sequence,
    uniprotSequenceLength: uniprotEntry.sequence.length,

    mappedUniprotPosition: uniprotPos,
    alignmentIdentity: identity,
    alignmentDetails,

    alphaFoldPdbUrl: afEntry.pdbUrl,
    alphaFoldCifUrl: afEntry.cifUrl,
    alphaFoldModelConfidence: afEntry.modelConfidence,
    alphaFoldVersion: afEntry.version,

    residueConfidence: null, // pLDDT per-residue is parsed from PDB by the frontend NGL viewer
  };

  return res.status(200).json(result);
}