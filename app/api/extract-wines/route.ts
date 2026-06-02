import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('pdf') as File;

        if (!file) {
            return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');

        const message = await client.messages.create({
            model: 'claude-opus-4-8',
            max_tokens: 8096,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'document',
                            source: {
                                type: 'base64',
                                media_type: 'application/pdf',
                                data: base64,
                            },
                        },
                        {
                            type: 'text',
                            text: `This is a wines/liquor price list PDF. Extract ALL wine/liquor entries and return ONLY valid JSON with no markdown or extra text.

Return this exact JSON structure:
{
  "wines": [
    {
      "brandNumber": "0042",
      "productName": "PRODUCT NAME HERE",
      "issuePrice": 1234,
      "mrp": 220,
      "type": "Local"
    }
  ]
}

Rules:
- brandNumber must be padded to 4 digits (e.g. "0042" not "42")
- issuePrice is the case/bulk price (numeric, no commas)
- mrp is the per-bottle retail price (numeric, no commas)
- type can be "Local", "IML", "Beer", etc. — extract from the data
- Extract every single row/entry from the table, do not skip any
- If a field is missing, use 0 for numbers and "" for strings`,
                        },
                    ],
                },
            ],
        });

        const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
        console.log('=== Claude AI Raw Response (extract-wines) ===');
        console.log(responseText.substring(0, 1000), '...[truncated]');
        console.log('===============================================');

        let parsed;
        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            parsed = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
        } catch {
            return NextResponse.json({ error: 'Failed to parse Claude response', raw: responseText.substring(0, 500) }, { status: 500 });
        }

        console.log('=== Parsed Wines Result ===');
        console.log('Total wines extracted:', parsed.wines?.length);
        console.log('First 3 wines:', JSON.stringify(parsed.wines?.slice(0, 3), null, 2));
        console.log('===========================');

        return NextResponse.json(parsed);
    } catch (error: any) {
        console.error('Wines PDF extraction error:', error);
        return NextResponse.json({ error: error.message || 'Failed to extract wines data' }, { status: 500 });
    }
}
