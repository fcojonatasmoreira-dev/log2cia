import { despacharApi } from "../server/api/gateway.js";

export default async function handler(req, res) {
  return despacharApi(req, res);
}
