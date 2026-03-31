// src/components/PipelineStep.tsx
// Visual pipeline step indicator showing the status of each API call stage.

import React from 'react';

export type StepStatus = 'idle' | 'loading' | 'success' | 'error' | 'skipped';

interface PipelineStepProps {
    step: number;
    title: string;
    subtitle: string;
    status: StepStatus;
    detail?: string;
    isLast?: boolean;
}

const StatusIcon: React.FC<{ status: StepStatus; step: number }> = ({ status, step }) => {
    if (status === 'loading') {
        return (
            <div className="w-6 h-6 rounded-full border-2 border-bio-border flex items-center justify-center">
                <div className="w-3 h-3 rounded-full border-2 border-transparent border-t-bio-accent spinner"></div>
            </div>
        );
    }
    if (status === 'success') {
        return (
            <div className="w-6 h-6 rounded-full bg-bio-green/20 border border-bio-green flex items-center justify-center">
                <svg className="w-3 h-3 text-bio-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
            </div>
        );
    }
    if (status === 'error') {
        return (
            <div className="w-6 h-6 rounded-full bg-bio-red/20 border border-bio-red flex items-center justify-center">
                <svg className="w-3 h-3 text-bio-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </div>
        );
    }
    if (status === 'skipped') {
        return (
            <div className="w-6 h-6 rounded-full bg-bio-muted/20 border border-bio-muted flex items-center justify-center">
                <span className="text-bio-muted text-xs">–</span>
            </div>
        );
    }
    // idle
    return (
        <div className="w-6 h-6 rounded-full border border-bio-border flex items-center justify-center">
            <span className="text-bio-muted font-mono text-xs">{step}</span>
        </div>
    );
};

export const PipelineStep: React.FC<PipelineStepProps> = ({
    step,
    title,
    subtitle,
    status,
    detail,
    isLast,
}) => {
    const titleColor =
        status === 'success' ? 'text-bio-green' :
            status === 'error' ? 'text-bio-red' :
                status === 'loading' ? 'text-bio-accent' :
                    'text-slate-400';

    return (
        <div className="flex gap-3">
            <div className="flex flex-col items-center">
                <StatusIcon status={status} step={step} />
                {!isLast && (
                    <div
                        className="w-px flex-1 mt-1"
                        style={{
                            background:
                                status === 'success' ? 'linear-gradient(to bottom, #00ff9d40, #1e3a5f)' :
                                    status === 'error' ? 'linear-gradient(to bottom, #ff2d5540, #1e3a5f)' :
                                        'linear-gradient(to bottom, #1e3a5f, transparent)',
                            minHeight: '20px',
                        }}
                    />
                )}
            </div>
            <div className="pb-4 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className={`font-mono text-xs font-medium ${titleColor}`}>{title}</p>
                </div>
                <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>
                {detail && status !== 'idle' && (
                    <p className="text-slate-400 text-xs mt-1 font-mono truncate" title={detail}>
                        {detail}
                    </p>
                )}
            </div>
        </div>
    );
};

export default PipelineStep;