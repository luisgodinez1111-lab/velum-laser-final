import { FormEvent, useMemo, useState } from "react";
import { apiFetch } from "../services/apiClient";

export type PhototypeCode = "I" | "II" | "III" | "IV" | "V" | "VI";

export type PhototypeOption = {
  id: string;
  label: string;
  score: number;
};

export type PhototypeQuestion = {
  id: string;
  title: string;
  options: PhototypeOption[];
};

export type PhototypeAnswer = {
  questionId: string;
  optionId: string;
  score: number;
};

export type PhototypePayload = {
  patientId: string;
  answers: PhototypeAnswer[];
  totalScore: number;
  phototype: PhototypeCode;
};

export type PhototypeResult = {
  phototype: PhototypeCode;
  description: string;
  rangeLabel: string;
};

type PhototypeRange = {
  min: number;
  max: number | null;
  phototype: PhototypeCode;
  description: string;
  rangeLabel: string;
};

const PHOTOTYPE_RANGES: PhototypeRange[] = [
  {
    min: 0,
    max: 7,
    phototype: "I",
    description: "Muy sensible a la luz solar",
    rangeLabel: "0-7"
  },
  {
    min: 8,
    max: 21,
    phototype: "II",
    description: "Sensible a la luz solar",
    rangeLabel: "8-21"
  },
  {
    min: 22,
    max: 42,
    phototype: "III",
    description: "Sensibilidad normal a la luz solar",
    rangeLabel: "22-42"
  },
  {
    min: 43,
    max: 68,
    phototype: "IV",
    description: "La piel tiene tolerancia a la luz",
    rangeLabel: "43-68"
  },
  {
    min: 69,
    max: 84,
    phototype: "V",
    description: "Piel oscura con tolerancia alta",
    rangeLabel: "69-84"
  },
  {
    min: 85,
    max: null,
    phototype: "VI",
    description: "La piel es muy oscura o negra, mayor tolerancia a la luz",
    rangeLabel: "85+"
  }
];

export const DEFAULT_PHOTOTYPE_QUESTIONS: PhototypeQuestion[] = [
  {
    id: "q1_skin_color",
    title: "1) Cual es el color natural de su piel cuando no esta bronceada?",
    options: [
      { id: "q1_o1", label: "Rojiza, blanca", score: 0 },
      { id: "q1_o2", label: "Blanca-beige", score: 2 },
      { id: "q1_o3", label: "Marron clara", score: 4 },
      { id: "q1_o4", label: "Marron", score: 8 },
      { id: "q1_o5", label: "Oscura", score: 12 }
    ]
  },
  {
    id: "q2_hair_color",
    title: "2) Cual es el color natural de tu pelo?",
    options: [
      { id: "q2_o1", label: "Pelirojo o rubio claro", score: 0 },
      { id: "q2_o2", label: "Rubio castano claro", score: 2 },
      { id: "q2_o3", label: "Castano", score: 4 },
      { id: "q2_o4", label: "Castano oscuro", score: 8 },
      { id: "q2_o5", label: "Castano oscuro-negro", score: 12 },
      { id: "q2_o6", label: "Negro", score: 16 }
    ]
  },
  {
    id: "q3_eye_color",
    title: "3) Cual es el color de ojos?",
    options: [
      { id: "q3_o1", label: "Azul claro, verde claro, gris claro", score: 0 },
      { id: "q3_o2", label: "Azul, verdes o grises", score: 2 },
      { id: "q3_o3", label: "Marron claro", score: 4 },
      { id: "q3_o4", label: "Marron", score: 8 },
      { id: "q3_o5", label: "Marron oscuro", score: 12 },
      { id: "q3_o6", label: "Negro", score: 16 }
    ]
  },
  {
    id: "q4_freckles",
    title: "4) Cuantas pecas de manera natural presentas cuando no estas bronceada?",
    options: [
      { id: "q4_o1", label: "Muchas", score: 0 },
      { id: "q4_o2", label: "Algunas", score: 4 },
      { id: "q4_o3", label: "Unas cuantas", score: 6 },
      { id: "q4_o4", label: "Ninguna", score: 8 }
    ]
  },
  {
    id: "q5_burn",
    title: "5) Que categoria describe mejor su potencial de quemaduras despues de exponerse al sol?",
    options: [
      { id: "q5_o1", label: "Solo se quema, no se broncea", score: 0 },
      { id: "q5_o2", label: "Habitualmente se quema y se broncea ligeramente", score: 2 },
      { id: "q5_o3", label: "Se quema ocasionalmente y se broncea moderadamente", score: 4 },
      { id: "q5_o4", label: "Nunca se quema y se broncea con facilidad", score: 8 },
      { id: "q5_o5", label: "Raramente se quema y se broncea profundamente", score: 10 },
      { id: "q5_o6", label: "Nunca se quema", score: 12 }
    ]
  },
  {
    id: "q6_tan",
    title: "6) Que categoria describe mejor su potencial de bronceado?",
    options: [
      { id: "q6_o1", label: "Nunca", score: 0 },
      { id: "q6_o2", label: "Ligeramente", score: 2 },
      { id: "q6_o3", label: "Moderadamente", score: 4 },
      { id: "q6_o4", label: "Profundamente", score: 8 }
    ]
  },
  {
    id: "q7_skin_desc",
    title: "7) Cual describe mejor tu piel?",
    options: [
      { id: "q7_o1", label: "Piel muy blanca", score: 0 },
      { id: "q7_o2", label: "Piel clara", score: 2 },
      { id: "q7_o3", label: "Piel morena clara", score: 4 },
      { id: "q7_o4", label: "Piel morena", score: 8 },
      { id: "q7_o5", label: "Afroamericano", score: 12 }
    ]
  }
];

