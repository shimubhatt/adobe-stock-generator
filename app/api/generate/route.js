import { Groq } from 'groq-sdk';
import { NextResponse } from 'next/server';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req) {
  try {
    const body = await req.json();
    const { imageBase64, customInstructions, filename } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'No image data provided' },
        { status: 400 }
      );
    }

    const systemPrompt = `
      You are an expert Adobe Stock SEO metadata generator.
      Analyze the visually provided image very carefully.
      
      Generate highly accurate SEO metadata strictly tailored to what is visible in THIS image.
      
      CRITICAL INSTRUCTION: You MUST return a VALID JSON object matching this structure:
      {
        "title": "A concise, highly descriptive SEO title under 70 characters specific to the visual objects",
        "keywords": "30 to 45 relevant, comma-separated keywords describing the subject, style, color, object, background, and use case",
        "category": "Graphic Resources"
      }
    `;

    const userPrompt = customInstructions
      ? `Analyze this image. Context hint: ${customInstructions}`
      : `Analyze this image and generate Adobe Stock metadata.`;

    const response = await groq.chat.completions.create({
      model: 'qwen/qwen3.6-27b',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: userPrompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: imageBase64,
              },
            },
          ],
        },
      ],
      // 🟢 ENSURES GROQ RETURNS STRICT RAW JSON ONLY
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1000,
    });

    const rawContent = response.choices[0]?.message?.content || '{}';
    const parsedData = JSON.parse(rawContent);

    return NextResponse.json({
      success: true,
      filename: filename || 'adobe_stock_image.jpeg',
      title: parsedData.title || '',
      keywords: parsedData.keywords || '',
      category: parsedData.category || 'Graphic Resources',
    });
  } catch (error) {
    console.error('Groq API Error:', error);

    // Dynamic smart fallback if API fails completely
    const cleanName = (filename || 'stock image')
      .replace(/\.[^/.]+$/, '')
      .replace(/_\d{10,}$/, '')
      .replace(/_/g, ' ');

    return NextResponse.json({
      success: true,
      filename: filename || 'adobe_stock_image.jpeg',
      title: `${cleanName} Vector Illustration`,
      keywords: `${cleanName.toLowerCase().split(' ').join(', ')}, vector, illustration, graphic, design, art, icon, isolated`,
      category: 'Graphic Resources',
    });
  }
}
