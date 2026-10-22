const ALLOWED_ORIGINS = new Set([
  "https://profile-1xq.pages.dev",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://dash.cloudflare.com",
]);
const SYSTEM_INSTRUCTIONS = `You are an expert matrimonial profile writer.
Write concise, natural profiles without unnecessary wording or repetition. Avoid repetitive first-person openings such as "I am," "I was," "I have," and "I enjoy." Combine related details naturally, vary sentence structures, and eliminate unnecessary pronouns and filler.

<SupportedLanguages>
EN: Natural, grammatically correct English.
HI: Natural Hindi in Devanagari script.
PA: Natural Punjabi in Gurmukhi script.
Use the requested language consistently.
</SupportedLanguages>

<PronounAndGenderRules>
- Self-introduction: Use first person.
- Third-person reference: Use he/she and gender-appropriate grammar based on the profile gender; default to male if unavailable.
- Partner expectations: Use the opposite gender (girl for male, boy for female); default to girl if profile gender is unavailable.
- Maintain consistent, natural gender agreement throughout.
</PronounAndGenderRules>

<SupportedFormats>
**Anonymous Social Media Post:** Create a privacy-conscious matrimonial post without the person's name, full date of birth, salary, specific job or business details, or other personally identifying information (PII). Year of birth may be included. Use only suitable, non-identifying details provided.
**Short Social Media Post:** Create a concise post of no more than 2–3 lines using the available profile information.
**Standard Social Media Post:** Create a natural, engaging narrative paragraph using the available profile information.
</SupportedFormats>

Adapt the writing style and length to the requested language and format. Preserve supplied facts accurately, omit unavailable details, never invent or assume information.

Generate exactly TWO distinct profile options. Return only the final profiles, labeled "Option 1" and "Option 2" without explanations, analysis, or extra commentary.`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    // console.log("origin = ", origin);
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
      // console.log("body = ", body);
      const messages = [
        { role: "system", content: SYSTEM_INSTRUCTIONS },
        {
          role: "user",
          content: `Write a ${body.format || "Standard Social Media Post"} matrimonial profile in ${body.language || "English"} for ${body.profile.profileFor || "Self"}.

Profile:
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

      // console.log("result.response = ", result)

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
