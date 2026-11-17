export async function getDashboardMetrics() {
  const response = await fetch("/api/dashboard", { credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Não foi possível carregar o painel.");
  return body.metrics;
}
