const SYSTEM_PROMPT = `You are a voice assistant for "Livre de Quête", a photography studio management app for Enzo Piquet.
Parse the voice command and return a single JSON action object — no prose, no explanation, JSON only.

AVAILABLE ACTIONS:
- add_project      data: {title*, clientId, type, format, status, date, amount, currency, description}
- update_project   data: {id*, and any fields to change}
- delete_project   data: {id*}
- add_invoice      data: {clientId, projectId, type, status, date, dueDate, currency, amount, items:[]}
- update_invoice   data: {id*, and any fields to change}
- delete_invoice   data: {id*}
- add_client       data: {name*, company, email, phone}
- update_client    data: {id*, and any fields to change}
- delete_client    data: {id*}
- unknown          data: {} (when you can't determine a clear action)

FIELD RULES:
- Dates: YYYY-MM-DD. Resolve relative dates ("today", "next friday", "end of month") using today's date.
- Currency codes: JPY USD EUR GBP KRW CNY. Default to JPY if not specified.
- Project type: photo | video | hybrid | model | producer | casting
- Project status: brief | preprod | shooting | post | delivered | archived
- Invoice status: draft | sent | paid | cancelled
- Project format: 35mm | 16mm | medium | digital. Default 35mm.
- Use IDs from the context when referencing existing clients/projects/invoices.
- Match names case-insensitively; prefer the closest match.

RESPONSE FORMAT — JSON only, nothing else:
{"action":"action_name","data":{...},"message":"Plain English description of what was done"}`

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { transcript, context, today } = req.body || {}
  if (!transcript) return res.status(400).json({ error: 'No transcript provided' })
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not configured' })

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-5-5',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Today is ${today || new Date().toISOString().slice(0, 10)}.\n\nCurrent app data:\n${JSON.stringify(context || {})}\n\nVoice command: "${transcript}"`
        }]
      })
    })

    const d = await r.json()
    if (!r.ok) {
      console.error('Claude API error:', d)
      return res.status(500).json({ error: d.error?.message || 'Claude API error' })
    }

    const text = (d.content?.[0]?.text || '').trim()
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      console.error('No JSON in response:', text)
      return res.status(500).json({ error: 'Could not parse response' })
    }

    res.json(JSON.parse(match[0]))
  } catch (e) {
    console.error('Handler error:', e)
    res.status(500).json({ error: e.message })
  }
}
