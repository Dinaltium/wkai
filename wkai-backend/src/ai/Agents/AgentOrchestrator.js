import { Agents } from "./AgentRegistry.js";

export async function runVoiceQuizWorkflow({
  sessionId,
  transcript,
  mimeType = "audio/wav",
  audioB64 = null,
}) {
  const steps = [];
  const output = {
    transcriptText: transcript ?? "",
    expandedExplanation: null,
    quiz: null,
  };

  if (audioB64) {
    const tr = await Agents.VoiceAgent.invoke({ action: "transcribe", audioB64, mimeType });
    if (typeof tr === "string") output.transcriptText = tr;
    steps.push({ step: "voice.transcribe", status: "ok" });
  }

  if (output.transcriptText) {
    output.expandedExplanation = await Agents.VoiceAgent.invoke({
      action: "expand",
      sessionId,
      transcript: output.transcriptText,
    });
    steps.push({ step: "voice.expand", status: "ok" });
  }

  if (output.transcriptText) {
    output.quiz = await Agents.QuizAgent.invoke({
      sessionId,
      transcript: output.transcriptText,
    });
    steps.push({ step: "quiz.generate", status: "ok" });
  }

  return { steps, output };
}

