// Stock arithmetic for a sheet row.
//
// `sales` is a derived number, but it is stored on the row and saved to Firebase.
// Every path that changes openingStock, receipts, tranIn, tranOut or closingStock
// MUST call recalcRow, or the stored sales silently goes stale.

export interface StockRow {
    openingStock: number;
    receipts: number;
    tranIn: number;
    tranOut: number;
    closingStock: number;
    closingEntered?: boolean;
    sales: number;
    rate: number;
    amount: string;
}

// Stock available for the period, before closing stock is deducted.
export const rowTotal = (item: StockRow): number =>
    (Number(item.openingStock) || 0) + (Number(item.receipts) || 0)
    + (Number(item.tranIn) || 0) - (Number(item.tranOut) || 0);

// Single source of truth for sales/amount. Without a closing stock count there is
// nothing to derive sales from, so it stays 0 rather than reading as "all sold".
export const recalcRow = <T extends StockRow>(item: T): T => {
    item.sales = item.closingEntered ? rowTotal(item) - (Number(item.closingStock) || 0) : 0;
    item.amount = `₹${(item.sales * (Number(item.rate) || 0)).toFixed(2)}`;
    return item;
};

// Records saved before closingEntered existed: infer it from the stored numbers.
// A counted row either has stock left over, or sold out with sales equal to the total.
export const backfillClosingEntered = <T extends StockRow>(item: T): T => {
    if (typeof item.closingEntered === 'boolean') return item;
    item.closingEntered = (Number(item.closingStock) || 0) > 0
        || (Number(item.sales) || 0) === rowTotal(item);
    return item;
};
