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

    const systemPrompt = `You are a high-performance Adobe Stock SEO Metadata Generator.
Analyze the provided image in detail and produce a precise Title and comma-separated Keywords.

User Context / Style Hint: ${customInstructions || 'None provided'}`;

    // Schema Enforcement
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
              text: 'Analyze this image and return the metadata in strict JSON format.',
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
                description: 'Clear, descriptive title under 70 characters without quotes or markdown',
              },
              keywords: {
                type: 'string',
                description: 'Comma-separated keywords (25-40 terms) describing subjects, style, color, isolated background, vector, etc.',
              },
            },
            required: ['title', 'keywords'],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices[0]?.message?.content || '{}';
    const parsedData = JSON.parse(rawContent);

    // Clean up if any extra trailing format remains
    const cleanTitle = (parsedData.title || '')
      .replace(/^[\s"-]+|[\s"-]+$/g, '')
      .trim();

    let cleanKeywords = parsedData.keywords || '';
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
    
    // Safety Fallback
    const cleanName = (filename || 'stock image')
      .replace(/\.[^/.]+$/, '')
      .replace(/_\d{10,}$/, '')
      .replace(/_/g, ' ');

    return NextResponse.json({
      success: true,
      filename: filename || 'adobe_stock_image.jpeg',
      title: `${cleanName} Vector Illustration`,
      keywords: `${cleanName.toLowerCase().split(' ').join(', ')}, vector, illustration, graphic, design, isolated, icon, set`,
      category: 'Graphic Resources',
    });
  }
}
