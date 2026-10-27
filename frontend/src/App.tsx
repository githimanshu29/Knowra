// React root application component
import React from 'react';
import { Activity, Database, ShieldCheck } from 'lucide-react';
// Redux typed selector hook
import { useAppSelector } from './store/index.js';
// Components
import { CommandNavbar } from './components/CommandNavbar.js';
import { AuthModal } from './components/AuthModal.js';
import { NeuralChatView } from './components/NeuralChatView.js';
import { EvidenceDrawer } from './components/EvidenceDrawer.js';

// Root application layout displaying executive command HUD and active studio view
// returns: React.JSX.Element
export const App: React.FC = () => {
  const { activeView } = useAppSelector((state) => state.ui);

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Ambient Futuristic Background Mesh */}
      <div className="ambient-mesh">
        <div className="ambient-sphere-1" />
        <div className="ambient-sphere-2" />
        <div className="ambient-sphere-3" />
        <div className="ambient-grid" />
      </div>

      {/* Top Command Deck Navbar */}
      <CommandNavbar />

      {/* Main Studio View Canvas */}
      <main style={{ flex: 1, padding: '0 24px 32px', position: 'relative', zIndex: 10 }}>
        {activeView === 'intelligence' ? (
          <NeuralChatView />
        ) : (
          <div className="glass-panel" style={{
            minHeight: 'calc(100vh - 120px)',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}>
            {activeView === 'vault' && (
              <div>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(138, 43, 226, 0.2))',
                  border: '1px solid rgba(168, 85, 247, 0.4)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                  boxShadow: '0 0 30px rgba(168, 85, 247, 0.25)',
                }}>
                  <Database size={32} color="#c084fc" />
                </div>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>
                  Knowledge Ingestion Vault
                </h1>
                <p style={{ color: 'var(--text-secondary)', maxWidth: '520px', fontSize: '0.95rem' }}>
                  Hierarchical semantic chunker (800t parent / 200t child), heading breadcrumbs, and document-level RBAC authorization.
                </p>
              </div>
            )}

            {activeView === 'security' && (
              <div>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(52, 211, 153, 0.2))',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                  boxShadow: '0 0 30px rgba(16, 185, 129, 0.25)',
                }}>
                  <ShieldCheck size={32} color="#34d399" />
                </div>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>
                  Security & Guardrails Console
                </h1>
                <p style={{ color: 'var(--text-secondary)', maxWidth: '520px', fontSize: '0.95rem' }}>
                  Multilingual prompt injection filters, Global & Indian PII masking (Aadhaar, PAN, phones), and verified contact preservation.
                </p>
              </div>
            )}

            {activeView === 'telemetry' && (
              <div>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(251, 191, 36, 0.2))',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                  boxShadow: '0 0 30px rgba(245, 158, 11, 0.25)',
                }}>
                  <Activity size={32} color="#fbbf24" />
                </div>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>
                  Retrieval Evaluation & Telemetry
                </h1>
                <p style={{ color: 'var(--text-secondary)', maxWidth: '520px', fontSize: '0.95rem' }}>
                  Recall@1 (100%), Mean Reciprocal Rank (1.0), and zero cross-tenant / cross-role ACL leakage benchmarks.
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal Dialogs and Slide-Over Drawers */}
      <AuthModal />
      <EvidenceDrawer />
    </div>
  );
};

export default App;
