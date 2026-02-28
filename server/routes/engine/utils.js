export const normalize = v =>
  (v || "").toString().replace(/[^0-9A-Za-z]/g, "").trim();

export function parseDDMMYYYY(str) {
  if (!str) return null;
  const [dd, mm, yyyy] = str.split("/");
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  return isNaN(d) ? null : d;
}

export const nowISO = () => new Date().toISOString();

export function computeScore(alerts, glSuggestions) {
  let score = 1.0;

  alerts.forEach(a => {
    if (a.severity === "blocker") score -= 0.4;
    if (a.severity === "warn")    score -= 0.15;
  });

  const conf = glSuggestions[0]?.confidence || 0;
  score = Math.max(0, score + conf * 0.2);
  return Math.round(score * 100) / 100;
}