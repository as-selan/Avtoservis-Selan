/** Demo state may advance only with an unmistakable synthetic reference. */
export function demoEvidenceAllowed(reference: string): boolean {
  if (process.env.QUIBI_MODE === "dev" && process.env.QUIBI_DEV_WRITE_ENABLED === "1" &&
      process.env.SELAN_REMOTE_DEMO !== "1") return true;
  return (process.env.SELAN_REMOTE_DEMO !== "1" && process.env.SELAN_LOCAL_REVIEW !== "1") ||
    (typeof reference === "string" && /^QA-SIM-[A-Z0-9-]{4,190}$/i.test(reference.trim()));
}
