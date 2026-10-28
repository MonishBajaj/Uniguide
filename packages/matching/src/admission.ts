/**
 * Serving side of the worker's admission model (worker/src/uniguide_worker/research/admission.py).
 * The model is only readable once it has passed its holdout and calibration gate; courses with too
 * few past outcomes are absent from its parameters and get no estimate.
 */

export interface AdmissionModelParams {
  intercept: number;
  slopes: { grade: number; grade_missing: number };
  scales: Record<string, { mean: number; sd: number; direction: number }>;
  country: Record<string, number>;
  program: Record<string, { offset: number; n: number; country: string }>;
}

export interface AdmissionEstimate {
  probability: number;
  /** Past outcomes for this course the model learned from. */
  n: number;
}

export function admissionEstimate(
  params: AdmissionModelParams,
  minProgramN: number,
  program: { id: string; country: string },
  student: { gradeValue?: number | null; gradeScale?: string | null },
): AdmissionEstimate | null {
  const course = params.program[program.id];
  if (!course || course.n < minProgramN) return null;
  // Standardised against the same scale only; an unseen scale counts as a missing grade.
  const scale = student.gradeScale ? params.scales[student.gradeScale] : undefined;
  const known = scale != null && student.gradeValue != null;
  const grade = known ? (scale.direction * (student.gradeValue! - scale.mean)) / scale.sd : 0;
  const z =
    params.intercept +
    params.slopes.grade * grade +
    params.slopes.grade_missing * (known ? 0 : 1) +
    (params.country[program.country] ?? 0) +
    course.offset;
  return { probability: 1 / (1 + Math.exp(-z)), n: course.n };
}
