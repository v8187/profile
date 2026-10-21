"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = __dirname;
const MAX_REQUEST_BYTES = 16 * 1024;
const PROFILE_FIELDS = new Set([
  "name",
  "gender",
  "category",
  "religion",
  "maritalStatus",
  "currentCity",
  "currentState",
  "currentCountry",
  "diet",
  "smoking",
  "drinking",
  "motherTongue",
  "education",
  "occupation",
  "annualIncome",
  "aboutProfile",
  "familyType",
  "familyStatus",
  "aboutFamily",
  "partnerPreferences",
]);
const LANGUAGE_NAMES = new Map([
  ["en", "English"],
  ["hi", "Hindi"],
  ["pa", "Punjabi"],
]);

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  const contents = fs.readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.hasOwn(process.env, match[1])) continue;

    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    process.env[match[1]] = value;
  }
}

function jsonResponse(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    let settled = false;

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (settled) return;
      size += Buffer.byteLength(chunk);
      if (size > MAX_REQUEST_BYTES) {
        settled = true;
        reject(Object.assign(new Error("Request body is too large."), { status: 413 }));
        request.resume();
        return;
      }
      body += chunk;
    });
    request.on("end", () => {
      if (settled) return;
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("Request body must be valid JSON."), { status: 400 }));
      }
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function getProfile(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw Object.assign(new Error("Provide profile details as JSON."), { status: 400 });
  }

  const profile = {};
  for (const [key, value] of Object.entries(body.profile || {})) {
    if (!PROFILE_FIELDS.has(key) || typeof value !== "string") continue;
    const trimmedValue = value.trim().slice(0, 1000);
    if (trimmedValue) profile[key] = trimmedValue;
  }

  if (Object.keys(profile).length === 0) {
    throw Object.assign(new Error("Fill in some profile details first."), { status: 400 });
  }
  return profile;
}

async function generateBio(profile, language) {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_TOKEN;
  if (!token) {
    throw Object.assign(
      new Error("Set HF_TOKEN in your .env file before requesting an AI bio."),
      { status: 503 },
    );
  }

  const profileDetails = Object.entries(profile)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  const outputLanguage = LANGUAGE_NAMES.get(language) || "English";

  let response;
  try {
    response = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.HF_MODEL || "Qwen/Qwen2.5-7B-Instruct-1M:featherless-ai",
        messages: [
          {
            role: "system",
            content:
              "Write a warm, respectful matrimonial profile bio using only the supplied facts. Do not invent details or make assumptions. Keep it concise, in third person, and suitable for the requested language.",
          },
          {
            role: "user",
            content: `Write a matrimonial profile bio in ${outputLanguage} based on these details:\n${profileDetails}`,
          },
        ],
        max_tokens: 220,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    console.error("Hugging Face request failed:", error.message);
    throw Object.assign(
      new Error("Could not reach Hugging Face. Check your connection and try again."),
      { status: 502 },
    );
  }

  const responseText = await response.text();
  let result;
  try {
    result = JSON.parse(responseText);
  } catch {
    result = null;
  }
  if (!response.ok) {
    console.error("Hugging Face API returned an error:", response.status);
    const providerMessage =
      (typeof result?.error === "string" && result.error) ||
      (typeof result?.error?.message === "string" && result.error.message) ||
      (typeof result?.message === "string" && result.message) ||
      responseText;
    const safeProviderMessage = providerMessage
      .replace(/hf_[A-Za-z0-9]{20,}/g, "[redacted token]")
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .trim()
      .slice(0, 300);
    throw Object.assign(
      new Error(
        safeProviderMessage
          ? `Hugging Face rejected the request (${response.status}): ${safeProviderMessage}`
          : `Hugging Face rejected the request (${response.status}). Check that your token has Inference Providers permission and that the model is available.`,
      ),
      { status: 502 },
    );
  }

  const bio = result?.choices?.[0]?.message?.content?.trim();
  if (!bio) {
    console.error("Hugging Face returned an unexpected response.");
    throw Object.assign(new Error("Hugging Face did not return a bio. Try again."), {
      status: 502,
    });
  }
  return bio;
}

function createServer() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      try {
        const html = await fs.promises.readFile(path.join(ROOT, "index.html"));
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        response.end(html);
      } catch (error) {
        console.error("Could not read index.html:", error.message);
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Could not load the profile page.");
      }
      return;
    }

    if (url.pathname === "/api/generate-bio" && request.method === "POST") {
      if (!request.headers["content-type"]?.includes("application/json")) {
        jsonResponse(response, 415, { error: "Send profile details as JSON." });
        return;
      }

      try {
        const body = await readJsonBody(request);
        const profile = getProfile(body);
        const bio = await generateBio(profile, body.language);
        jsonResponse(response, 200, { bio });
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        if (status >= 500) console.error("AI bio generation failed:", error.message);
        jsonResponse(response, status, {
          error: status === 500 ? "Could not generate an AI bio." : error.message,
        });
      }
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found.");
  });
}

loadEnvFile();
const PORT = Number(process.env.PORT) || 3000;

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Profile app running at http://127.0.0.1:${PORT}`);
  });
}

module.exports = { createServer };