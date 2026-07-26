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
      Analyze the image and return ONLY a valid JSON object matching this exact structure:
      {
        "title": "A clear, descriptive title under 70 characters",
        "keywords": "keyword1, keyword2, keyword3, keyword4, keyword5, keyword6, keyword7, keyword8, keyword9, keyword10, keyword11, keyword12, keyword13, keyword14, keyword15, keyword16, keyword17, keyword18, keyword19, keyword20, keyword21, keyword22, keyword23, keyword24, keyword25",
        "category": "Graphic Resources"
      }
      Do NOT include markdown block markers like \`\`\`json. Return raw JSON string only.
    `;

    const finalPrompt = customInstructions
      ? `${systemPrompt}\nAdditional instructions: ${customInstructions}`
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
      temperature: 0.2,
      max_tokens: 1000,
    });

    let rawText = response.choices[0]?.message?.content || '{}';
    
    // Clean potential markdown tags from LLM response
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsedData = {};
    try {
      parsedData = JSON.parse(rawText);
    } catch (e) {
      // Fallback if parsing fails
      parsedData = {
        title: rawText.substring(0, 70),
        keywords: 'vector, icon, graphic, design, illustration, stock',
        category: 'Graphic Resources'
      };
    }

    return NextResponse.json({
      success: true,
      filename: filename || 'image.jpeg',
      title: parsedData.title || '',
      keywords: parsedData.keywords || '',
      category: parsedData.category || 'Graphic Resources',
      raw: rawText
    });
  } catch (error) {
    console.error('Groq API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate metadata' },
      { status: 500 }
    );
  }
}
