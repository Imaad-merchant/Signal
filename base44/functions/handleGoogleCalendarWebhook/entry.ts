import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    // Get the changed event data from the webhook payload
    const changedEvents = payload?.data?.items || [];

    if (!changedEvents.length) {
      return Response.json({ ok: true, message: 'No events to process' });
    }

    // Get Google Calendar access token to fetch full event details
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');

    let updated = 0;
    let skipped = 0;

    await Promise.all(changedEvents.map(async (item) => {
      const eventId = item.id;
      if (!eventId) return;

      // Fetch full event details
      const eventRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!eventRes.ok) { skipped++; return; }
      const event = await eventRes.json();

      // Only process events we created (have pulseTaskId)
      const taskId = event.extendedProperties?.private?.pulseTaskId;
      if (!taskId) { skipped++; return; }

      // If event was deleted/cancelled, mark task as done or skip
      if (event.status === 'cancelled') { skipped++; return; }

      // Extract updated fields
      const updates = {};

      if (event.summary) updates.title = event.summary;
      if (event.description !== undefined) updates.description = event.description;

      // Extract date
      const dateStr = event.start?.date || event.start?.dateTime?.slice(0, 10);
      if (dateStr) updates.due_date = dateStr;

      // Extract duration if timed event
      if (event.start?.dateTime && event.end?.dateTime) {
        const start = new Date(event.start.dateTime);
        const end = new Date(event.end.dateTime);
        const mins = Math.round((end - start) / 60000);
        if (mins > 0) updates.estimated_minutes = mins;
      }

      if (Object.keys(updates).length > 0) {
        await base44.asServiceRole.entities.Task.update(taskId, updates);
        updated++;
      }
    }));

    return Response.json({ ok: true, updated, skipped });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});