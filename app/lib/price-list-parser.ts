// Parses the TGBCL "Price List Report" PDF entirely in the browser.
//
// The report is a rigid, machine-generated table: every column is left-aligned
// at a fixed x offset and each line item is anchored by its S.No. That makes it
// far more reliable to read by geometry than by re-flowing the text, which is
// why this reads coordinates straight from pdf.js instead of joining lines.

export interface PriceListWine {
    brandNumber: string;
    sizeCode: string;
    packType: string;
    productName: string;
    issuePrice: number;
    specialMargin: number;
    mrp: number;
    type: string;
}

export interface PriceListResult {
    wines: PriceListWine[];
    priceListDate: string;
    pageCount: number;
}

interface TextItem {
    t: string;
    x: number;
    y: number;
}

// Left edges of the nine columns, measured across the whole report.
const COLUMNS: Array<{ key: keyof RawRow; x: number }> = [
    { key: 'sno', x: 44 },
    { key: 'brandNumber', x: 74 },
    { key: 'sizeCode', x: 125 },
    { key: 'packType', x: 160 },
    { key: 'productName', x: 195 },
    { key: 'issuePrice', x: 392 },
    { key: 'specialMargin', x: 439 },
    { key: 'mrp', x: 487 },
    { key: 'type', x: 532 },
];
const TOL = 12;

type RawRow = Record<'sno' | 'brandNumber' | 'sizeCode' | 'packType' | 'productName'
    | 'issuePrice' | 'specialMargin' | 'mrp' | 'type', string>;

const columnFor = (x: number) => COLUMNS.find(c => Math.abs(x - c.x) <= TOL)?.key ?? null;

const readingOrder = (a: TextItem, b: TextItem) =>
    Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x;

export class PriceListParseError extends Error {}

/**
 * @param data     the PDF bytes
 * @param pdfjsLib a loaded pdf.js library (the caller owns how it is loaded)
 * @param onProgress reports pages parsed so far; the report runs to ~190 pages
 */
export async function parsePriceList(
    data: ArrayBuffer,
    pdfjsLib: any,
    onProgress?: (page: number, total: number) => void,
): Promise<PriceListResult> {
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const rows: RawRow[] = [];
    let priceListDate = '';

    for (let p = 1; p <= pdf.numPages; p++) {
        const content = await (await pdf.getPage(p)).getTextContent();
        const items: TextItem[] = content.items
            .filter((i: any) => i.str && i.str.trim())
            .map((i: any) => ({ t: i.str.trim(), x: i.transform[4], y: i.transform[5] }));

        if (!priceListDate) {
            const idx = items.findIndex(i => i.t === 'Date :');
            if (idx >= 0) {
                const near = items.filter(i => Math.abs(i.y - items[idx].y) < 4 && i.x > items[idx].x);
                if (near.length) priceListDate = near.sort((a, b) => a.x - b.x)[0].t;
            }
        }

        // The column header repeats on every page and ends at the "Number" line.
        const header = items.find(i => i.t === 'Number' && i.x < 120);
        if (!header) {
            throw new PriceListParseError(
                `Page ${p}: price list column header not found. Is this a TGBCL Price List Report PDF?`,
            );
        }
        const footer = items.find(i => /^https?:\/\//.test(i.t));
        const footerY = footer ? footer.y : -Infinity;

        const body = items
            .filter(i => i.y < header.y - 4 && i.y > footerY + 6)
            .sort(readingOrder);

        const anchors = body
            .filter(i => /^\d{1,4}$/.test(i.t) && Math.abs(i.x - COLUMNS[0].x) <= TOL)
            .sort((a, b) => b.y - a.y);

        const bands = anchors.map((a, idx) => {
            const bottom = idx === anchors.length - 1 ? -Infinity : (a.y + anchors[idx + 1].y) / 2;
            // A record's wrapped lines sit centred on its anchor, so the first
            // record on a page gets a top boundary mirroring its bottom one.
            // Anything above that is a product name that ran over the page break.
            const top = idx === 0
                ? (Number.isFinite(bottom) ? a.y + (a.y - bottom) : header.y - 4)
                : (anchors[idx - 1].y + a.y) / 2;
            return { top, bottom, cells: new Map<string, TextItem[]>() };
        });

        for (const item of body) {
            const key = columnFor(item.x);
            if (!key) continue;
            const band = bands.find(b => item.y < b.top && item.y > b.bottom);
            if (band) {
                const bucket = band.cells.get(key);
                if (bucket) bucket.push(item); else band.cells.set(key, [item]);
                continue;
            }
            // tail of a product name carried over from the previous page
            const prev = rows[rows.length - 1];
            if (prev && key === 'productName') {
                prev.productName = `${prev.productName} ${item.t}`.replace(/\s+/g, ' ').trim();
            }
        }

        for (const band of bands) {
            const cell = (key: string) => (band.cells.get(key) ?? [])
                .sort(readingOrder)
                .map(i => i.t)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
            rows.push({
                sno: cell('sno'),
                brandNumber: cell('brandNumber'),
                sizeCode: cell('sizeCode'),
                packType: cell('packType'),
                productName: cell('productName'),
                issuePrice: cell('issuePrice'),
                specialMargin: cell('specialMargin'),
                mrp: cell('mrp'),
                type: cell('type'),
            });
        }

        onProgress?.(p, pdf.numPages);
    }

    if (!rows.length) {
        throw new PriceListParseError('No price list rows found in this PDF.');
    }

    const wines = rows.map((r, i) => {
        const fail = (what: string, got: string) => {
            throw new PriceListParseError(`Row ${i + 1} (S.No ${r.sno || '?'}): ${what} — got "${got}"`);
        };
        if (Number(r.sno) !== i + 1) fail('S.No out of sequence', r.sno);
        if (!/^\d{4}$/.test(r.brandNumber)) fail('brand number is not 4 digits', r.brandNumber);
        if (!/^[A-Z]{2}$/.test(r.sizeCode)) fail('bad size code', r.sizeCode);
        if (!/^[A-Z]$/.test(r.packType)) fail('bad pack type', r.packType);
        if (!r.productName) fail('empty product name', '');
        if (!/^\d+$/.test(r.issuePrice)) fail('issue price is not a number', r.issuePrice);
        if (!/^\d+(\.\d+)?$/.test(r.specialMargin)) fail('special margin is not a number', r.specialMargin);
        if (!/^\d+$/.test(r.mrp)) fail('MRP is not a number', r.mrp);
        if (!['Local', 'Duty Free', 'Duty Paid'].includes(r.type)) fail('unexpected type', r.type);

        return {
            brandNumber: r.brandNumber,
            sizeCode: r.sizeCode,
            packType: r.packType,
            // the source escapes ampersands as HTML entities
            productName: r.productName.replace(/&amp;/g, '&'),
            issuePrice: Number(r.issuePrice),
            specialMargin: Number(r.specialMargin),
            mrp: Number(r.mrp),
            type: r.type,
        };
    });

    return { wines, priceListDate, pageCount: pdf.numPages };
}
