const ALLOWED_ORIGINS = new Set([
  "https://profile-1xq.pages.dev",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://dash.cloudflare.com",
]);
const SYSTEM_INSTRUCTIONS = `You are an expert matrimonial profile writer.
Write one concise, natural matrimonial profile in the requested language and its native script: English, Hindi (Devanagari), or Punjabi (Gurmukhi). Do not follow the language of the input data.

Follow the requested format exactly:
- Anonymous: omit name, exact birth date, salary, specific employer/business, contact details, social handles, full address, and other identifying details. A birth year or broad profession is allowed.
- Short: maximum 3 lines.
- Standard: one engaging paragraph.
- Non-anonymous formats: use the supplied name and relevant facts.

Use profileFor to identify who the profile is about and choose perspective: Self means first person; otherwise write about the candidate in third person (use “our son/daughter/sibling” only when that relationship is specified, otherwise “the candidate”). Use gender—not profileFor—to determine pronouns and grammatical gender. For partner preferences, use the gender-appropriate opposite-gender term.

Preserve facts, omit missing details, and never infer or invent. Return only the finished profile.`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      Vary: "Origin",
    });

    if (origin && ALLOWED_ORIGINS.has(origin)) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
      headers.set("Access-Control-Max-Age", "86400");
    }

    // Handle preflight before parsing JSON or calling AI.
    if (request.method === "OPTIONS") {
      if (!origin || !ALLOWED_ORIGINS.has(origin)) {
        return new Response("Origin not allowed", { status: 403 });
      }

      return new Response(null, {
        status: 204,
        headers,
      });
    }

    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      return Response.json(
        { error: "Origin not allowed", receivedOrigin: origin },
        { status: 403, headers },
      );
    }

    if (request.method !== "POST") {
      return Response.json(
        { error: "Method not allowed" },
        { status: 405, headers },
      );
    }

    try {
      const body = await request.json();
      const languages = {
        en: "English",
        hi: "Hindi (Devanagari)",
        pa: "Punjabi (Gurmukhi)",
      };
      const language = languages[body.language] || languages.en;
      const messages = [
        { role: "system", content: SYSTEM_INSTRUCTIONS },
        {
          role: "user",
          content: `Format: ${body.format || "Standard Social Media Post"}
Language: ${language}

Profile facts (JSON):
${JSON.stringify(body.profile)}`,
        },
      ];

      const result = await env.AI.run(
        // "@cf/zai-org/glm-4.7-flash",
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        //"@cf/google/gemma-4-26b-a4b-it",
        {
          messages,
          max_tokens: 700,
          temperature: 0.7,
          chat_template_kwargs: { enable_thinking: false },
        },
      );

      return Response.json(
        { success: true, aiResponse: result },
        { status: 200, headers },
      );
      //   return new Response(JSON.stringify({ success: true, profile: result.response }), {
      //   headers: { "Content-Type": "application/json", ...headers },
      // });
    } catch {
      return Response.json(
        { error: "Invalid JSON body" },
        { status: 400, headers },
      );
    }
  },
};