export function getFototipo(total: number): PhototypeResult {
  const range = PHOTOTYPE_RANGES.find((item) => {
    if (item.max === null) {
      return total >= item.min;
    }
    return total >= item.min && total <= item.max;
  });

  if (!range) {
    throw new Error(`Total fuera de rango: ${total}`);
  }

  return {
    phototype: range.phototype,
    description: range.description,
    rangeLabel: range.rangeLabel
  };
}

export function buildPhototypePayload(
  patientId: string,
  questions: PhototypeQuestion[],
  selectedByQuestionId: Record<string, string>
): PhototypePayload {
  const missingQuestionIds = questions
    .filter((question) => !selectedByQuestionId[question.id])
    .map((question) => question.id);

  if (missingQuestionIds.length > 0) {
    throw new Error(`Preguntas sin responder: ${missingQuestionIds.join(", ")}`);
  }

  const answers: PhototypeAnswer[] = questions.map((question) => {
    const optionId = selectedByQuestionId[question.id];
    const selectedOption = question.options.find((option) => option.id === optionId);

    if (!selectedOption) {
      throw new Error(`Opcion invalida en ${question.id}: ${optionId}`);
    }

    return {
      questionId: question.id,
      optionId: selectedOption.id,
      score: selectedOption.score
    };
  });

  const totalScore = answers.reduce((sum, answer) => sum + answer.score, 0);
  const phototype = getFototipo(totalScore).phototype;

  return {
    patientId,
    answers,
    totalScore,
    phototype
  };
}

type PhototypeQuestionnaireProps = {
  patientId: string;
  questions?: PhototypeQuestion[];
  saveUrl?: string;
  onSaved?: (payload: PhototypePayload) => void;
};

export default function PhototypeQuestionnaire({
  patientId,
  questions = DEFAULT_PHOTOTYPE_QUESTIONS,
  saveUrl = "/api/members/onboarding/p2",
  onSaved
}: PhototypeQuestionnaireProps) {
  const [selectedByQuestionId, setSelectedByQuestionId] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<{
    totalScore: number;
    phototype: PhototypeCode;
    description: string;
    rangeLabel: string;
  } | null>(null);

  const answeredCount = useMemo(() => {
    return questions.filter((question) => selectedByQuestionId[question.id]).length;
  }, [questions, selectedByQuestionId]);

  const handleSelect = (questionId: string, optionId: string) => {
    setSelectedByQuestionId((prev) => ({ ...prev, [questionId]: optionId }));
    setErrorMessage("");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage("");

    try {
      const payload = buildPhototypePayload(patientId, questions, selectedByQuestionId);
      const phototypeResult = getFototipo(payload.totalScore);

      // saveUrl may be a full path like "/api/members/onboarding/p2" — strip the base prefix
      await apiFetch(saveUrl.replace(/^\/api/, ""), {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setResult({
        totalScore: payload.totalScore,
        phototype: phototypeResult.phototype,
        description: phototypeResult.description,
        rangeLabel: phototypeResult.rangeLabel
      });

      onSaved?.(payload);
    } catch (error) {
      setErrorMessage((error as Error).message || "Error al procesar cuestionario.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="w-full max-w-4xl mx-auto bg-white border border-velum-200 shadow-sm p-6 sm:p-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-widest text-velum-500">Fototipo Fitzpatrick</p>
        <h2 className="font-serif text-3xl italic text-velum-900">Cuestionario de identificacion de fototipo</h2>
        <p className="text-sm text-velum-600 mt-2">
          Cada opcion muestra su puntaje entre parentesis. Debes responder todo para calcular resultado.
        </p>
        <p className="text-xs text-velum-500 mt-2">
          Respondidas: {answeredCount}/{questions.length}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        {questions.map((question) => (
          <fieldset key={question.id} className="border border-velum-200 p-4">
            <legend className="px-2 text-sm font-semibold text-velum-800">{question.title}</legend>
            <div className="space-y-2 mt-2">
              {question.options.map((option) => {
                const checked = selectedByQuestionId[question.id] === option.id;
                return (
                  <label
                    key={option.id}
                    className={`flex items-start gap-2 p-2 border cursor-pointer ${
                      checked ? "border-velum-900 bg-velum-50" : "border-velum-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name={question.id}
                      value={option.id}
                      checked={checked}
                      onChange={() => handleSelect(question.id, option.id)}
                      className="mt-1"
                    />
                    <span className="text-sm text-velum-800">
                      {option.label} ({option.score})
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center justify-center bg-velum-900 text-velum-50 px-6 py-3 text-xs uppercase tracking-widest disabled:opacity-60"
        >
          {isSaving ? "Guardando..." : "Calcular y Guardar"}
        </button>
      </form>

      {result && (
        <div className="mt-8 border border-velum-200 bg-velum-50 p-4">
          <h3 className="font-serif text-xl text-velum-900 mb-2">Resultado</h3>
          <p className="text-sm text-velum-800">
            <strong>Total:</strong> {result.totalScore}
          </p>
          <p className="text-sm text-velum-800">
            <strong>Fototipo:</strong> {result.phototype} (Rango {result.rangeLabel})
          </p>
          <p className="text-sm text-velum-800">
            <strong>Descripcion:</strong> {result.description}
          </p>
        </div>
      )}
    </section>
  );
}
