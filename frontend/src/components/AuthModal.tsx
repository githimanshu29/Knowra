// React hooks and Lucide icons
import React, { useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Lock,
  Mail,
  Sparkles,
  User,
  X,
} from 'lucide-react';
// Redux typed hooks and slice actions
import { useAppDispatch, useAppSelector } from '../store/index.js';
import { setCredentials, setTenantSlug } from '../store/slices/authSlice.js';
import { closeAuthModal, setAuthModalTab } from '../store/slices/uiSlice.js';
// API service wrapper
import { knowraApi } from '../services/api.js';

// Executive authentication dialog with tenant switching and 1-click RBAC presets
// returns: React.JSX.Element | null
export const AuthModal: React.FC = () => {
  const dispatch = useAppDispatch();
  const { isAuthModalOpen, authModalTab } = useAppSelector((state) => state.ui);
  const { tenantSlug } = useAppSelector((state) => state.auth);

  // Form states
  const [slug, setSlug] = useState(tenantSlug || 'test-corp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');

  // Status feedback
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isAuthModalOpen) return null;

  // Handles login submission
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // res is an Object { token: string, user: UserProfile }
      const res = await knowraApi.login(slug, email, password);
      dispatch(setCredentials({ token: res.token, user: res.user, tenantSlug: slug }));
      dispatch(closeAuthModal());
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data;
      const msg = errData?.message || errData?.error;
      setErrorMessage(msg || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handles tenant creation submission
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await knowraApi.registerTenant({
        tenantName: orgName,
        tenantSlug: slug,
        adminEmail: email,
        adminPassword: password,
        adminFullName: fullName,
      });

      setSuccessMessage('Organization workspace created! Connecting...');
      dispatch(setCredentials({ token: res.token, user: res.user, tenantSlug: slug }));
      setTimeout(() => {
        dispatch(closeAuthModal());
      }, 700);
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data;
      const msg = errData?.message || errData?.error;
      setErrorMessage(msg || 'Registration failed. Check if slug or email exists.');
    } finally {
      setIsLoading(false);
    }
  };

  // 1-Click RBAC preset filler for rapid testing
  const applyPreset = (presetRole: 'admin' | 'engineer' | 'hr') => {
    setSlug('enterprise-corp');
    if (presetRole === 'admin') {
      setEmail('admin@testcorp.com');
      setPassword('admin123');
    } else if (presetRole === 'engineer') {
      setEmail('engineer@testcorp.com');
      setPassword('eng123');
    } else {
      setEmail('hr@testcorp.com');
      setPassword('hr123');
    }
    setErrorMessage(null);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(4, 7, 14, 0.75)',
      backdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '480px',
        background: 'rgba(12, 18, 32, 0.9)',
        border: '1px solid rgba(0, 242, 254, 0.25)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 242, 254, 0.15)',
        padding: '32px',
        position: 'relative',
      }}>
        <button
          onClick={() => dispatch(closeAuthModal())}
          className="btn-ghost"
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            padding: '6px',
            borderRadius: '50%',
          }}
        >
          <X size={18} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.2), rgba(168, 85, 247, 0.2))',
            border: '1px solid rgba(0, 242, 254, 0.4)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '12px',
          }}>
            <Sparkles size={24} color="#00f2fe" />
          </div>
          <h2 style={{ fontSize: '1.4rem', color: '#fff', marginBottom: '4px' }}>
            {authModalTab === 'login' ? 'Enterprise Authentication' : 'Register Organization'}
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {authModalTab === 'login'
              ? 'Connect securely to your multi-tenant intelligence vault'
              : 'Create an isolated workspace with custom roles and ACL boundaries'}
          </p>
        </div>

        <div style={{
          display: 'flex',
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: 'var(--radius-pill)',
          padding: '4px',
          marginBottom: '20px',
        }}>
          <button
            onClick={() => { dispatch(setAuthModalTab('login')); setErrorMessage(null); }}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: 'var(--radius-pill)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: authModalTab === 'login' ? 'rgba(0, 242, 254, 0.15)' : 'transparent',
              color: authModalTab === 'login' ? '#00f2fe' : 'var(--text-secondary)',
              transition: 'all var(--transition-fast)',
            }}
          >
            Sign In
          </button>
          <button
            onClick={() => { dispatch(setAuthModalTab('register')); setErrorMessage(null); }}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: 'var(--radius-pill)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: authModalTab === 'register' ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
              color: authModalTab === 'register' ? '#c084fc' : 'var(--text-secondary)',
              transition: 'all var(--transition-fast)',
            }}
          >
            New Tenant
          </button>
        </div>

        {errorMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(244, 63, 94, 0.1)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            fontSize: '0.82rem',
            color: '#fb7185',
            marginBottom: '16px',
          }}>
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            fontSize: '0.82rem',
            color: '#34d399',
            marginBottom: '16px',
          }}>
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={authModalTab === 'login' ? handleLogin : handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {authModalTab === 'register' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                ORGANIZATION NAME
              </label>
              <div style={{ position: 'relative' }}>
                <Building2 size={16} color="var(--text-tertiary)" style={{ position: 'absolute', left: '14px', top: '14px' }} />
                <input
                  type="text"
                  required
                  placeholder="Acme Aerospace Technologies"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', paddingLeft: '40px' }}
                />
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              TENANT SLUG (ISOLATION ID)
            </label>
            <div style={{ position: 'relative' }}>
              <Building2 size={16} color="var(--text-tertiary)" style={{ position: 'absolute', left: '14px', top: '14px' }} />
              <input
                type="text"
                required
                placeholder="acme-corp"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                  dispatch(setTenantSlug(e.target.value));
                }}
                className="glass-input font-mono"
                style={{ width: '100%', paddingLeft: '40px' }}
              />
            </div>
          </div>

          {authModalTab === 'register' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                ADMIN FULL NAME
              </label>
              <div style={{ position: 'relative' }}>
                <User size={16} color="var(--text-tertiary)" style={{ position: 'absolute', left: '14px', top: '14px' }} />
                <input
                  type="text"
                  required
                  placeholder="Elena Rostova"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', paddingLeft: '40px' }}
                />
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              USER EMAIL
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} color="var(--text-tertiary)" style={{ position: 'absolute', left: '14px', top: '14px' }} />
              <input
                type="email"
                required
                placeholder="user@enterprise.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="glass-input"
                style={{ width: '100%', paddingLeft: '40px' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              PASSWORD
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="var(--text-tertiary)" style={{ position: 'absolute', left: '14px', top: '14px' }} />
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="glass-input"
                style={{ width: '100%', paddingLeft: '40px' }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary"
            style={{ width: '100%', padding: '12px', marginTop: '8px' }}
          >
            {isLoading ? (
              <span>Authenticating...</span>
            ) : authModalTab === 'login' ? (
              <span>Connect to Intelligence Vault</span>
            ) : (
              <span>Deploy Organization Workspace</span>
            )}
          </button>
        </form>

        {authModalTab === 'login' && (
          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginBottom: '8px', textAlign: 'center' }}>
              QUICK RBAC EVALUATION PRESETS (1-CLICK FILL):
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => applyPreset('admin')}
                className="btn-ghost"
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              >
                SuperAdmin
              </button>
              <button
                type="button"
                onClick={() => applyPreset('engineer')}
                className="btn-ghost"
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              >
                Engineer
              </button>
              <button
                type="button"
                onClick={() => applyPreset('hr')}
                className="btn-ghost"
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              >
                HR Lead
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
