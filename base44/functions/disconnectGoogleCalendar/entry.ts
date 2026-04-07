import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');

    // Fetch all events and filter by pulseTaskId extended property (client-side)
    let deleted = 0;
    let pageToken = '';

    do {
      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
      url.searchParams.set('maxResults', '2500');
      url.searchParams.set('singleEvents', 'true');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const listRes = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!listRes.ok) {
        const text = await listRes.text();
        return Response.json({ error: `Failed to list events: ${text}` }, { status: 500 });
      }

      const data = await listRes.json();
      const events = (data.items || []).filter(e =>
        e.extendedProperties?.private?.pulseTaskId || e.extendedProperties?.private?.pulseApp
      );

      // Delete all found events in parallel
      const results = await Promise.all(events.map(async (event) => {
        const delRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.id}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        return delRes.ok || delRes.status === 404;
      }));

      deleted += results.filter(Boolean).length;
      pageToken = data.nextPageToken || '';
    } while (pageToken);

    return Response.json({ success: true, deleted });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});