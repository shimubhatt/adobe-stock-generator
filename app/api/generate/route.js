import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY is missing in Vercel Environment Variables" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const { imageBase64, fileName, batchOverview } = await req.json();

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const mimeType = imageBase64.match(/data:(.*);base64/)?.[1] || 'image/jpeg';

    // Free Tier Supported Stable Model
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash" 
    });

    const prompt = `You are an elite Adobe Stock SEO expert.
    Analyze this vector/icon image and generate metadata.

    ${batchOverview ? `BATCH OVERVIEW / USER CONTEXT: "${batchOverview}". Use this context for accurate keywords.` : ''}

    STRICT RULES:
    1. Title: Sentence case, descriptive, under 70 characters. NO keyword stuffing.
    2. Category: Select most relevant category (e.g. Graphic Resources, People, Technology, Icons, Business).
    3. Keywords: Exactly 25 to 30 highly relevant keywords separated by commas.
       - Keywords #1 to #7 MUST be the primary subject, main action, or exact concept visible.
       - Keywords #8 to #20 MUST be secondary concepts, usage, and context.
       - Keywords #21 to #30 MUST contain technical terms (e.g. vector, illustration, flat, isolated, icon set, line art).

    OUTPUT FORMAT: Return ONLY a JSON object with keys: "title", "category", "keywords". Do not add markdown backticks.`;

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType
      }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text();

    const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanJson);

    return NextResponse.json({ ...parsedData, filename: fileName });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
