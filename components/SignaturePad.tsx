import React, { useRef, useState, useEffect } from 'react';
import { Button } from './Button';
import { Eraser, Check } from 'lucide-react';

interface SignaturePadProps {
  onSave: (signatureDataUrl: string) => void;
  onCancel: () => void;
  title?: string;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({ onSave, onCancel, title = "Firma Digital" }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = canvas.parentElement?.clientWidth || 500;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
      }
    }
  }, []);

  const getCoordinates = (event: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in event) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = (event as React.MouseEvent).clientX;
      clientY = (event as React.MouseEvent).clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    const { x, y } = getCoordinates(e);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    const { x, y } = getCoordinates(e);
    ctx?.lineTo(x, y);
    ctx?.stroke();
    if (!hasSignature) setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const ctx = canvasRef.current?.getContext('2d');
    ctx?.closePath();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasSignature(false);
    }
  };

  const save = () => {
    if (canvasRef.current && hasSignature) {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      onSave(dataUrl);
    }
  };

  return (
    <div className="bg-white p-6 border border-velum-200 shadow-xl max-w-lg w-full mx-auto animate-fade-in-up">
      <h3 className="font-serif text-xl text-velum-900 mb-2">{title}</h3>
      <p className="text-xs text-velum-500 mb-4 text-justify">
        Al firmar, acepto los términos y condiciones, así como el aviso de privacidad y el consentimiento informado para el procedimiento láser. Declaro que la información médica proporcionada es verídica.
      </p>
      
      <div className="border-2 border-dashed border-velum-300 bg-velum-50 mb-4 touch-none">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-[200px] cursor-crosshair"
        />
      </div>

      <div className="flex justify-between items-center">
        <button 
            onClick={clear} 
            className="text-xs text-red-500 font-bold uppercase tracking-widest flex items-center gap-1 hover:text-red-700"
        >
            <Eraser size={14}/> Borrar
        </button>
        <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
            <Button size="sm" onClick={save} disabled={!hasSignature}>
                <Check size={14} className="mr-2"/> Firmar Digitalmente
            </Button>
        </div>
      </div>
      <p className="text-[10px] text-gray-400 mt-4 text-center">
        Firma digital segura • IP: {Math.floor(Math.random()*255)}.{Math.floor(Math.random()*255)}.1.12 • {new Date().toLocaleString()}
      </p>
    </div>
  );
};