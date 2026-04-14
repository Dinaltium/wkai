export function getLangSmithConfig(runName, tags = []) {
  return {
    runName,
    tags: ["wkai", "phase2", ...tags],
    metadata: {
      service: "wkai-backend",
      feature: runName,
    },
  };
}

