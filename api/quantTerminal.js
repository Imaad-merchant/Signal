export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Stub — return empty market data
  return res.status(200).json({
    data: [],
    message: "Market data not configured on this deployment"
  });
}
