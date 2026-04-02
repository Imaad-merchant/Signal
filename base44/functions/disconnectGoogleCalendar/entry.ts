import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the current Google Calendar access token
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');

    // Revoke the token via Google's OAuth2 revocation endpoint
    const revokeRes = await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!revokeRes.ok) {
      const text = await revokeRes.text();
      return Response.json({ success: false, error: `Google revocation failed: ${text}` });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
