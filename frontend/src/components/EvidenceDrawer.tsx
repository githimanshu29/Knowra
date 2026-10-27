// React hooks and Lucide icons
import React, { useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  FileText,
  Layers,
  X,
} from 'lucide-react';
// Redux typed hooks and slice actions
import { useAppDispatch, useAppSelector } from '../store/index.js';
import { closeEvidenceDrawer } from '../store/slices/chatSlice.js';

// Interactive slide-over drawer displaying exact source passage, heading path and parent context
// returns: React.JSX.Element | null
export const EvidenceDrawer: React.FC = () => {
  const dispatch = useAppDispatch();
  const { isEvidenceDrawerOpen, activeEvidence } = useAppSelector((state) => state.chat);
  const [copied, setCopied] = useState(false);

  if (!isEvidenceDrawerOpen || !activeEvidence) return null;

  // Copies snippet text to user clipboard
  const handleCopySnippet = () => {
    if (activeEvidence.sourceSnippet) {
      navigator.clipboard.writeText(activeEvidence.sourceSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <aside style={{
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      maxWidth: '460px',
      zIndex: 90,
      background: 'rgba(9, 14, 26, 0.92)',
      backdropFilter: 'blur(30px) saturate(190%)',
      borderLeft: '1px solid rgba(0, 242, 254, 0.25)',
      boxShadow: '-20px 0 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 242, 254, 0.1)',
      display: 'flex',
      flexDirection: 'column',
      animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '10px',
            background: 'rgba(0, 242, 254, 0.12)',
            border: '1px solid rgba(0, 242, 254, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <BookOpen size={18} color="#00f2fe" />
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', color: '#fff', fontWeight: 700 }}>
              Audit Evidence Inspector
            </h3>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
              GROUNDED PASSAGE PROVENANCE
            </span>
          </div>
        </div>

        <button
          onClick={() => dispatch(closeEvidenceDrawer())}
          className="btn-ghost"
          style={{ padding: '6px', borderRadius: '50%' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Body Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Document Metadata Card */}
        <div className="glass-panel" style={{ padding: '16px', background: 'rgba(16, 23, 40, 0.6)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
            <FileText size={20} color="#38bdf8" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#f8fafc', marginBottom: '2px' }}>
                {activeEvidence.documentTitle || 'Corporate Specification Document'}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                DOC ID: {activeEvidence.documentId}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {activeEvidence.pageNumber !== null && (
              <span className="glass-pill" style={{ padding: '3px 10px', fontSize: '0.75rem', color: '#38bdf8' }}>
                Page {activeEvidence.pageNumber}
              </span>
            )}
            <span className="glass-pill" style={{ padding: '3px 10px', fontSize: '0.75rem', color: '#a855f7' }}>
              Chunk {activeEvidence.chunkId.slice(0, 8)}...
            </span>
            <span className="badge badge-grounded" style={{ fontSize: '0.72rem' }}>
              Cosine Distance Match
            </span>
          </div>
        </div>

        {/* Section Hierarchy Breadcrumb */}
        {activeEvidence.headingPath && (
          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-tertiary)', marginBottom: '6px', letterSpacing: '0.05em' }}>
              SECTION HIERARCHY BREADCRUMB
            </label>
            <div className="glass-pill" style={{
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              flexWrap: 'wrap',
            }}>
              {activeEvidence.headingPath.split('>').map((crumb, idx, arr) => (
                <React.Fragment key={idx}>
                  <span style={{ color: idx === arr.length - 1 ? '#00f2fe' : 'var(--text-secondary)', fontWeight: idx === arr.length - 1 ? 600 : 400 }}>
                    {crumb.trim()}
                  </span>
                  {idx < arr.length - 1 && <ChevronRight size={12} color="var(--text-muted)" />}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Exact Source Text Snippet */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
              EXACT RETRIEVED TEXT SNIPPET
            </label>
            <button
              onClick={handleCopySnippet}
              className="btn-ghost"
              style={{ padding: '4px 10px', fontSize: '0.74rem', gap: '4px' }}
            >
              {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div style={{
            background: 'rgba(6, 10, 18, 0.85)',
            border: '1px solid rgba(0, 242, 254, 0.2)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            fontSize: '0.86rem',
            lineHeight: 1.6,
            color: '#e2e8f0',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
          }}>
            {activeEvidence.sourceSnippet}
          </div>
        </div>

        {/* Parent Context Expansion Explainer */}
        <div className="glass-panel" style={{
          padding: '16px',
          background: 'rgba(168, 85, 247, 0.06)',
          border: '1px solid rgba(168, 85, 247, 0.25)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Layers size={16} color="#c084fc" />
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#c084fc' }}>
              Hierarchical Parent Context Swap
            </span>
          </div>
          <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            This chunk was matched via its concise 200-token micro child embedding. The LangGraph engine automatically retrieved the surrounding 800-token macro parent context block before feeding it to the LLM to preserve complete paragraph semantics.
          </p>
        </div>
      </div>
    </aside>
  );
};
