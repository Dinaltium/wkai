import { transcribeAudio } from "../whisper.js";
import { expandTranscriptForStudents } from "../graphs/transcriptExplainerAgent.js";
import { createBaseAgent } from "./BaseAgent.js";

export async function transcribeInstructorAudio(audioB64, mimeType = "audio/wav") {
  return VoiceAgent.invoke({ action: "transcribe", audioB64, mimeType });
}

export async function expandInstructorTranscript(sessionId, transcript) {
  return VoiceAgent.invoke({ action: "expand", sessionId, transcript });
}

export const VoiceAgent = createBaseAgent({
  name: "VoiceAgent",
  version: "1.0.0",
  tags: ["voice", "whisper", "langgraph"],
  async invoke(input) {
    if (input?.action === "transcribe") {
      return transcribeAudio(input.audioB64, input.mimeType ?? "audio/wav");
    }
    if (input?.action === "expand") {
      return expandTranscriptForStudents(input.sessionId, input.transcript);
    }
    throw new Error("VoiceAgent action is required: transcribe | expand");
  },
  async healthCheck() {
    return { status: "healthy", enabled: true, name: "VoiceAgent", version: "1.0.0" };
  },
});

