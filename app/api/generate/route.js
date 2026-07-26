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
      You are an expert Adobe Stock metadata generator.
      Analyze the provided visual image VERY CAREFULLY. 
      Generate dynamic Title and Keywords specifically matching ONLY what is present in THIS specific image.

      OUTPUT FORMAT:
      Output MUST be valid raw JSON with NO markdown fences, NO explanation, and NO <think> tags:

      {
        "title": "Clear descriptive title specific to the image objects (max 70 characters)",
        "keywords": "30 to 40 highly relevant, comma-separated keywords describing the subject, style, color, object, background, and use case",
        "category": "Graphic Resources"
      }
    `;

    const finalPrompt = customInstructions
      ? `${systemPrompt}\nOptional Context Hint (Use ONLY if relevant to image): ${customInstructions}`
      : systemPrompt;

    const response = await groq.chat.completions.create({
      model: 'qwen/qwen3.6-27b',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: finalPrompt,
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
      temperature: 0.1,
      max_tokens: 1000,
    });

    let rawText = response.choices[0]?.message?.content || '{}';

    // Clean reasoning and markdown formatting
    rawText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    rawText = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();

    let parsedData = {};
    try {
      parsedData = JSON.parse(rawText);
    } catch (e) {
      console.error('JSON Parse Error:', e, 'Raw output:', rawText);
      parsedData = {
        title: `${filename.split('.')[0].replace(/_/g, ' ')} Vector Illustration`,
        keywords: 'vector, illustration, icon, set, isolated, graphic, design, art, element, object, symbol',
        category: 'Graphic Resources',
      };
    }

    return NextResponse.json({
      success: true,
      filename: filename || 'adobe_stock_image.jpeg',
      title: parsedData.title || '',
      keywords: parsedData.keywords || '',
      category: parsedData.category || 'Graphic Resources',
    });
  } catch (error) {
    console.error('Groq API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate metadata' },
      { status: 500 }
    );
  }
}
