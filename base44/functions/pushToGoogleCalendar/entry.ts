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

    // Fetch existing synced task IDs from Google Calendar
    const existingIds = new Set();
    let pageToken = '';
    do {
      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
      url.searchParams.set('maxResults', '2500');
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('privateExtendedProperty', 'pulseApp=true');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const listRes = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
      if (listRes.ok) {
        const data = await listRes.json();
        (data.items || []).forEach(e => {
          const id = e.extendedProperties?.private?.pulseTaskId;
          if (id) existingIds.add(id);
        });
        pageToken = data.nextPageToken || '';
      } else {
        pageToken = '';
      }
    } while (pageToken);

    // Only sync tasks not already in Google Calendar
    const newTasks = tasksWithDates.filter(t => !existingIds.has(t.id));

    const results = await Promise.all(newTasks.map(async (task) => {
      const startDate = task.due_date;
      const event = {
        summary: task.title,
        description: task.description || '',
        start: task.estimated_minutes
          ? { dateTime: `${startDate}T09:00:00`, timeZone: 'America/New_York' }
          : { date: startDate },
        end: task.estimated_minutes
          ? {
              dateTime: new Date(new Date(`${startDate}T09:00:00`).getTime() + task.estimated_minutes * 60000).toISOString().replace('Z', ''),
              timeZone: 'America/New_York'
            }
          : { date: startDate },
        extendedProperties: { private: { pulseTaskId: task.id, pulseApp: 'true' } }
      };

      const res = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(event)
        }
      );
      return res.ok ? 'ok' : 'fail';
    }));

    const synced = results.filter(r => r === 'ok').length;
    const failed = results.filter(r => r === 'fail').length;

    return Response.json({
      success: true,
      synced,
      failed,
      total: newTasks.length,
      skipped: tasksWithDates.length - newTasks.length
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});