import { NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface InvoiceData {
  invoiceNumber?: string;
  customerName: string;
  customerAddress?: string;
  property?: string;
  description: string;
  amount: number;
  date?: string;
  dueDate?: string;
  notes?: string;
  lineItems?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}

function generateInvoiceNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `INV-${year}${month}-${random}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function formatDate(dateStr?: string): string {
  const date = dateStr ? new Date(dateStr) : new Date();
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

async function generatePDF(data: InvoiceData): Promise<Uint8Array> {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();

  // Add a page (Letter size: 612 x 792 points)
  const page = pdfDoc.addPage([612, 792]);

  // Get fonts
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Colors
  const green = rgb(0.106, 0.369, 0.125); // #1B5E20
  const darkGray = rgb(0.2, 0.255, 0.333); // #334155
  const lightGray = rgb(0.396, 0.455, 0.522); // #64748B
  const white = rgb(1, 1, 1);

  const invoiceNumber = data.invoiceNumber || generateInvoiceNumber();
  const invoiceDate = formatDate(data.date);
  const dueDate = data.dueDate ? formatDate(data.dueDate) : formatDate(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  );

  let yPos = 742; // Start from top with margin

  // ===== HEADER =====
  // Company Name
  page.drawText("Mary's Financial Services", {
    x: 50,
    y: yPos,
    size: 24,
    font: helveticaBold,
    color: green,
  });

  // INVOICE label (right side)
  page.drawText('INVOICE', {
    x: 450,
    y: yPos,
    size: 28,
    font: helveticaBold,
    color: green,
  });

  yPos -= 20;

  // Company info
  const companyInfo = [
    '123 Business Avenue, Suite 100',
    'Los Angeles, CA 90001',
    'Phone: (555) 123-4567',
    'Email: billing@marysfinancial.com',
  ];

  for (const line of companyInfo) {
    page.drawText(line, {
      x: 50,
      y: yPos,
      size: 9,
      font: helvetica,
      color: lightGray,
    });
    yPos -= 12;
  }

  // Invoice details (right side)
  const invoiceDetails = [
    `Invoice #: ${invoiceNumber}`,
    `Date: ${invoiceDate}`,
    `Due Date: ${dueDate}`,
  ];

  let detailY = 722;
  for (const line of invoiceDetails) {
    page.drawText(line, {
      x: 450,
      y: detailY,
      size: 10,
      font: helvetica,
      color: darkGray,
    });
    detailY -= 14;
  }

  // ===== DIVIDER =====
  yPos -= 20;
  page.drawLine({
    start: { x: 50, y: yPos },
    end: { x: 562, y: yPos },
    thickness: 1,
    color: rgb(0.886, 0.91, 0.937), // #E2E8F0
  });

  yPos -= 25;

  // ===== BILL TO =====
  page.drawText('BILL TO:', {
    x: 50,
    y: yPos,
    size: 11,
    font: helveticaBold,
    color: green,
  });

  yPos -= 18;

  page.drawText(data.customerName, {
    x: 50,
    y: yPos,
    size: 11,
    font: helvetica,
    color: darkGray,
  });

  yPos -= 14;

  if (data.customerAddress) {
    page.drawText(data.customerAddress, {
      x: 50,
      y: yPos,
      size: 10,
      font: helvetica,
      color: darkGray,
    });
    yPos -= 14;
  }

  if (data.property) {
    yPos -= 5;
    page.drawText(`Property: ${data.property}`, {
      x: 50,
      y: yPos,
      size: 10,
      font: helvetica,
      color: lightGray,
    });
  }

  // ===== LINE ITEMS TABLE =====
  yPos -= 50;

  // Table header background
  page.drawRectangle({
    x: 50,
    y: yPos - 5,
    width: 512,
    height: 22,
    color: rgb(0.945, 0.961, 0.976), // #F1F5F9
  });

  // Table headers
  page.drawText('Description', {
    x: 60,
    y: yPos,
    size: 10,
    font: helveticaBold,
    color: darkGray,
  });

  page.drawText('Qty', {
    x: 360,
    y: yPos,
    size: 10,
    font: helveticaBold,
    color: darkGray,
  });

  page.drawText('Unit Price', {
    x: 410,
    y: yPos,
    size: 10,
    font: helveticaBold,
    color: darkGray,
  });

  page.drawText('Total', {
    x: 510,
    y: yPos,
    size: 10,
    font: helveticaBold,
    color: darkGray,
  });

  yPos -= 30;

  // Line items
  const lineItems = data.lineItems && data.lineItems.length > 0
    ? data.lineItems
    : [{
        description: data.description,
        quantity: 1,
        unitPrice: data.amount,
        total: data.amount,
      }];

  let subtotal = 0;

  for (const item of lineItems) {
    // Description (may wrap)
    const desc = item.description.length > 45
      ? item.description.substring(0, 45) + '...'
      : item.description;

    page.drawText(desc, {
      x: 60,
      y: yPos,
      size: 10,
      font: helvetica,
      color: darkGray,
    });

    page.drawText(item.quantity.toString(), {
      x: 365,
      y: yPos,
      size: 10,
      font: helvetica,
      color: darkGray,
    });

    page.drawText(formatCurrency(item.unitPrice), {
      x: 400,
      y: yPos,
      size: 10,
      font: helvetica,
      color: darkGray,
    });

    page.drawText(formatCurrency(item.total), {
      x: 500,
      y: yPos,
      size: 10,
      font: helvetica,
      color: darkGray,
    });

    subtotal += item.total;
    yPos -= 25;

    // Separator line
    page.drawLine({
      start: { x: 50, y: yPos + 10 },
      end: { x: 562, y: yPos + 10 },
      thickness: 0.5,
      color: rgb(0.886, 0.91, 0.937),
    });
  }

  // ===== TOTALS =====
  yPos -= 20;

  // Subtotal
  page.drawText('Subtotal:', {
    x: 410,
    y: yPos,
    size: 10,
    font: helvetica,
    color: lightGray,
  });

  page.drawText(formatCurrency(subtotal), {
    x: 500,
    y: yPos,
    size: 10,
    font: helvetica,
    color: lightGray,
  });

  yPos -= 18;

  // Tax
  page.drawText('Tax (0%):', {
    x: 410,
    y: yPos,
    size: 10,
    font: helvetica,
    color: lightGray,
  });

  page.drawText('$0.00', {
    x: 500,
    y: yPos,
    size: 10,
    font: helvetica,
    color: lightGray,
  });

  yPos -= 25;

  // Total Due - highlighted box
  page.drawRectangle({
    x: 390,
    y: yPos - 8,
    width: 172,
    height: 28,
    color: green,
  });

  page.drawText('TOTAL DUE:', {
    x: 400,
    y: yPos,
    size: 11,
    font: helveticaBold,
    color: white,
  });

  page.drawText(formatCurrency(subtotal), {
    x: 490,
    y: yPos,
    size: 11,
    font: helveticaBold,
    color: white,
  });

  // ===== NOTES =====
  if (data.notes) {
    yPos -= 60;

    page.drawText('Notes:', {
      x: 50,
      y: yPos,
      size: 11,
      font: helveticaBold,
      color: green,
    });

    yPos -= 15;

    page.drawText(data.notes.substring(0, 80), {
      x: 50,
      y: yPos,
      size: 10,
      font: helvetica,
      color: lightGray,
    });
  }

  // ===== FOOTER =====
  const footerY = 100;

  page.drawLine({
    start: { x: 50, y: footerY },
    end: { x: 562, y: footerY },
    thickness: 1,
    color: rgb(0.886, 0.91, 0.937),
  });

  page.drawText('Payment Terms: Net 30', {
    x: 50,
    y: footerY - 15,
    size: 9,
    font: helvetica,
    color: lightGray,
  });

  page.drawText("Please make checks payable to: Mary's Financial Services", {
    x: 50,
    y: footerY - 28,
    size: 9,
    font: helvetica,
    color: lightGray,
  });

  page.drawText('Thank you for your business!', {
    x: 230,
    y: footerY - 50,
    size: 11,
    font: helveticaBold,
    color: green,
  });

  // Save the PDF
  return await pdfDoc.save();
}

