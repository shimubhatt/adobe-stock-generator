import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY is missing in Vercel Environment Variables" }, { status: 500 });
    }

    const { imageBase64, fileName, batchOverview } = await req.json();

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const mimeType = imageBase64.match(/data:(.*);base64/)?.[1] || 'image/jpeg';

    const promptText = `You are an elite Adobe Stock SEO expert.
Analyze this vector/icon image and generate metadata.

${batchOverview ? `BATCH OVERVIEW / USER CONTEXT: "${batchOverview}". Use this context for accurate keywords.` : ''}

STRICT RULES:
1. Title: Sentence case, descriptive, under 70 characters. NO keyword stuffing.
2. Category: Select most relevant category (e.g. Graphic Resources, People, Technology, Icons, Business).
3. Keywords: Exactly 25 to 30 highly relevant keywords separated by commas.
   - Keywords #1 to #7 MUST be the primary subject, main action, or exact concept visible.
   - Keywords #8 to #20 MUST be secondary concepts, usage, and context.
   - Keywords #21 to #30 MUST contain technical terms (e.g. vector, illustration, flat, isolated, icon set, line art).

OUTPUT FORMAT: Return ONLY a raw JSON object with keys: "title", "category", "keywords". Do not add markdown code blocks or backticks.`;

    // Active Supported Gemini Models
    const candidateModels = ["gemini-2.0-flash", "gemini-2.0-flash-lite"];
    let responseText = null;
    let lastError = null;

    for (const modelName of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: promptText },
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: base64Data
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              response_mime_type: "application/json"
            }
          })
        });

        const data = await response.json();

        if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
          responseText = data.candidates[0].content.parts[0].text;
          break; // Success
        } else {
          lastError = data.error?.message || `Failed on model ${modelName}`;
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    if (!responseText) {
      throw new Error(lastError || "Could not generate content from Gemini API.");
    }

    const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanJson);

    return NextResponse.json({ ...parsedData, filename: fileName });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
