import React, { useState, useEffect } from 'react';
import { Button } from '../components/Button';
import { SignaturePad } from '../components/SignaturePad';
import { useAuth } from '../context/AuthContext';
import { intakeService, IntakeData } from '../services/intakeService';
import { apiFetch } from '../services/apiClient';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, CheckCircle, AlertTriangle, FileText, Shield } from 'lucide-react';

const FITZPATRICK_TYPES = [
  { value: 'I', label: 'Tipo I', skin: 'Muy clara', reaction: 'Siempre se quema, nunca se broncea', color: '#FDEBD0' },
  { value: 'II', label: 'Tipo II', skin: 'Clara', reaction: 'Se quema fácilmente, se broncea poco', color: '#F5CBA7' },
  { value: 'III', label: 'Tipo III', skin: 'Media', reaction: 'Se quema moderadamente, se broncea gradualmente', color: '#E0AC69' },
  { value: 'IV', label: 'Tipo IV', skin: 'Oliva', reaction: 'Se quema poco, se broncea bien', color: '#C68642' },
  { value: 'V', label: 'Tipo V', skin: 'Morena', reaction: 'Rara vez se quema, se broncea intensamente', color: '#8D5524' },
  { value: 'VI', label: 'Tipo VI', skin: 'Oscura', reaction: 'Nunca se quema, pigmentación muy oscura', color: '#4A2C0A' },
];

const MEDICAL_QUESTIONS = [
  { key: 'allergies', label: '¿Tienes alergias conocidas?', type: 'text' as const, placeholder: 'Describe tus alergias o escribe "Ninguna"' },
  { key: 'medications', label: '¿Tomas medicamentos actualmente?', type: 'text' as const, placeholder: 'Lista tus medicamentos o escribe "Ninguno"' },
  { key: 'skinConditions', label: '¿Tienes condiciones dermatológicas?', type: 'text' as const, placeholder: 'Eczema, psoriasis, vitíligo, etc.' },
  { key: 'previousLaser', label: '¿Has tenido tratamientos láser previos?', type: 'boolean' as const },
  { key: 'pregnancyBreastfeeding', label: '¿Estás embarazada o en lactancia?', type: 'boolean' as const },
  { key: 'photosensitivity', label: '¿Tomas medicamentos fotosensibilizantes?', type: 'boolean' as const },
  { key: 'autoimmuneDiseases', label: '¿Tienes enfermedades autoinmunes?', type: 'boolean' as const },
  { key: 'activeInfections', label: '¿Tienes infecciones activas en la piel?', type: 'boolean' as const },
  { key: 'isotretinoin', label: '¿Has usado isotretinoína (Roaccutane) en los últimos 6 meses?', type: 'boolean' as const },
  { key: 'recentSunExposure', label: '¿Has tenido exposición solar intensa en las últimas 2 semanas?', type: 'boolean' as const },
  { key: 'tattoos', label: '¿Tienes tatuajes o pigmentación permanente en las zonas a tratar?', type: 'boolean' as const },
  { key: 'surgicalHistory', label: '¿Tienes antecedentes quirúrgicos relevantes?', type: 'text' as const, placeholder: 'Describe o escribe "Ninguno"' },
];

const CONTRAINDICATION_KEYS = ['pregnancyBreastfeeding', 'photosensitivity', 'autoimmuneDiseases', 'activeInfections', 'isotretinoin'];

