const ALLOWED_ORIGINS = new Set([
  "https://profile-1xq.pages.dev",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://dash.cloudflare.com",
]);
const SYSTEM_INSTRUCTIONS = `You are an expert matrimonial profile writer.
Write concise, natural profiles using the fewest words possible without losing important details. Prefer a single, well-structured sentence where practical; start a new sentence only when needed for readability. Avoid repetitive first-person openings such as "I am…", "I was…", "I have…", and "I enjoy…". Combine related details naturally instead of listing them separately. Use varied sentence structures, avoid unnecessary pronouns and filler, and never repeat information.
Adapt the writing style to the requested language and format while preserving all supplied facts accurately. Never invent or assume details.
Generate exactly TWO distinct profile options. Return only the final profiles, labeled "Option 1" and "Option 2", without explanations, analysis, or extra commentary.`;

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
      const result = await env.AI.run(
        // "@cf/zai-org/glm-4.7-flash",
        "@cf/google/gemma-4-26b-a4b-it",
        {
          messages: [
            { role: "system", content: SYSTEM_INSTRUCTIONS },
            {
              role: "user",
              content: `Write a ${body.format || "paragraph"} matrimonial
profile in ${body.language || "English"}.

Profile:
${JSON.stringify(body.profile)}`,
            },
          ],
          max_tokens: 700,
          temperature: 0.7,
          chat_template_kwargs: { enable_thinking: false },
        },
      );

      // console.log("result.response = ", result)

      return Response.json(
        { success: true, received: body, aiResponse: result },
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
