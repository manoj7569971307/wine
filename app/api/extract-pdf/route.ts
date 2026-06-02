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
            max_tokens: 4096,
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
                            text: `Extract the following from this invoice PDF and return ONLY valid JSON with no markdown or extra text:

1. The ICDC number (starts with "ICDC" followed by digits)
2. The Invoice Date
3. The invoice table data with these exact columns: Sl.No., Brand Number, Brand Name, Product Type, Pack Type, Pack Qty/Size, Qty(Cases), Qty(Bottles), Rate/Case, Unit Rate/Btl, Total

Return this exact JSON structure:
{
  "idocNumber": "ICDC...",
  "invoiceDate": "...",
  "tableData": [
    ["Sl.No.", "Brand Number", "Brand Name", "Product Type", "Pack Type", "Pack Qty/Size", "Qty(Cases)", "Qty(Bottles)", "Rate/Case", "Unit Rate/Btl", "Total"],
    ["1", "0001", "Brand Name Here", "IML", "BOTTLE", "12/750ml", "5", "0", "1234.50", "102.88", "6172.50"]
  ]
}

Important:
- Brand Number must be padded to 4 digits (e.g. "0042")
- Qty(Cases) and Qty(Bottles) should be plain numbers as strings
- Pack Qty/Size format should be like "12/750ml" or "24/180ml"
- If no ICDC number found, set idocNumber to ""
- If no invoice date found, set invoiceDate to ""`,
                        },
                    ],
                },
            ],
        });

        const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
        console.log('=== Claude AI Raw Response (extract-pdf) ===');
        console.log(responseText);
        console.log('=============================================');

        let parsed;
        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            parsed = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
        } catch {
            return NextResponse.json({ error: 'Failed to parse Claude response', raw: responseText }, { status: 500 });
        }

        console.log('=== Parsed Result (extract-pdf) ===');
        console.log('idocNumber:', parsed.idocNumber);
        console.log('invoiceDate:', parsed.invoiceDate);
        console.log('tableData rows:', parsed.tableData?.length);
        console.log('tableData:', JSON.stringify(parsed.tableData, null, 2));
        console.log('===================================');

        return NextResponse.json(parsed);
    } catch (error: any) {
        console.error('PDF extraction error:', error);
        return NextResponse.json({ error: error.message || 'Failed to extract PDF data' }, { status: 500 });
    }
}
