import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');

    // Fetch events from Google Calendar (next 30 days)
    const now = new Date();
    const future = new Date();
    future.setDate(now.getDate() + 30);

    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '100'
    });

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return Response.json({ error: `Google Calendar API error: ${error}` }, { status: response.status });
    }

    const data = await response.json();
    const events = data.items || [];

    // Get existing categories
    const categories = await base44.entities.Category.list();
    const defaultCategory = categories.find(c => c.key === 'work') || categories[0];

    // Import events as tasks
    const imported = [];
    for (const event of events) {
      if (!event.start?.dateTime && !event.start?.date) continue;

      const startDate = event.start.dateTime || event.start.date;
      const dueDate = startDate.split('T')[0];

      // Calculate duration if end time exists
      let estimatedMinutes;
      if (event.start.dateTime && event.end?.dateTime) {
        const start = new Date(event.start.dateTime);
        const end = new Date(event.end.dateTime);
        estimatedMinutes = Math.round((end - start) / 60000);
      }

      // Check if task already exists (by title and due_date)
      const existing = await base44.entities.Task.filter({
        title: event.summary || 'Untitled Event',
        due_date: dueDate
      });

      if (existing.length === 0) {
        const task = await base44.entities.Task.create({
          title: event.summary || 'Untitled Event',
          description: event.description || '',
          due_date: dueDate,
          category: defaultCategory?.key || 'work',
          priority: 'medium',
          estimated_minutes: estimatedMinutes,
          status: 'todo'
        });
        imported.push(task);
      }
    }

    return Response.json({
      success: true,
      imported: imported.length,
      total: events.length
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});