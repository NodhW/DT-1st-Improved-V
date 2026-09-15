const json = (value, init = {}) => Response.json(value, init);

async function currentUser(supabaseUrl, serviceKey, accessToken) {
  if (!supabaseUrl || !serviceKey || !accessToken) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  return response.json();
}

export default async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, { status: 405 });

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authorization = request.headers.get('authorization') || '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();

  if (!geminiKey) return json({ configured: false, error: 'Gemini is not configured. Add GEMINI_API_KEY to Netlify environment variables.' }, { status: 503 });
  if (!supabaseUrl || !serviceKey || !accessToken) return json({ error: 'You must be signed in.' }, { status: 401 });

  const user = await currentUser(supabaseUrl, serviceKey, accessToken);
  if (!user?.id) return json({ error: 'Your session is not valid.' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const message = String(body?.message || '').trim();
  if (!message || message.length > 2000) return json({ error: 'Message must be between 1 and 2000 characters.' }, { status: 400 });

  const context = body?.context && typeof body.context === 'object' ? body.context : {};
  const systemInstruction = [
    'You are Fit AI inside the Fit Together fitness/social app.',
    'Give concise, practical fitness-planning guidance. Do not claim medical diagnosis.',
    'You can help with workout planning, schedules, challenges, points, motivation, and social fitness planning.',
    'Treat the supplied app context as prototype data and never invent database actions you did not perform.',
    'If asked to perform an action, explain what the app can do and use the UI action buttons when provided.',
    'Keep responses friendly and suitable for a university fitness prototype.'
  ].join(' ');

  const prompt = `App context:\n${JSON.stringify(context).slice(0, 12000)}\n\nUser message:\n${message}`;

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
        input: prompt,
        system_instruction: systemInstruction,
        store: false
      })
    });

    const result = await response.json();
    if (!response.ok) return json({ error: result?.error?.message || 'Gemini request failed.' }, { status: 502 });

    // The REST Interactions API returns model output inside `steps[].content[]`.
    // `output_text` is an SDK convenience property, not a REST response field.
    // Keep both paths so this remains tolerant of future response wrappers.
    const stepText = Array.isArray(result?.steps)
      ? result.steps
          .filter(step => step?.type === 'model_output')
          .flatMap(step => Array.isArray(step?.content) ? step.content : [])
          .filter(block => block?.type === 'text' && typeof block?.text === 'string')
          .map(block => block.text)
          .join('\n')
          .trim()
      : '';
    const text = String(result?.output_text || stepText || '').trim();
    if (!text) return json({ error: 'Gemini returned no text output.' }, { status: 502 });
    return json({ ok: true, text });
  } catch (error) {
    return json({ error: error?.message || 'Gemini request failed.' }, { status: 502 });
  }
};
