const API = "/api/drso";
async function request(options = {}, mes) {
  const url = mes ? `${API}?mes=${encodeURIComponent(mes)}` : API;
  const response = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação DRSO.");
  return data;
}
export const listarDrso = (mes) => request({}, mes);
export const acaoDrso = (body) => request({ method: "POST", body: JSON.stringify(body) });
