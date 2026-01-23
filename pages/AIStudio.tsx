import React, { useState, useEffect } from 'react';
import { Button } from '../components/Button';
import { generateVelumVideo, generateVelumImage } from '../services/geminiService';
import { Resolution } from '../types';
import { Video, Image as ImageIcon, Loader2 } from 'lucide-react';

export const AIStudio: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'video' | 'image'>('image');
  const [apiKeyReady, setApiKeyReady] = useState(false);
  
  // Video State
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [isVideoLoading, setIsVideoLoading] = useState(false);

  // Image State
  const [imagePrompt, setImagePrompt] = useState('');
  const [resolution, setResolution] = useState<Resolution>(Resolution.ONE_K);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    if (window.aistudio && window.aistudio.hasSelectedApiKey) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setApiKeyReady(hasKey);
    } else {
      // Fallback for dev environments without the AI Studio wrapper
      setApiKeyReady(true);
    }
  };

  const handleSelectKey = async () => {
    if (window.aistudio && window.aistudio.openSelectKey) {
      await window.aistudio.openSelectKey();
      // Assume success after opening dialog to avoid race condition with hasSelectedApiKey
      setApiKeyReady(true);
    }
  };

  const handleVideoGenerate = async () => {
    if (!apiKeyReady) return;
    setIsVideoLoading(true);
    setError(null);
    try {
      const url = await generateVelumVideo(videoPrompt, videoFile);
      setGeneratedVideoUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error generando video");
    } finally {
      setIsVideoLoading(false);
    }
  };

  const handleImageGenerate = async () => {
    if (!apiKeyReady) return;
    setIsImageLoading(true);
    setError(null);
    try {
      const url = await generateVelumImage(imagePrompt, resolution);
      setGeneratedImageUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error generando imagen");
    } finally {
      setIsImageLoading(false);
    }
  };

  if (!apiKeyReady) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
        <h2 className="text-2xl font-serif text-velum-900 mb-4">Acceso a Velum AI</h2>
        <p className="text-velum-600 mb-8 max-w-md">
          Para utilizar nuestras herramientas avanzadas de visualización y análisis de movimiento, 
          se requiere una llave de acceso segura.
        </p>
        <Button onClick={handleSelectKey}>Conectar API Key</Button>
        <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="mt-4 text-xs text-velum-400 hover:text-velum-900 underline">
          Información sobre facturación
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <span className="text-xs font-bold uppercase tracking-widest text-velum-500">Tecnología Avanzada</span>
        <h1 className="text-4xl font-serif text-velum-900 italic mt-2">Velum AI Studio</h1>
      </div>

      {/* Tabs */}
      <div className="flex justify-center mb-10 border-b border-velum-200">
        <button
          onClick={() => setActiveTab('image')}
          className={`px-8 py-4 text-sm uppercase tracking-widest transition-colors flex items-center gap-2 ${
            activeTab === 'image' 
              ? 'border-b-2 border-velum-900 text-velum-900 font-bold' 
              : 'text-velum-400 hover:text-velum-600'
          }`}
        >
          <ImageIcon size={18} />
          Visualización Estética
        </button>
        <button
          onClick={() => setActiveTab('video')}
          className={`px-8 py-4 text-sm uppercase tracking-widest transition-colors flex items-center gap-2 ${
            activeTab === 'video' 
              ? 'border-b-2 border-velum-900 text-velum-900 font-bold' 
              : 'text-velum-400 hover:text-velum-600'
          }`}
        >
          <Video size={18} />
          Análisis de Movimiento
        </button>
      </div>

      <div className="bg-white border border-velum-200 p-8 shadow-sm min-h-[400px]">
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-800 text-sm border border-red-100 rounded">
            {error}
          </div>
        )}

        {/* Image Generation Tab */}
        {activeTab === 'image' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="space-y-6">
              <div>
                <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Prompt de Visualización</label>
                <textarea 
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="Describe la piel ideal, texturas suaves, iluminación zen..."
                  className="w-full p-4 border border-velum-300 bg-velum-50 focus:border-velum-900 focus:outline-none min-h-[120px] text-sm"
                />
              </div>

              <div>
                 <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Resolución</label>
                 <div className="flex gap-4">
                    {[Resolution.ONE_K, Resolution.TWO_K, Resolution.FOUR_K].map((res) => (
                      <button
                        key={res}
                        onClick={() => setResolution(res)}
                        className={`px-4 py-2 border text-xs font-bold ${
                          resolution === res 
                            ? 'bg-velum-900 text-velum-50 border-velum-900' 
                            : 'bg-transparent text-velum-900 border-velum-300 hover:border-velum-600'
                        }`}
                      >
                        {res}
                      </button>
                    ))}
                 </div>
              </div>

              <Button 
                onClick={handleImageGenerate} 
                isLoading={isImageLoading} 
                disabled={!imagePrompt.trim()}
                className="w-full"
              >
                Generar Visualización
              </Button>
            </div>

            <div className="flex items-center justify-center bg-velum-50 border border-velum-100 min-h-[300px]">
              {isImageLoading ? (
                <Loader2 className="animate-spin text-velum-300" size={40} />
              ) : generatedImageUrl ? (
                <img src={generatedImageUrl} alt="Generated result" className="max-h-[400px] w-auto shadow-lg" />
              ) : (
                <div className="text-center text-velum-300">
                  <ImageIcon size={48} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">La visualización aparecerá aquí</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Video Generation Tab */}
        {activeTab === 'video' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="space-y-6">
              <div>
                <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Imagen de Referencia (Opcional)</label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-velum-600 file:mr-4 file:py-2 file:px-4 file:border-0 file:text-xs file:font-semibold file:bg-velum-200 file:text-velum-900 hover:file:bg-velum-300"
                />
                <p className="text-[10px] text-velum-400 mt-1">Sube una foto para animarla con Veo.</p>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Instrucción de Movimiento</label>
                <textarea 
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                  placeholder="Ej: Movimiento suave de cámara, iluminación cinematográfica cambiando..."
                  className="w-full p-4 border border-velum-300 bg-velum-50 focus:border-velum-900 focus:outline-none min-h-[120px] text-sm"
                />
              </div>

              <Button 
                onClick={handleVideoGenerate} 
                isLoading={isVideoLoading} 
                disabled={!videoPrompt.trim() && !videoFile}
                className="w-full"
              >
                Generar Video (Veo)
              </Button>
            </div>

            <div className="flex items-center justify-center bg-velum-50 border border-velum-100 min-h-[300px]">
               {isVideoLoading ? (
                <div className="text-center">
                  <Loader2 className="animate-spin text-velum-300 mx-auto mb-4" size={40} />
                  <p className="text-xs text-velum-500 animate-pulse">Generando video... esto puede tomar unos minutos.</p>
                </div>
              ) : generatedVideoUrl ? (
                <video controls autoPlay loop className="max-h-[400px] w-full shadow-lg">
                  <source src={generatedVideoUrl} type="video/mp4" />
                  Tu navegador no soporta video.
                </video>
              ) : (
                <div className="text-center text-velum-300">
                  <Video size={48} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">El video generado aparecerá aquí</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};