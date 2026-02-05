import { SchemaType, type ResponseSchema, type Schema } from "@google/generative-ai";

function stringSchema(nullable = false): Schema {
  return { type: SchemaType.STRING, ...(nullable ? { nullable: true } : {}) };
}

function enumSchema(values: string[], nullable = false): Schema {
  return {
    type: SchemaType.STRING,
    format: "enum",
    enum: values,
    ...(nullable ? { nullable: true } : {}),
  };
}

function numberSchema(nullable = false): Schema {
  return { type: SchemaType.NUMBER, ...(nullable ? { nullable: true } : {}) };
}

function arraySchema(items: Schema, nullable = false): Schema {
  return { type: SchemaType.ARRAY, items, ...(nullable ? { nullable: true } : {}) };
}

function objectSchema(properties: Record<string, Schema>, required?: string[]): Schema {
  return {
    type: SchemaType.OBJECT,
    properties,
    required: required ?? Object.keys(properties),
  };
}

export const classificationResponseSchema: ResponseSchema = objectSchema({
  documentType: enumSchema([
    "receipt",
    "invoice",
    "bank_statement",
    "contract",
    "tax_form",
    "correspondence",
    "other",
  ]),
  confidence: numberSchema(false),
  reasoning: stringSchema(false),
});

const invoiceLineItemSchema = objectSchema({
  description: stringSchema(false),
  quantity: numberSchema(true),
  unit_price: numberSchema(true),
  amount: numberSchema(true),
});

export const invoiceResponseSchema: ResponseSchema = objectSchema({
  vendor: stringSchema(true),
  invoice_number: stringSchema(true),
  invoice_date: stringSchema(true),
  due_date: stringSchema(true),
  subtotal: numberSchema(true),
  tax: numberSchema(true),
  total: numberSchema(true),
  line_items: arraySchema(invoiceLineItemSchema, true),
});

const receiptItemSchema = objectSchema({
  description: stringSchema(false),
  quantity: numberSchema(true),
  unit_price: numberSchema(true),
  amount: numberSchema(true),
});

export const receiptResponseSchema: ResponseSchema = objectSchema({
  merchant_name: stringSchema(true),
  date: stringSchema(true),
  total: numberSchema(true),
  payment_method: stringSchema(true),
  items: arraySchema(receiptItemSchema, true),
  subtotal: numberSchema(true),
  tax: numberSchema(true),
  tip: numberSchema(true),
});

const transactionSchema = objectSchema({
  date: stringSchema(true),
  description: stringSchema(false),
  amount: numberSchema(true),
  type: enumSchema(["deposit", "withdrawal", "transfer", "fee", "other"], true),
  balance: numberSchema(true),
});

export const bankStatementResponseSchema: ResponseSchema = objectSchema({
  bank_name: stringSchema(true),
  account_number_last4: stringSchema(true),
  statement_period_start: stringSchema(true),
  statement_period_end: stringSchema(true),
  opening_balance: numberSchema(true),
  closing_balance: numberSchema(true),
  total_deposits: numberSchema(true),
  total_withdrawals: numberSchema(true),
  transactions: arraySchema(transactionSchema, true),
});

const partySchema = objectSchema({
  name: stringSchema(false),
  role: stringSchema(true),
  address: stringSchema(true),
});

const keyTermSchema = objectSchema({
  term: stringSchema(false),
  description: stringSchema(false),
});

export const contractResponseSchema: ResponseSchema = objectSchema({
  contract_type: stringSchema(true),
  parties: arraySchema(partySchema, true),
  effective_date: stringSchema(true),
  expiration_date: stringSchema(true),
  value: numberSchema(true),
  key_terms: arraySchema(keyTermSchema, true),
  governing_law: stringSchema(true),
  termination_clause: stringSchema(true),
});

export const taxFormResponseSchema: ResponseSchema = objectSchema({
  form_type: stringSchema(true),
  tax_year: numberSchema(true),
  entity_name: stringSchema(true),
  entity_type: stringSchema(true),
  ein_last4: stringSchema(true),
  ssn_last4: stringSchema(true),
  address: stringSchema(true),
  total_income: numberSchema(true),
  total_tax: numberSchema(true),
  tax_withheld: numberSchema(true),
  refund_or_owed: numberSchema(true),
});

const actionItemSchema = objectSchema({
  action: stringSchema(false),
  assignee: stringSchema(true),
  due_date: stringSchema(true),
});

export const correspondenceResponseSchema: ResponseSchema = objectSchema({
  sender: stringSchema(true),
  sender_organization: stringSchema(true),
  recipient: stringSchema(true),
  recipient_organization: stringSchema(true),
  date: stringSchema(true),
  subject: stringSchema(true),
  summary: stringSchema(true),
  correspondence_type: stringSchema(true),
  action_items: arraySchema(actionItemSchema, true),
  urgency: stringSchema(true),
});
