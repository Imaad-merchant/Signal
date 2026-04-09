export default async function handler(req, res) {
  return res.status(200).json({ success: true, deleted: 0, message: "Google Calendar not connected on this deployment" });
}