export const MedicalIntake: React.FC = () => {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [step, setStep] = useState(0);
  const [intake, setIntake] = useState<IntakeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSignature, setShowSignature] = useState(false);

  // Form state
  const [personalData, setPersonalData] = useState({
    firstName: '', lastName: '', phone: '', dateOfBirth: '', sex: '',
    emergencyContactName: '', emergencyContactPhone: ''
  });
  const [questionnaire, setQuestionnaire] = useState<Record<string, unknown>>({});
  const [fitzpatrickType, setFitzpatrickType] = useState('');

  // Load existing intake and profile on mount
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadData();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated]);

  const loadData = async () => {
    try {
      const [intakeData, userData] = await Promise.all([
        intakeService.getMyIntake(),
        apiFetch<any>('/me')
      ]);

      if (userData?.profile) {
        const p = userData.profile;
        setPersonalData({
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          phone: p.phone || '',
          dateOfBirth: p.dateOfBirth ? p.dateOfBirth.split('T')[0] : '',
          sex: p.sex || '',
          emergencyContactName: p.emergencyContactName || '',
          emergencyContactPhone: p.emergencyContactPhone || ''
        });
      }

      if (intakeData) {
        setIntake(intakeData);
        if (intakeData.questionnaire && typeof intakeData.questionnaire === 'object') {
          setQuestionnaire(intakeData.questionnaire as Record<string, unknown>);
        }
        if (intakeData.fitzpatrickType) setFitzpatrickType(intakeData.fitzpatrickType);

        // If already submitted/approved/rejected, go to status view
        if (['submitted', 'approved'].includes(intakeData.status)) {
          setStep(4);
        }
      }
    } catch (e) {
      console.error('Error loading intake data', e);
    } finally {
      setLoading(false);
    }
  };

  const saveProfileData = async () => {
    await apiFetch('/me/profile', {
      method: 'PUT',
      body: JSON.stringify({
        ...personalData,
        dateOfBirth: personalData.dateOfBirth || undefined
      })
    });
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      const contraindications = CONTRAINDICATION_KEYS.filter(k => questionnaire[k] === true);
      const result = await intakeService.saveDraft({
        fitzpatrickType: fitzpatrickType || undefined,
        questionnaire,
        contraindications,
        contraindicationNotes: contraindications.length > 0 ? 'Contraindicaciones detectadas automáticamente' : undefined
      });
      setIntake(result);
    } catch (e) {
      console.error('Error saving draft', e);
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    if (step === 0) await saveProfileData();
    if (step <= 2) await saveDraft();
    setStep(step + 1);
  };

  const handleSubmitAndSign = () => {
    setShowSignature(true);
  };

  const handleSignatureSave = async (signatureData: string) => {
    setSaving(true);
    try {
      await saveDraft();
      await intakeService.sign(signatureData);
      await intakeService.submit();
      setShowSignature(false);
      setStep(4);
      await loadData();
    } catch (e) {
      alert('Error al enviar el expediente.');
    } finally {
      setSaving(false);
    }
  };

  const updateQuestion = (key: string, value: unknown) => {
    setQuestionnaire(prev => ({ ...prev, [key]: value }));
  };

  // Access control
  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-velum-400" size={32} /></div>;
  }
  if (!isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <h2 className="text-2xl font-serif mb-4">Acceso Restringido</h2>
        <p className="mb-4 text-velum-600">Inicia sesión para completar tu expediente médico.</p>
        <Link to="/agenda"><Button>Ir a Login</Button></Link>
      </div>
    );
  }

  // Progress bar
  const steps = ['Datos Personales', 'Historial Médico', 'Fototipo', 'Revisión y Firma', 'Estado'];
  const progress = Math.min(((step + 1) / steps.length) * 100, 100);

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 animate-fade-in">
      <h1 className="text-3xl font-serif text-velum-900 mb-2">Expediente Médico</h1>
      <p className="text-velum-600 font-light mb-8">Completa tu historia clínica para recibir tratamientos personalizados.</p>

      {/* Progress Bar */}
      <div className="mb-10">
        <div className="flex justify-between text-[10px] uppercase tracking-widest text-velum-500 mb-2">
          {steps.map((s, i) => (
            <span key={i} className={i <= step ? 'text-velum-900 font-bold' : ''}>{s}</span>
          ))}
        </div>
        <div className="h-1 bg-velum-200 rounded-full">
          <div className="h-1 bg-velum-900 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Step 0: Personal Data */}
      {step === 0 && (
        <div className="bg-white p-8 border border-velum-200 space-y-6">
          <h2 className="font-serif text-xl mb-4">Datos Personales</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Nombre *</label>
              <input type="text" value={personalData.firstName} onChange={e => setPersonalData({ ...personalData, firstName: e.target.value })} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Apellido *</label>
              <input type="text" value={personalData.lastName} onChange={e => setPersonalData({ ...personalData, lastName: e.target.value })} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Celular *</label>
              <input type="tel" value={personalData.phone} onChange={e => setPersonalData({ ...personalData, phone: e.target.value })} className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none" placeholder="+52 55 1234 5678" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Fecha de Nacimiento</label>
              <input type="date" value={personalData.dateOfBirth} onChange={e => setPersonalData({ ...personalData, dateOfBirth: e.target.value })} className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Sexo</label>
            <div className="flex gap-4">
              {[{ v: 'F', l: 'Femenino' }, { v: 'M', l: 'Masculino' }, { v: 'O', l: 'Otro' }].map(opt => (
                <button key={opt.v} onClick={() => setPersonalData({ ...personalData, sex: opt.v })}
                  className={`px-6 py-2 border text-sm ${personalData.sex === opt.v ? 'border-velum-900 bg-velum-900 text-white' : 'border-velum-300 text-velum-700 hover:border-velum-500'}`}>
                  {opt.l}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Contacto de Emergencia</label>
              <input type="text" value={personalData.emergencyContactName} onChange={e => setPersonalData({ ...personalData, emergencyContactName: e.target.value })} className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none" placeholder="Nombre completo" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Tel. Emergencia</label>
              <input type="tel" value={personalData.emergencyContactPhone} onChange={e => setPersonalData({ ...personalData, emergencyContactPhone: e.target.value })} className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none" placeholder="+52 55 9876 5432" />
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Medical Questionnaire */}
      {step === 1 && (
        <div className="bg-white p-8 border border-velum-200 space-y-6">
          <h2 className="font-serif text-xl mb-4">Historial Médico</h2>
          <p className="text-sm text-velum-600 mb-6">Responde con honestidad. Esta información es confidencial y necesaria para tu seguridad.</p>
          {MEDICAL_QUESTIONS.map(q => (
            <div key={q.key} className="border-b border-velum-100 pb-4">
              <label className="block text-sm font-medium text-velum-800 mb-2">{q.label}</label>
              {q.type === 'boolean' ? (
                <div className="flex gap-4">
                  <button onClick={() => updateQuestion(q.key, true)}
                    className={`px-6 py-2 border text-sm ${questionnaire[q.key] === true ? 'border-velum-900 bg-velum-900 text-white' : 'border-velum-300 text-velum-700 hover:border-velum-500'}`}>
                    Sí
                  </button>
                  <button onClick={() => updateQuestion(q.key, false)}
                    className={`px-6 py-2 border text-sm ${questionnaire[q.key] === false ? 'border-velum-900 bg-velum-900 text-white' : 'border-velum-300 text-velum-700 hover:border-velum-500'}`}>
                    No
                  </button>
                </div>
              ) : (
                <input type="text" value={(questionnaire[q.key] as string) || ''} onChange={e => updateQuestion(q.key, e.target.value)}
                  className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none text-sm" placeholder={q.placeholder} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Step 2: Fitzpatrick */}
      {step === 2 && (
        <div className="bg-white p-8 border border-velum-200">
          <h2 className="font-serif text-xl mb-4">Fototipo de Piel (Fitzpatrick)</h2>
          <p className="text-sm text-velum-600 mb-6">Selecciona el tipo que mejor describa tu piel. Esto determina los parámetros seguros para tu tratamiento láser.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FITZPATRICK_TYPES.map(ft => (
              <button key={ft.value} onClick={() => setFitzpatrickType(ft.value)}
                className={`p-4 border text-left transition-all ${fitzpatrickType === ft.value ? 'border-velum-900 shadow-md ring-2 ring-velum-900/20' : 'border-velum-200 hover:border-velum-400'}`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full border border-velum-300" style={{ backgroundColor: ft.color }} />
                  <span className="font-bold text-sm">{ft.label}</span>
                </div>
                <p className="text-xs text-velum-600">{ft.skin} — {ft.reaction}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Review & Sign */}
      {step === 3 && (
        <div className="bg-white p-8 border border-velum-200 space-y-6">
          <h2 className="font-serif text-xl mb-4">Revisión y Firma</h2>

          {/* Contraindications warning */}
          {CONTRAINDICATION_KEYS.some(k => questionnaire[k] === true) && (
            <div className="bg-orange-50 border-l-4 border-orange-500 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-orange-500 flex-shrink-0 mt-0.5" size={20} />
                <div>
                  <p className="font-bold text-orange-900 text-sm">Contraindicaciones Detectadas</p>
                  <p className="text-orange-800 text-xs mt-1">Se han identificado posibles contraindicaciones. Tu expediente será revisado por nuestro equipo médico.</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4 text-sm">
            <div className="p-4 bg-velum-50 border border-velum-200">
              <h3 className="font-bold text-velum-800 mb-2">Datos Personales</h3>
              <p>{personalData.firstName} {personalData.lastName}</p>
              <p>Tel: {personalData.phone || 'No proporcionado'}</p>
              <p>Nacimiento: {personalData.dateOfBirth || 'No proporcionado'}</p>
            </div>
            <div className="p-4 bg-velum-50 border border-velum-200">
              <h3 className="font-bold text-velum-800 mb-2">Fototipo</h3>
              <p>{fitzpatrickType ? `Tipo ${fitzpatrickType} — ${FITZPATRICK_TYPES.find(f => f.value === fitzpatrickType)?.skin}` : 'No seleccionado'}</p>
            </div>
            <div className="p-4 bg-velum-50 border border-velum-200">
              <h3 className="font-bold text-velum-800 mb-2">Respuestas Médicas</h3>
              {MEDICAL_QUESTIONS.map(q => (
                <div key={q.key} className="flex justify-between py-1 border-b border-velum-100 last:border-0">
                  <span className="text-velum-600 text-xs">{q.label}</span>
                  <span className="text-velum-900 text-xs font-medium">
                    {questionnaire[q.key] === true ? 'Sí' : questionnaire[q.key] === false ? 'No' : (questionnaire[q.key] as string) || '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-velum-100 p-4 border border-velum-200">
            <div className="flex items-start gap-3">
              <Shield className="text-velum-600 flex-shrink-0 mt-0.5" size={20} />
              <p className="text-xs text-velum-700 leading-relaxed">
                Al firmar, declaro que la información proporcionada es verdadera y completa. Entiendo que la omisión
                o falsificación de datos puede poner en riesgo mi salud durante los tratamientos láser. Autorizo a
                VELUM a utilizar esta información exclusivamente para fines clínicos y de seguridad.
              </p>
            </div>
          </div>

          <Button className="w-full" onClick={handleSubmitAndSign} disabled={saving}>
            {saving ? <Loader2 className="animate-spin mr-2" size={16} /> : <FileText className="mr-2" size={16} />}
            Firmar y Enviar Expediente
          </Button>
        </div>
      )}

      {/* Step 4: Status */}
      {step === 4 && intake && (
        <div className="bg-white p-8 border border-velum-200 text-center space-y-6">
          {intake.status === 'submitted' && (
            <>
              <CheckCircle className="mx-auto text-green-600" size={48} />
              <h2 className="font-serif text-2xl text-velum-900">Expediente Enviado</h2>
              <p className="text-velum-600">Tu expediente médico ha sido enviado para revisión. Te notificaremos cuando sea aprobado.</p>
              <div className="inline-block bg-yellow-100 text-yellow-800 px-4 py-2 text-xs uppercase tracking-widest font-bold">
                En Revisión
              </div>
            </>
          )}
          {intake.status === 'approved' && (
            <>
              <CheckCircle className="mx-auto text-green-600" size={48} />
              <h2 className="font-serif text-2xl text-velum-900">Expediente Aprobado</h2>
              <p className="text-velum-600">Tu expediente ha sido aprobado. Ya puedes agendar tus sesiones de tratamiento.</p>
              <div className="inline-block bg-green-100 text-green-800 px-4 py-2 text-xs uppercase tracking-widest font-bold">
                Aprobado
              </div>
              <div className="pt-4">
                <Link to="/agenda"><Button>Agendar Sesión</Button></Link>
              </div>
            </>
          )}
          {intake.status === 'rejected' && (
            <>
              <AlertTriangle className="mx-auto text-red-500" size={48} />
              <h2 className="font-serif text-2xl text-velum-900">Expediente Rechazado</h2>
              <p className="text-velum-600">{intake.reviewNotes || 'Contacta a la clínica para más información.'}</p>
              <div className="inline-block bg-red-100 text-red-800 px-4 py-2 text-xs uppercase tracking-widest font-bold">
                Rechazado
              </div>
              <div className="pt-4">
                <Button onClick={() => setStep(0)}>Editar y Re-enviar</Button>
              </div>
            </>
          )}
          {intake.status === 'draft' && (
            <>
              <FileText className="mx-auto text-velum-400" size={48} />
              <h2 className="font-serif text-2xl text-velum-900">Expediente en Borrador</h2>
              <p className="text-velum-600">Tienes un expediente sin terminar. Completa todos los pasos para enviarlo.</p>
              <Button onClick={() => setStep(0)}>Continuar</Button>
            </>
          )}
        </div>
      )}

      {/* Navigation */}
      {step < 4 && (
        <div className="flex justify-between mt-8">
          <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
            className="flex items-center gap-2 text-sm text-velum-600 hover:text-velum-900 disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronLeft size={16} /> Anterior
          </button>
          {step < 3 ? (
            <Button onClick={handleNext} disabled={saving}>
              {saving ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
              Siguiente <ChevronRight size={16} className="ml-2" />
            </Button>
          ) : null}
        </div>
      )}

      {/* Signature Modal */}
      {showSignature && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <SignaturePad
            title="Firma del Expediente Médico"
            onCancel={() => setShowSignature(false)}
            onSave={handleSignatureSave}
          />
        </div>
      )}
    </div>
  );
};
