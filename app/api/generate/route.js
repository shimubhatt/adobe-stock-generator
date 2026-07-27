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

    const systemPrompt = `You are an expert Adobe Stock SEO Metadata Generator.
Analyze the visually provided image very carefully.
Generate accurate metadata strictly for the objects present in this image.

User context hint: ${customInstructions || 'None'}`;

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
              text: 'Analyze the image and generate Adobe Stock Title and Keywords.',
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
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'adobe_stock_metadata',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Descriptive SEO title under 70 characters without quotes or reasoning',
              },
              keywords: {
                type: 'string',
                description: 'Comma-separated keywords (25-40 terms) describing subjects, elements, style, vector, background',
              },
            },
            required: ['title', 'keywords'],
            additionalProperties: false,
          },
        },
      },
    });

    let rawContent = response.choices[0]?.message?.content || '{}';

    // Strictly Strip any <think> reasoning tags or leftover XML
    rawContent = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    let parsedData = {};
    try {
      parsedData = JSON.parse(rawContent);
    } catch (e) {
      console.error('JSON Parse error:', e);
      parsedData = {};
    }

    // Clean Title & Keywords
    let cleanTitle = (parsedData.title || '')
      .replace(/<think>/gi, '')
      .replace(/^[\s"-]+|[\s"-]+$/g, '')
      .trim();

    let cleanKeywords = (parsedData.keywords || '')
      .replace(/<think>/gi, '')
      .trim();

    if (Array.isArray(cleanKeywords)) {
      cleanKeywords = cleanKeywords.join(', ');
    }

    return NextResponse.json({
      success: true,
      filename: filename || 'adobe_stock_image.jpeg',
      title: cleanTitle || `${filename.replace(/_/g, ' ')} Vector`,
      keywords: cleanKeywords,
      category: 'Graphic Resources',
    });

  } catch (error) {
    console.error('Groq API Error:', error);
    
    const cleanName = (filename || 'stock image')
      .replace(/\.[^/.]+$/, '')
      .replace(/_\d{10,}$/, '')
      .replace(/_/g, ' ');

    return NextResponse.json({
      success: true,
      filename: filename || 'adobe_stock_image.jpeg',
      title: `${cleanName} Vector Illustration`,
      keywords: `${cleanName.toLowerCase().split(' ').join(', ')}, vector, illustration, graphic, design, isolated`,
      category: 'Graphic Resources',
    });
  }
}
