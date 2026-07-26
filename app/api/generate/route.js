import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GROQ_API_KEY is missing in Vercel Environment Variables" }, { status: 500 });
    }

    const { imageBase64, fileName, batchOverview } = await req.json();

    // Clean Base64 string
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const mimeType = imageBase64.match(/data:(.*);base64/)?.[1] || 'image/jpeg';
    const imageUrl = `data:${mimeType};base64,${base64Data}`;

    const promptText = `You are an elite Adobe Stock SEO expert.
Analyze this image and generate optimized metadata.

${batchOverview ? `BATCH OVERVIEW / USER CONTEXT: "${batchOverview}". Use this context for accurate keywords.` : ''}

STRICT RULES:
1. Title: Sentence case, descriptive, under 70 characters. NO keyword stuffing.
2. Category: Select most relevant category (e.g. Graphic Resources, People, Technology, Icons, Business).
3. Keywords: Exactly 25 to 30 highly relevant keywords separated by commas.
   - Keywords #1 to #7 MUST be the primary subject, main action, or exact concept visible.
   - Keywords #8 to #20 MUST be secondary concepts, usage, and context.
   - Keywords #21 to #30 MUST contain technical terms (e.g. vector, illustration, flat, isolated, icon set, line art).

OUTPUT FORMAT: Return ONLY a raw JSON object with keys: "title", "category", "keywords". Do not add markdown code blocks, backticks, or conversational text.`;

    // Groq OpenAI-compatible Chat Completions Endpoint
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.2-11b-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptText },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Groq API Error");
    }

    const responseText = data.choices?.[0]?.message?.content;
    if (!responseText) {
      throw new Error("Invalid response received from Groq API");
    }

    const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanJson);

    return NextResponse.json({ ...parsedData, filename: fileName });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
