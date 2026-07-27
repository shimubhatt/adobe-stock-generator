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

    // Direct instructions prohibiting markdown symbols or thinking
    const promptText = `Directly generate Adobe Stock SEO Metadata for this image. 
Do NOT use asterisks (**), markdown, bold text, or thinking tags.

Output in EXACTLY this format:
Title: Write a concise descriptive title here
Keywords: keyword1, keyword2, keyword3, keyword4, keyword5, keyword6, keyword7, keyword8, keyword9, keyword10, keyword11, keyword12, keyword13, keyword14, keyword15, keyword16, keyword17, keyword18, keyword19, keyword20`;

    const finalPrompt = customInstructions 
      ? `${promptText}\nExtra Style Context: ${customInstructions}`
      : promptText;

    const response = await groq.chat.completions.create({
      model: 'qwen/qwen3.6-27b',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: finalPrompt },
            { type: 'image_url', image_url: { url: imageBase64 } }
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 600,
    });

    let rawText = response.choices[0]?.message?.content || '';

    // Clean reasoning tags, double asterisks, and hash symbols
    rawText = rawText
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/\*\*/g, '')
      .replace(/#/g, '')
      .trim();

    // Extract Title
    let title = '';
    const titleMatch = rawText.match(/Title:\s*(.+)/i);
    if (titleMatch) {
      title = titleMatch[1].split('\n')[0].trim();
    }

    // Extract Keywords
    let keywords = '';
    const keywordsMatch = rawText.match(/Keywords:\s*([\s\S]+)/i);
    if (keywordsMatch) {
      keywords = keywordsMatch[1].trim();
    }

    // Backup extractor if model didn't write "Title:" or "Keywords:" explicitly
    if (!title && !keywords) {
      const lines = rawText.split('\n').filter(line => line.trim().length > 0);
      title = lines[0] || '';
      keywords = lines.slice(1).join(', ');
    }

    // Fallback if title is still empty
    if (!title) {
      const cleanName = (filename || 'stock_illustration')
        .replace(/\.[^/.]+$/, '')
        .replace(/_\d{10,}$/, '')
        .replace(/_/g, ' ');
      title = `${cleanName} Vector Set`;
    }

    return NextResponse.json({
      success: true,
      filename: filename || 'adobe_stock_image.jpeg',
      title: title,
      keywords: keywords,
      category: 'Graphic Resources',
    });

  } catch (error) {
    console.error('Groq API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate metadata' },
      { status: 500 }
    );
  }
}
