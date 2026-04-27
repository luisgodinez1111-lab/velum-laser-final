import React, { useState } from 'react';
import { Shield, ShieldCheck, ShieldOff, Loader2 } from 'lucide-react';
import { apiFetch } from '../services/apiClient';

interface TotpSetupProps {
  isEnabled: boolean;
  onStatusChange: () => void;
}

export const TotpSetup: React.FC<TotpSetupProps> = ({ isEnabled, onStatusChange }) => {
  const [step, setStep] = useState<'idle' | 'setup' | 'disable'>('idle');
  const [secret, setSecret] = useState('');
  const [uri, setUri] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const startSetup = async () => {
    setLoading(true); setError('');
    try {
      const d = await apiFetch<{ secret?: string; uri?: string }>('/v1/me/totp/setup');
      setSecret(d.secret ?? ''); setUri(d.uri ?? ''); setStep('setup');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  };

  const confirmEnable = async () => {
    if (code.length !== 6) { setError('Ingresa los 6 dígitos'); return; }
    setLoading(true); setError('');
    try {
      await apiFetch('/v1/me/totp/enable', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      setSuccess('2FA activado correctamente'); setStep('idle'); setCode('');
      onStatusChange();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  };

  const confirmDisable = async () => {
    if (code.length !== 6) { setError('Ingresa los 6 dígitos'); return; }
    setLoading(true); setError('');
    try {
      await apiFetch('/v1/me/totp', {
        method: 'DELETE',
        body: JSON.stringify({ code }),
      });
      setSuccess('2FA desactivado'); setStep('idle'); setCode('');
      onStatusChange();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-velum-200 p-6 space-y-4">
      <div className="flex items-center gap-3">
        {isEnabled
          ? <ShieldCheck className="w-5 h-5 text-green-600" />
          : <Shield className="w-5 h-5 text-velum-400" />}
        <div>
          <h3 className="font-semibold text-velum-900">Autenticación de dos factores (2FA)</h3>
          <p className="text-sm text-velum-600">
            {isEnabled ? 'Activo — cuenta protegida con TOTP' : 'Añade una capa extra de seguridad a tu cuenta'}
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {success && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{success}</p>}

      {step === 'idle' && (
        <button
          onClick={isEnabled ? () => { setStep('disable'); setError(''); setCode(''); } : startSetup}
          disabled={loading}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            isEnabled
              ? 'bg-red-50 text-red-700 hover:bg-red-100'
              : 'bg-velum-900 text-white hover:bg-velum-800'
          }`}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isEnabled ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
          {isEnabled ? 'Desactivar 2FA' : 'Activar 2FA'}
        </button>
      )}

      {step === 'setup' && (
        <div className="space-y-4">
          <p className="text-sm text-velum-700">
            Escanea este código con tu app autenticadora (Google Authenticator, Authy, etc.) o ingresa la clave manualmente:
          </p>
          <div className="bg-velum-50 rounded-xl p-4 font-mono text-sm text-velum-900 break-all select-all">{secret}</div>
          <a href={uri} className="text-xs text-velum-500 underline break-all" target="_blank" rel="noreferrer">Abrir en app autenticadora</a>
          <div>
            <label className="block text-sm font-medium text-velum-800 mb-1">Código de verificación (6 dígitos)</label>
            <input
              type="text" inputMode="numeric" maxLength={6} value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-40 border border-velum-300 rounded-xl px-3 py-2 text-center text-lg font-mono focus:outline-none focus:border-velum-700"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={confirmEnable} disabled={loading || code.length !== 6}
              className="px-4 py-2 bg-velum-900 text-white rounded-xl text-sm font-medium hover:bg-velum-800 disabled:opacity-40">
              {loading ? 'Verificando...' : 'Confirmar y activar'}
            </button>
            <button onClick={() => { setStep('idle'); setCode(''); setError(''); }}
              className="px-4 py-2 border border-velum-200 text-velum-700 rounded-xl text-sm hover:bg-velum-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {step === 'disable' && (
        <div className="space-y-3">
          <p className="text-sm text-velum-700">Ingresa el código de tu app autenticadora para desactivar 2FA:</p>
          <input
            type="text" inputMode="numeric" maxLength={6} value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-40 border border-velum-300 rounded-xl px-3 py-2 text-center text-lg font-mono focus:outline-none focus:border-velum-700"
          />
          <div className="flex gap-2">
            <button onClick={confirmDisable} disabled={loading || code.length !== 6}
              className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-40">
              {loading ? 'Verificando...' : 'Desactivar 2FA'}
            </button>
            <button onClick={() => { setStep('idle'); setCode(''); setError(''); }}
              className="px-4 py-2 border border-velum-200 text-velum-700 rounded-xl text-sm hover:bg-velum-50">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
