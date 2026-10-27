// React root application component
import React from 'react';
// Redux typed selector hook
import { useAppSelector } from './store/index.js';
// Components
import { CommandNavbar } from './components/CommandNavbar.js';
import { AuthModal } from './components/AuthModal.js';
import { NeuralChatView } from './components/NeuralChatView.js';
import { EvidenceDrawer } from './components/EvidenceDrawer.js';
import { KnowledgeVaultView } from './components/KnowledgeVaultView.js';
import { PermissionsModal } from './components/PermissionsModal.js';
import { SecurityConsoleView } from './components/SecurityConsoleView.js';
import { TelemetryView } from './components/TelemetryView.js';

// Root application layout displaying executive command HUD and active studio view
// returns: React.JSX.Element
export const App: React.FC = () => {
  const { activeView } = useAppSelector((state) => state.ui);

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="ambient-mesh">
        <div className="ambient-sphere-1" />
        <div className="ambient-sphere-2" />
        <div className="ambient-sphere-3" />
        <div className="ambient-grid" />
      </div>

      <CommandNavbar />

      <main style={{ flex: 1, padding: '0 24px 32px', position: 'relative', zIndex: 10 }}>
        {activeView === 'intelligence' && <NeuralChatView />}
        {activeView === 'vault' && <KnowledgeVaultView />}
        {activeView === 'security' && <SecurityConsoleView />}
        {activeView === 'telemetry' && <TelemetryView />}
      </main>

      <AuthModal />
      <EvidenceDrawer />
      <PermissionsModal />
    </div>
  );
};

export default App;
