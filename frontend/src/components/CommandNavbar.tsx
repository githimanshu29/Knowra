// React functional component and Lucide icons
import React from 'react';
import {
  Activity,
  BrainCircuit,
  Building2,
  Database,
  LogIn,
  LogOut,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
// Redux typed hooks and slice actions
import { useAppDispatch, useAppSelector } from '../store/index.js';
import { logout } from '../store/slices/authSlice.js';
import { openAuthModal, setActiveView, type NavigationTab } from '../store/slices/uiSlice.js';

// Top command navigation dock with floating glass capsule
// returns: React.JSX.Element
export const CommandNavbar: React.FC = () => {
  const dispatch = useAppDispatch();
  const { user, isAuthenticated, tenantSlug } = useAppSelector((state) => state.auth);
  const { activeView } = useAppSelector((state) => state.ui);

  // Navigation tabs configuration
  const navItems: Array<{ id: NavigationTab; label: string; icon: React.ReactNode }> = [
    {
      id: 'intelligence',
      label: 'Neural Intelligence',
      icon: <BrainCircuit size={16} />,
    },
    {
      id: 'vault',
      label: 'Knowledge Vault',
      icon: <Database size={16} />,
    },
    {
      id: 'security',
      label: 'Security & Guardrails',
      icon: <ShieldCheck size={16} />,
    },
    {
      id: 'telemetry',
      label: 'Retrieval Telemetry',
      icon: <Activity size={16} />,
    },
  ];

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 50,
      padding: '16px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
    }}>
      {/* 1. Brand Logo & System Status Pulse */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.2), rgba(168, 85, 247, 0.2))',
          border: '1px solid rgba(0, 242, 254, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 20px rgba(0, 242, 254, 0.3)',
        }}>
          <Sparkles size={22} color="#00f2fe" />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontSize: '1.15rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              background: 'linear-gradient(90deg, #ffffff, #94a3b8)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              KNOWRA
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(0, 242, 254, 0.1)',
              border: '1px solid rgba(0, 242, 254, 0.25)',
              color: '#00f2fe',
              letterSpacing: '0.06em',
            }}>
              ENTERPRISE OS
            </span>
          </div>
          <div style={{
            fontSize: '0.72rem',
            color: 'var(--text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 8px #10b981',
            }} />
            POSTGRESQL + PGVECTOR ACTIVE
          </div>
        </div>
      </div>

      {/* 2. Floating Capsule Dock (Navigation Switcher) */}
      <nav className="glass-panel" style={{
        display: 'flex',
        alignItems: 'center',
        padding: '5px',
        borderRadius: 'var(--radius-pill)',
        border: '1px solid var(--border-medium)',
      }}>
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => dispatch(setActiveView(item.id))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-pill)',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.86rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#050a14' : 'var(--text-secondary)',
                background: isActive
                  ? 'linear-gradient(135deg, var(--accent-cyan), #38bdf8)'
                  : 'transparent',
                boxShadow: isActive ? '0 0 20px rgba(0, 242, 254, 0.4)' : 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 3. Tenant Chip & User Profile HUD */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Tenant Slug Indicator */}
        <div className="glass-pill" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
        }}>
          <Building2 size={14} color="#a855f7" />
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            {tenantSlug || 'default-tenant'}
          </span>
        </div>

        {/* User Session Profile Button */}
        {isAuthenticated && user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="glass-pill" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
            }}>
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.72rem',
                fontWeight: 700,
                color: '#fff',
              }}>
                {user.fullName ? user.fullName[0].toUpperCase() : 'U'}
              </div>
              <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>
                {user.fullName || user.email}
              </span>
              {user.isSuperAdmin && (
                <span style={{
                  fontSize: '0.65rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'rgba(168, 85, 247, 0.2)',
                  color: '#c084fc',
                  fontWeight: 700,
                }}>
                  ADMIN
                </span>
              )}
            </div>

            <button
              onClick={() => dispatch(logout())}
              className="btn-ghost"
              title="Sign Out"
              style={{ padding: '8px', borderRadius: '50%' }}
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => dispatch(openAuthModal('login'))}
            className="btn-primary"
          >
            <LogIn size={15} />
            <span>Sign In / Connect</span>
          </button>
        )}
      </div>
    </header>
  );
};
