import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { Eraser, Check } from 'lucide-react';

interface SignaturePadProps {
  onSave: (signatureDataUrl: string) => void;
  onCancel: () => void;
  title?: string;
  signerName?: string;
  documentId?: string;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  onSave,
  onCancel,
  title = 'Firma Digital',
  signerName,
  documentId,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);
  const signedAt = useRef(new Date().toISOString());

  // Initialize and re-initialize canvas on container resize (handles rotation + resize)
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = 200;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
    // Note: resizing clears the canvas — reset hasSignature
    setHasSignature(false);
  }, []);

  useEffect(() => {
    initCanvas();
    const observer = new ResizeObserver(initCanvas);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [initCanvas]);

  // Prevent page scroll while drawing on touch devices
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prevent = (e: TouchEvent) => {
      if (isDrawingRef.current) e.preventDefault();
    };
    canvas.addEventListener('touchmove', prevent, { passive: false });
    return () => canvas.removeEventListener('touchmove', prevent);
  }, []);

  const getPoint = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const src = 'touches' in e ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    isDrawingRef.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    const { x, y } = getPoint(e);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    const { x, y } = getPoint(e);
    ctx?.lineTo(x, y);
    ctx?.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
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
      onSave(canvasRef.current.toDataURL('image/png'));
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-velum-200 shadow-xl max-w-lg w-full mx-auto p-6 animate-fade-in">
      <h3 className="font-serif text-xl text-velum-900 mb-1">{title}</h3>
      <p className="text-xs text-velum-500 mb-5 leading-relaxed">
        Al firmar, acepto los términos y condiciones, el aviso de privacidad y el
        consentimiento informado para el procedimiento. Declaro que la información
        médica proporcionada es verídica y completa.
      </p>

      <div
        ref={containerRef}
        className="border-2 border-dashed border-velum-200 rounded-xl bg-velum-50 mb-4 select-none touch-none overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="block cursor-crosshair"
          aria-label="Área de firma digital"
          role="img"
        />
      </div>

      <div className="flex justify-between items-center">
        <button
          onClick={clear}
          className="text-xs text-velum-400 uppercase tracking-widest flex items-center gap-1.5 hover:text-velum-700 transition-colors"
        >
          <Eraser size={13} /> Borrar
        </button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
          <Button size="sm" onClick={save} disabled={!hasSignature}>
            <Check size={14} className="mr-1.5" /> Firmar
          </Button>
        </div>
      </div>

      {/* Audit metadata — real data only, no simulated values */}
      <p className="text-[10px] text-velum-300 mt-4 text-center tabular-nums">
        Firma digital segura
        {signerName && <> · {signerName}</>}
        {documentId && <> · Doc #{documentId.slice(-8).toUpperCase()}</>}
        {' '}· {signedAt.current.replace('T', ' ').slice(0, 19)} UTC
      </p>
    </div>
  );
};
