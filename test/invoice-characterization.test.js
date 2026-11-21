const test = require('node:test');
const assert = require('node:assert/strict');

const invoice = require('../lib/invoice');
const pricing = require('../lib/pricing');
const tax = require('../lib/tax');
const reports = require('../lib/reports');

test('invoice applies HSN GST and coupon rules consistently with order pricing', () => {
  const items = [{ name: 'Rice', hsn: '1006', price: 100, qty: 1 }];
  const ledger = pricing.computeTotals(items, 'WELCOME');
  const figures = invoice.computeInvoiceFigures({ items, coupon: 'WELCOME' });

  assert.deepEqual(
    { subtotal: figures.subtotal, discount: figures.discount, tax: figures.tax, total: figures.total },
    { subtotal: ledger.subtotal, discount: ledger.discount, tax: ledger.tax, total: ledger.total }
  );
  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.rows[0].lineTax, ledger.lines[0].tax);
});

test('invoice applies the same HSN slab as order pricing', () => {
  // Order line shape produced by routes/orders.js: HSN is kept, GST rate is not.
  const items = [{ id: 1, name: 'Rice', sku: 'RICE', hsn: '1006', price: 100, qty: 1 }];
  const ledger = pricing.computeTotals(items, '');
  const figures = invoice.computeInvoiceFigures({ items });

  assert.equal(tax.getRateForItem(items[0]), 0.05);
  assert.deepEqual({ subtotal: ledger.subtotal, tax: ledger.tax, total: ledger.total },
    { subtotal: 100, tax: 5, total: 105 });
  assert.deepEqual({ subtotal: figures.subtotal, tax: figures.tax, total: figures.total },
    { subtotal: ledger.subtotal, tax: ledger.tax, total: ledger.total });
  assert.equal(figures.rows[0].gstPercent, 5);
});

test('invoice applies the same coupon rules as order pricing', () => {
  const items = [{ name: 'Tea', hsn: '0902', price: 100, qty: 1 }];
  const ledger = pricing.computeTotals(items, 'WELCOME');
  const figures = invoice.computeInvoiceFigures({ items, coupon: 'WELCOME' });

  assert.deepEqual({ discount: ledger.discount, tax: ledger.tax, total: ledger.total },
    { discount: 5, tax: 17.1, total: 112.1 });
  assert.deepEqual({ discount: figures.discount, tax: figures.tax, total: figures.total },
    { discount: 5, tax: 17.1, total: 112.1 });

  const belowMinimum = invoice.computeInvoiceFigures({ items, coupon: 'SAVE10' });
  assert.equal(belowMinimum.discount, 0);
});

test('invoice reports tax rounded per line, matching order pricing', () => {
  const items = [
    { name: 'A', price: 0.05, qty: 1, gstRate: 10 },
    { name: 'B', price: 0.05, qty: 1, gstRate: 10 }
  ];
  const figures = invoice.computeInvoiceFigures({ items });
  assert.deepEqual(figures.rows.map(row => row.lineTax), [0.01, 0.01]);
  assert.equal(figures.tax, 0.02);
  assert.equal(figures.cgst, 0.01);
  assert.equal(figures.sgst, 0.01);
});

test('GST reconciliation does not count an invoice and ledger calculation mismatch', () => {
  const db = {
    orders: [{ id: 7, date: '2026-01-01', customer: 'Customer', status: 'completed',
      items: [{ name: 'Rice', hsn: '1006', price: 100, qty: 1 }],
      subtotal: 100, discount: 0, tax: 5, total: 105 }],
    products: [], customers: []
  };
  const reconciliation = reports.getGstReconciliation(db);
  assert.equal(reconciliation.mismatchCount, 0);
  assert.equal(reconciliation.rows[0].ledgerTax, 5);
  assert.equal(reconciliation.rows[0].invoiceTax, 5);
  assert.equal(reconciliation.rows[0].ledgerTotal, 105);
  assert.equal(reconciliation.rows[0].invoiceTotal, 105);
  assert.equal(reconciliation.rows[0].delta, 0);
});

test('invoice uses the same GST and total as the billed order', () => {
  const items = [{ id: 1, name: 'Rice', sku: 'RICE', hsn: '1006', price: 100, qty: 1 }];
  const ledger = pricing.computeTotals(items, '');
  const figures = invoice.computeInvoiceFigures({ items, ...ledger });

  assert.equal(figures.tax, ledger.tax);
  assert.equal(figures.total, ledger.total);
  assert.equal(figures.rows[0].gstPercent, 5);
});
