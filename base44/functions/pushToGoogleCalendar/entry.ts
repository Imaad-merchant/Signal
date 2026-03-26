import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');

    // Get all tasks with due dates
    const tasks = await base44.entities.Task.filter({ created_by: user.email });
    const tasksWithDates = tasks.filter(t => t.due_date);

    const created = [];
    const failed = [];

    for (const task of tasksWithDates) {
      // Build event payload
      const startDate = task.due_date; // YYYY-MM-DD
      const event = {
        summary: task.title,
        description: task.description || '',
        start: task.estimated_minutes
          ? { dateTime: `${startDate}T09:00:00`, timeZone: 'America/Chicago' }
          : { date: startDate },
        end: task.estimated_minutes
          ? { 
              dateTime: new Date(new Date(`${startDate}T09:00:00`).getTime() + task.estimated_minutes * 60000).toISOString().replace('Z', ''),
              timeZone: 'America/Chicago'
            }
          : { date: startDate },
        extendedProperties: {
          private: { pulseTaskId: task.id }
        }
      };

      // Check if event already exists in Google Calendar with this task ID
      const searchParams = new URLSearchParams({
        privateExtendedProperty: `pulseTaskId=${task.id}`,
        singleEvents: 'true',
        maxResults: '1'
      });

      const searchRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${searchParams}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const searchData = await searchRes.json();

      if (searchData.items && searchData.items.length > 0) {
        // Update existing event
        const existingId = searchData.items[0].id;
        const updateRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingId}`,
          {
            method: 'PUT',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(event)
          }
        );
        if (updateRes.ok) created.push(task.id);
        else failed.push(task.title);
      } else {
        // Create new event
        const createRes = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(event)
          }
        );
        if (createRes.ok) created.push(task.id);
        else failed.push(task.title);
      }
    }

    return Response.json({
      success: true,
      synced: created.length,
      failed: failed.length,
      total: tasksWithDates.length
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});