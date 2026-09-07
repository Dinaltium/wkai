import axios from "axios";
import { getBackendUrl } from "./api";
import { useStore } from "../store";

export interface LiveAssessment {
  id: string;
  sessionId: string;
  kind: "quiz" | "test";
  title: string;
  status: "draft" | "live" | "closed";
  navigation: "linear" | "free";
  proctored: boolean;
  countsTowardScore: boolean;
  source: "manual" | "ai" | "kahoot";
  kahootUrl: string | null;
  timeLimitSeconds: number | null;
  questionCount: number;
}

export interface StudentQuestion {
  id: string;
  position: number;
  prompt: string;
  options: string[];
  points: number;
  topic: string | null;
}

export interface AttemptStart {
  assessment: LiveAssessment;
  attempt: { id: string; status: string; startedAt: string };
  questions: StudentQuestion[];
  answers: { questionId: string; selectedIndex: number }[];
}

export interface ReviewRow {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  topic: string | null;
  selectedIndex: number | null;
  isCorrect: boolean | null;
}

export interface SubmitResult {
  score: number;
  maxScore: number;
  countsTowardScore: boolean;
  status: "submitted" | "locked";
  review: ReviewRow[] | null;
}

const client = axios.create({ baseURL: getBackendUrl() });

// The join token is the student's identity everywhere else, so it is the
// identity here too — the server derives studentId from it and refuses an
// attempt that does not belong to the caller.
function authHeaders() {
  const token = useStore.getState().joinToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchLiveAssessments(sessionId: string): Promise<LiveAssessment[]> {
  const { data } = await client.get<{ assessments: LiveAssessment[] }>(
    `/api/sessions/${sessionId}/assessments/live`,
    { headers: authHeaders() }
  );
  return data.assessments;
}

export async function startAttempt(assessmentId: string): Promise<AttemptStart> {
  const { data } = await client.post<AttemptStart>(
    `/api/assessments/${assessmentId}/attempts`,
    {},
    { headers: authHeaders() }
  );
  return data;
}

export async function saveAnswer(attemptId: string, questionId: string, selectedIndex: number) {
  const { data } = await client.post<{ ok: true; answered: number }>(
    `/api/attempts/${attemptId}/answer`,
    { questionId, selectedIndex },
    { headers: authHeaders() }
  );
  return data;
}

export async function submitAttempt(attemptId: string, locked = false): Promise<SubmitResult> {
  const { data } = await client.post<SubmitResult>(
    `/api/attempts/${attemptId}/submit`,
    { locked },
    { headers: authHeaders() }
  );
  return data;
}

export async function reportViolation(attemptId: string, kind: string, detail?: string) {
  await client.post(
    `/api/attempts/${attemptId}/events`,
    { kind, detail },
    { headers: authHeaders() }
  );
}
