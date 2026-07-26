import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY is missing" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const { imageBase64, fileName, batchOverview } = await req.json();

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const mimeType = imageBase64.match(/data:(.*);base64/)?.[1] || 'image/png';

    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `You are an elite Adobe Stock SEO expert.
    Analyze this vector/icon image and generate optimized metadata.

    ${batchOverview ? `BATCH OVERVIEW / USER CONTEXT: "${batchOverview}". Use this context to better understand the overall theme and niche.` : ''}

    STRICT RULES:
    1. Title: Sentence case, highly descriptive, under 70 characters. NO keyword stuffing.
    2. Category: Select the most relevant category (e.g. Graphic Resources, People, Technology, Icons, Business).
    3. Keywords: Exactly 25 to 30 highly relevant keywords separated by commas.
       - Keywords #1 to #7 MUST be the main subject, exact action, or primary concept visible in the image.
       - Keywords #8 to #20 MUST be secondary concepts, usage, and context.
       - Keywords #21 to #30 MUST contain technical styles (e.g., vector, illustration, flat, isolated, icon set, line art).

    OUTPUT FORMAT: Return ONLY a valid JSON object with keys: "title", "category", "keywords".`;

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType
      }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text();
    const parsedData = JSON.parse(responseText);

    return NextResponse.json({ ...parsedData, filename: fileName });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
