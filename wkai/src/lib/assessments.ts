import { useAppStore } from "../store";

export type AssessmentKind = "quiz" | "test";
export type AssessmentStatus = "draft" | "live" | "closed";
export type AssessmentSource = "manual" | "ai" | "kahoot";

export interface Assessment {
  id: string;
  sessionId: string;
  kind: AssessmentKind;
  title: string;
  status: AssessmentStatus;
  navigation: "linear" | "free";
  proctored: boolean;
  countsTowardScore: boolean;
  source: AssessmentSource;
  kahootUrl: string | null;
  timeLimitSeconds: number | null;
  createdAt: string;
  launchedAt: string | null;
  closedAt: string | null;
  questionCount: number;
}

export interface AssessmentQuestion {
  id?: string;
  position?: number;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string | null;
  points?: number;
  topic?: string | null;
}

export interface AttemptAnswer {
  questionId: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  selectedIndex: number | null;
  isCorrect: boolean | null;
  topic: string | null;
  points: number;
}

export interface AttemptResult {
  id: string;
  studentId: string;
  studentName: string;
  status: "in_progress" | "submitted" | "locked";
  score: number | null;
  maxScore: number | null;
  aiSummary: string | null;
  violationCount: number;
  startedAt: string;
  submittedAt: string | null;
  answers: AttemptAnswer[];
  events: { kind: string; detail: string | null; at: string }[];
}

export interface AssessmentResults {
  assessment: Assessment;
  questions: (AssessmentQuestion & { id: string })[];
  attempts: AttemptResult[];
  topics: { topic: string; correct: number; total: number }[];
}

function auth() {
  const { session, settings } = useAppStore.getState();
  return { base: settings.backendUrl, token: session?.instructorToken ?? "", sessionId: session?.id ?? "" };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { base, token } = auth();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    // The API answers with { error } for everything a user can cause, so
    // surface that rather than a status code nobody can act on.
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export function listAssessments() {
  const { sessionId } = auth();
  return request<{ assessments: Assessment[] }>(`/api/sessions/${sessionId}/assessments`);
}

export function createAssessment(body: {
  kind: AssessmentKind;
  title: string;
  navigation?: "linear" | "free";
  proctored?: boolean;
  countsTowardScore?: boolean;
  source?: AssessmentSource;
  kahootUrl?: string | null;
  timeLimitSeconds?: number | null;
  questions?: AssessmentQuestion[];
}) {
  const { sessionId } = auth();
  return request<{ assessment: Assessment }>(`/api/sessions/${sessionId}/assessments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function generateQuestions(body: {
  count: number;
  kind: AssessmentKind;
  difficulty: "easy" | "medium" | "hard";
  focus?: string;
}) {
  const { sessionId } = auth();
  return request<{ questions: AssessmentQuestion[] }>(
    `/api/sessions/${sessionId}/assessments/generate`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export function getAssessment(assessmentId: string) {
  return request<{ assessment: Assessment; questions: (AssessmentQuestion & { id: string })[] }>(
    `/api/assessments/${assessmentId}`
  );
}

export function updateAssessment(
  assessmentId: string,
  body: {
    title?: string;
    navigation?: "linear" | "free";
    proctored?: boolean;
    countsTowardScore?: boolean;
    timeLimitSeconds?: number | null;
    questions: AssessmentQuestion[];
  }
) {
  return request<{ assessment: Assessment }>(`/api/assessments/${assessmentId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function launchAssessment(assessmentId: string) {
  return request<{ assessment: Assessment }>(`/api/assessments/${assessmentId}/launch`, {
    method: "POST",
    body: "{}",
  });
}

export function closeAssessment(assessmentId: string) {
  return request<{ assessment: Assessment }>(`/api/assessments/${assessmentId}/close`, {
    method: "POST",
    body: "{}",
  });
}

export function deleteAssessment(assessmentId: string) {
  return request<{ ok: true }>(`/api/assessments/${assessmentId}`, { method: "DELETE" });
}

export function getResults(assessmentId: string) {
  return request<AssessmentResults>(`/api/assessments/${assessmentId}/results`);
}

export function evaluateAttempt(attemptId: string, refresh = false) {
  return request<{ summary: string; cached: boolean }>(`/api/attempts/${attemptId}/evaluate`, {
    method: "POST",
    body: JSON.stringify({ refresh }),
  });
}
