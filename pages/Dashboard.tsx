import React, { useState, useEffect } from 'react';
import { Button } from '../components/Button';
import { User, CreditCard, Calendar, ExternalLink, FileText, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { redirectToCustomerPortal } from '../services/stripeService';
import { SignaturePad } from '../components/SignaturePad';
import { Member, LegalDocument } from '../types';
import { useAuth } from '../context/AuthContext';
import { memberService, documentService } from '../services/dataService';
import { Link } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [memberData, setMemberData] = useState<Member | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [currentDocToSign, setCurrentDocToSign] = useState<LegalDocument | null>(null);

  // --- FETCH DATA ON LOAD ---
  useEffect(() => {
    const fetchData = async () => {
        if (user && user.role === 'member') {
            try {
                const data = await memberService.getById(user.id);
                setMemberData(data || null);
            } catch (e) {
                console.error("Error fetching member data", e);
            } finally {
                setIsLoadingData(false);
            }
        } else {
            setIsLoadingData(false);
        }
    };
    if (!isAuthLoading) {
      fetchData();
    }
  }, [user, isAuthLoading]);

  const handlePortalAccess = async () => {
    await redirectToCustomerPortal();
  };

  const initiateSigning = (doc: LegalDocument) => {
    setCurrentDocToSign(doc);
    setShowSignatureModal(true);
  };

  const handleSignatureSave = async (signatureData: string) => {
    if (!currentDocToSign || !user) return;

    try {
        await documentService.signDocument(user.id, currentDocToSign.id, signatureData);
        // Refresh data to show signed status
        const updatedData = await memberService.getById(user.id);
        setMemberData(updatedData || null);
        alert("Documento firmado y almacenado correctamente.");
    } catch (e) {
        alert("Error al guardar la firma.");
    }
    
    setShowSignatureModal(false);
    setCurrentDocToSign(null);
  };

  // --- ACCESS CONTROL ---
  if (isAuthLoading || (isAuthenticated && isLoadingData)) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-velum-400" size={32}/></div>;
  }

  if (!isAuthenticated) {
      return (
          <div className="min-h-[60vh] flex flex-col items-center justify-center">
              <h2 className="text-2xl font-serif mb-4">Acceso Restringido</h2>
              <p className="mb-4 text-velum-600">Debes iniciar sesión para ver tu panel.</p>
              <Link to="/agenda"><Button>Ir a Login</Button></Link>
          </div>
      );
  }

  if (!memberData) {
      return (
          <div className="max-w-4xl mx-auto py-12 px-4 text-center">
              <h2 className="text-xl font-serif">Cuenta Administrativa</h2>
              <p className="text-velum-600 mb-4">Estás logueado como {user?.role}. Este panel es para miembros.</p>
              <Link to="/admin"><Button>Ir al Panel Admin</Button></Link>
          </div>
      );
  }

  // Helper for doc status
  const documents = memberData.clinical?.documents || [];
  const pendingDocs = documents.filter((d) => !d.signed).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 animate-fade-in relative">
      <h1 className="text-3xl font-serif text-velum-900 mb-8">Mi Cuenta Velum</h1>

      {/* COMPLIANCE ALERT BLOCKER */}
      {pendingDocs > 0 && (
          <div className="bg-orange-50 border-l-4 border-orange-500 p-6 mb-8 shadow-sm">
             <div className="flex items-start gap-4">
                 <AlertTriangle className="text-orange-500 flex-shrink-0" size={24} />
                 <div>
                     <h3 className="font-bold text-orange-900 text-lg">Documentación Requerida Pendiente</h3>
                     <p className="text-orange-800 text-sm mb-4">
                         Por regulaciones sanitarias (COFEPRIS) y seguridad, es necesario que firmes los siguientes documentos.
                     </p>
                     <div className="space-y-2">
                         {documents.filter((d) => !d.signed).map((doc) => (
                             <div key={doc.id} className="flex justify-between items-center bg-white p-3 border border-orange-200 rounded-sm">
                                 <span className="text-sm font-bold text-velum-800">{doc.title}</span>
                                 <Button size="sm" onClick={() => initiateSigning(doc)} className="bg-orange-600 hover:bg-orange-700 border-none text-[10px]">
                                     Firmar Ahora
                                 </Button>
                             </div>
                         ))}
                     </div>
                 </div>
             </div>
          </div>
      )}

      <div className="grid gap-6">
        
        {/* Profile Card */}
        <div className="bg-white p-6 border border-velum-200 shadow-sm flex items-center gap-6">
           <div className="w-16 h-16 bg-velum-100 rounded-full flex items-center justify-center text-velum-500">
             <User size={32} />
           </div>
           <div>
             <h3 className="font-bold text-lg text-velum-900">{memberData.name}</h3>
             <p className="text-sm text-velum-500">{memberData.email}</p>
             <p className="text-xs text-velum-400 mt-1 uppercase tracking-widest">{memberData.plan}</p>
           </div>
        </div>

        {/* Subscription Status */}
        <div className="bg-velum-50 p-8 border border-velum-300 relative overflow-hidden">
           <div className={`absolute top-0 right-0 text-white text-[10px] uppercase font-bold px-3 py-1 ${memberData.subscriptionStatus === 'active' ? 'bg-green-700' : 'bg-red-600'}`}>
               {memberData.subscriptionStatus}
           </div>
           <h3 className="text-sm uppercase tracking-widest text-velum-500 mb-2">Suscripción Actual</h3>
           <h2 className="text-2xl font-serif text-velum-900 mb-4">{memberData.plan}</h2>
           
           <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center p-4 bg-white border border-velum-200">
             <div className="flex-grow">
               <p className="text-xs font-bold text-velum-900 uppercase tracking-wide mb-1">Gestión de Facturación</p>
               <p className="text-xs text-velum-500">Administrado por Stripe.</p>
             </div>
             <Button 
                variant="outline" 
                size="sm" 
                onClick={handlePortalAccess} 
                className="whitespace-nowrap"
             >
                <ExternalLink size={14} className="mr-2"/> Portal de Cliente
             </Button>
           </div>
        </div>
        
        {/* Document Status List (ReadOnly) */}
        <div className="p-6 bg-white border border-velum-200">
            <h3 className="font-serif text-lg mb-4">Mis Documentos Legales</h3>
            <div className="space-y-2">
                {documents.map((doc) => (
                    <div key={doc.id} className="flex justify-between items-center text-sm border-b border-velum-50 pb-2">
                        <div className="flex items-center gap-2">
                            <FileText size={16} className="text-velum-400"/>
                            <span className="text-velum-700">{doc.title}</span>
                        </div>
                        {doc.signed ? (
                            <span className="flex items-center gap-1 text-green-600 text-xs font-bold uppercase">
                                <CheckCircle size={12}/> Firmado {doc.signedAt}
                            </span>
                        ) : (
                            <span className="text-orange-500 text-xs font-bold uppercase">Pendiente</span>
                        )}
                    </div>
                ))}
            </div>
        </div>

      </div>

      {/* Signature Modal Overlay */}
      {showSignatureModal && currentDocToSign && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <SignaturePad 
                title={`Firmar: ${currentDocToSign.title}`} 
                onCancel={() => setShowSignatureModal(false)}
                onSave={handleSignatureSave}
              />
          </div>
      )}

    </div>
  );
};