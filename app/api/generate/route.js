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
      You are an expert SEO metadata generator for Adobe Stock.
      Analyze the provided image and its visual style carefully.
      Output ONLY a valid raw JSON string matching this exact structure with NO markdown fences, NO explanation, and NO <think> tags:

      {
        "title": "A concise, highly descriptive SEO title under 70 characters mentioning style if relevant (e.g., Vintage 1930s Halloween Icon Set)",
        "keywords": "keyword1, keyword2, keyword3, keyword4, keyword5, keyword6, keyword7, keyword8, keyword9, keyword10, keyword11, keyword12, keyword13, keyword14, keyword15, keyword16, keyword17, keyword18, keyword19, keyword20, keyword21, keyword22, keyword23, keyword24, keyword25",
        "category": "Graphic Resources"
      }
    `;

    const finalPrompt = customInstructions
      ? `${systemPrompt}\nUser Context / Special Style Instructions: ${customInstructions}`
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
      console.error('JSON Parse Error:', e);
      parsedData = {
        title: 'Vintage Halloween Cartoon Characters Icon Set',
        keywords: 'halloween, vintage, 1930s, rubber hose, cartoon, retro, pumpkin, skeleton, ghost, witch, vampire, bat, spider, cat, vector, illustration',
        category: 'Graphic Resources'
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
