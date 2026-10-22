const values = new Set(["compact", "normal", "comfortable", "wide"]);

// New servers include the immutable job snapshot in claim. Keep the old endpoint
// as a fallback so the agent can be updated before the web application.
export async function resolveJobLineSpacing(job, post) {
  if (values.has(job.lineSpacing)) return job.lineSpacing;
  try {
    const data = await post("/api/print-agent/job-style", { jobId: job.id });
    return values.has(data?.lineSpacing) ? data.lineSpacing : "normal";
  } catch (error) {
    console.error("job line spacing lookup failed; using normal spacing", job.id, error);
    return "normal";
  }
}
