# Web research (look things up)

Ask Jarvis to look something up — "what tutoring does UH offer, which days, and does
it cover my classes; what are my professor's office hours" — and it searches the web,
then answers concisely with source links.

## Setup — one API key

Research uses [Tavily](https://tavily.com), a search API built for assistants
(generous free tier). Create an account, copy your API key, and add it in
**Vercel → Settings → Environment Variables** (Production + Preview):

| Variable | Value |
| --- | --- |
| `TAVILY_API_KEY` | your Tavily key |

Redeploy.

## Without the key
Research still answers, but **from the model's general knowledge only** — it will say
so and tell you to verify current details on the official site. Add the key to get
live, sourced results.

## Using it
Just ask naturally: *"look up what UH tutoring is available and when."* Jarvis says
"let me look that up," then reads back a short answer and shows the sources it used.
