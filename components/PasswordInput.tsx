import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  className?: string;
  showStrength?: boolean;
}

type StrengthLevel = {
  score: number;
  label: string;
  barColor: string;
  textColor: string;
};

const getStrength = (value: string): StrengthLevel => {
  if (!value) return { score: 0, label: "", barColor: "", textColor: "" };
  let score = 0;
  if (value.length >= 12) score++;
  if (/[A-Z]/.test(value)) score++;
  if (/[a-z]/.test(value)) score++;
  if (/[0-9]/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;

  // Mapear score → tokens semánticos del design system (intent.*)
  if (score <= 2) return { score, label: "Débil",   barColor: "bg-danger-500",  textColor: "text-danger-700"  };
  if (score === 3) return { score, label: "Regular", barColor: "bg-warning-500", textColor: "text-warning-700" };
  if (score === 4) return { score, label: "Buena",   barColor: "bg-success-500", textColor: "text-success-700" };
  return            { score, label: "Fuerte",  barColor: "bg-success-700", textColor: "text-success-700" };
};

export const PasswordInput: React.FC<PasswordInputProps> = ({ className = "", showStrength = false, ...props }) => {
  const [show, setShow] = useState(false);
  const value = typeof props.value === "string" ? props.value : "";
  const strength = showStrength && value ? getStrength(value) : null;

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          {...props}
          type={show ? "text" : "password"}
          className={`${className} pr-11`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-velum-400 hover:text-velum-900 transition-colors duration-base ease-standard focus:outline-none focus-visible:shadow-focus rounded-r-md"
          tabIndex={-1}
          aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {strength && (
        <div className="space-y-1.5" aria-live="polite">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors duration-slow ease-standard ${
                  i <= strength.score ? strength.barColor : "bg-velum-200"
                }`}
              />
            ))}
          </div>
          <p className={`text-[11px] font-bold uppercase tracking-widest ${strength.textColor}`}>
            {strength.label}
          </p>
        </div>
      )}
    </div>
  );
};
