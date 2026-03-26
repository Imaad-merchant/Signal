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

    // Push all tasks to Google Calendar in parallel
    const results = await Promise.all(tasksWithDates.map(async (task) => {
      const startDate = task.due_date;
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
        extendedProperties: { private: { pulseTaskId: task.id } }
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
      total: tasksWithDates.length
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});