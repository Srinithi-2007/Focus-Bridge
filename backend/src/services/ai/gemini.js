'use strict';
// Google Gemini REST client. The key is sent in a header, never in the URL, and is read from the environment only.
const env = require('../../config/env');

async function call(body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.aiModel)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.aiApiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`AI provider responded with status ${res.status}`);
  const data = await res.json();
  return (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
}

async function generateJson(prompt) {
  const text = await call({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 1024 },
  });
  return JSON.parse(text);
}

async function generateText(system, user) {
  return call({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
  });
}

module.exports = { generateJson, generateText };
