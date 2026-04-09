export default async function handler(req, res) {
  return res.status(200).json({ synced: 0, total: 0, message: "Google Calendar sync not available on this deployment" });
}