export async function POST(request: Request) {
  try {
    const data: InvoiceData = await request.json();

    // Validate required fields
    if (!data.customerName || !data.description || !data.amount) {
      return NextResponse.json(
        { error: 'Missing required fields: customerName, description, amount' },
        { status: 400 }
      );
    }

    // Generate the PDF
    const pdfBytes = await generatePDF(data);

    // Convert to base64 for preview
    const base64PDF = Buffer.from(pdfBytes).toString('base64');
    const dataUrl = `data:application/pdf;base64,${base64PDF}`;

    // Generate invoice number
    const invoiceNumber = data.invoiceNumber || generateInvoiceNumber();

    return NextResponse.json({
      success: true,
      invoiceNumber,
      pdfDataUrl: dataUrl,
      pdfBuffer: base64PDF,
      message: `Invoice ${invoiceNumber} generated successfully`,
      invoiceData: {
        ...data,
        invoiceNumber,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Invoice generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate invoice', details: String(error) },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve info about the API
export async function GET() {
  return NextResponse.json({
    message: 'Use POST to generate an invoice',
    requiredFields: ['customerName', 'description', 'amount'],
    optionalFields: ['property', 'invoiceNumber', 'date', 'dueDate', 'notes', 'customerAddress', 'lineItems'],
  });
}
