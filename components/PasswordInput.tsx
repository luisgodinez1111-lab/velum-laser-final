import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  className?: string;
  showStrength?: boolean;
}

const getStrength = (value: string): { score: number; label: string; color: string } => {
  if (!value) return { score: 0, label: "", color: "" };
  let score = 0;
  if (value.length >= 12) score++;
  if (/[A-Z]/.test(value)) score++;
  if (/[a-z]/.test(value)) score++;
  if (/[0-9]/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  if (score <= 2) return { score, label: "Débil", color: "bg-red-400" };
  if (score === 3) return { score, label: "Regular", color: "bg-amber-400" };
  if (score === 4) return { score, label: "Buena", color: "bg-emerald-400" };
  return { score, label: "Fuerte", color: "bg-emerald-600" };
};

export const PasswordInput: React.FC<PasswordInputProps> = ({ className = "", showStrength = false, ...props }) => {
  const [show, setShow] = useState(false);
  const value = typeof props.value === "string" ? props.value : "";
  const strength = showStrength && value ? getStrength(value) : null;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <input
          {...props}
          type={show ? "text" : "password"}
          className={`${className} pr-11`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-velum-400 hover:text-velum-700 transition-colors"
          tabIndex={-1}
          aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {strength && (
        <div className="space-y-1">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= strength.score ? strength.color : "bg-velum-200"
                }`}
              />
            ))}
          </div>
          <p className={`text-xs font-medium ${
            strength.score <= 2 ? "text-red-500" :
            strength.score === 3 ? "text-amber-500" :
            "text-emerald-600"
          }`}>{strength.label}</p>
        </div>
      )}
    </div>
  );
};
