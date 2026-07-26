import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req) {
  try {
    const { imageBase64, fileName } = await req.json();

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an elite Adobe Stock SEO expert. Analyze the provided vector/icon image and generate metadata.
          STRICT RULES:
          1. Title: Sentence case, descriptive, under 70 characters. NO keyword stuffing.
          2. Category: Select most relevant category (e.g. Graphic Resources, People, Technology, Icons).
          3. Keywords: Exactly 25 to 30 highly relevant keywords separated by commas.
             - Keywords #1 to #7 MUST be the main subject, exact action, or core concept.
             - Keywords #8 to #20 MUST be secondary concepts, mood, and context.
             - Keywords #21 to #30 MUST contain technical styles (e.g., vector, illustration, flat, isolated, icon set, stroke).
          OUTPUT FORMAT: Return ONLY a JSON object with keys: "title", "category", "keywords".`
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Generate Adobe Stock metadata for this vector artwork." },
            { type: "image_url", image_url: { url: imageBase64 } }
          ]
        }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content);
    return NextResponse.json({ ...result, filename: fileName });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
