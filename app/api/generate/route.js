import { Groq } from 'groq-sdk';
import { NextResponse } from 'next/server';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req) {
  try {
    const body = await req.json();
    const { imageBase64, customInstructions } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'No image data provided' },
        { status: 400 }
      );
    }

    const defaultPrompt = `
      You are an expert SEO metadata generator for Adobe Stock. 
      Analyze the provided image and generate:
      1. A clear, accurate, and descriptive Title (max 70 characters).
      2. A concise Description.
      3. A list of 30 to 50 highly relevant SEO Keywords, separated by commas.

      Format the output clearly with:
      Title: ...
      Description: ...
      Keywords: ...
    `;

    const finalPrompt = customInstructions
      ? `${defaultPrompt}\nAdditional Context/Instructions: ${customInstructions}`
      : defaultPrompt;

    const response = await groq.chat.completions.create({
      // ✅ UPDATED TO CURRENT SUPPORTED GROQ VISION MODEL
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
      temperature: 0.2,
      max_tokens: 1000,
    });

    const result = response.choices[0]?.message?.content || '';

    return NextResponse.json({ success: true, metadata: result });
  } catch (error) {
    console.error('Groq API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate metadata' },
      { status: 500 }
    );
  }
}
