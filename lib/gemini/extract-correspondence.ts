import { z } from "zod";
import type { FieldEvidenceMap } from "./field-evidence";
import { getGeminiModel, parseJsonResponse } from "./client";
import { generateStructuredJson, StructuredJsonError } from "./structured-json";
import { correspondenceResponseSchema } from "./response-schemas";

// Zod schemas
const ActionItemSchema = z.object({
  action: z.string(),
  assignee: z.string().nullable(),
  due_date: z.string().nullable(),
});

const CorrespondenceResponseSchema = z.object({
  sender: z.string().nullable(),
  sender_organization: z.string().nullable(),
  recipient: z.string().nullable(),
  recipient_organization: z.string().nullable(),
  date: z.string().nullable(),
  subject: z.string().nullable(),
  summary: z.string().nullable(),
  correspondence_type: z.string().nullable(),
  action_items: z.array(ActionItemSchema).optional(),
  urgency: z.string().nullable(),
});

// Export types
export type ActionItem = z.infer<typeof ActionItemSchema>;
export type CorrespondenceExtraction = z.infer<typeof CorrespondenceResponseSchema> & {
  confidence: number;
  raw_response: string;
  field_evidence?: FieldEvidenceMap;
};

const EXTRACTION_PROMPT = `You are a correspondence data extraction assistant. Extract structured data from the following letter, email, or notice text.

IMPORTANT INSTRUCTIONS:
1. Return ONLY valid JSON, no markdown code blocks, no explanations
2. Use null for any fields you cannot find or are uncertain about
3. Parse dates into ISO format (YYYY-MM-DD)
4. For correspondence_type, identify: letter, email, memo, notice, announcement, or other
5. Extract any action items or requests mentioned in the text

Return this exact JSON structure:
{
  "sender": "sender name or null",
  "sender_organization": "sender's company/org or null",
  "recipient": "recipient name or null",
  "recipient_organization": "recipient's company/org or null",
  "date": "YYYY-MM-DD or null",
  "subject": "subject line or topic or null",
  "summary": "brief 1-2 sentence summary of the content or null",
  "correspondence_type": "letter|email|memo|notice|announcement|other or null",
  "action_items": [
    {
      "action": "description of action needed",
      "assignee": "who should do it or null",
      "due_date": "YYYY-MM-DD or null"
    }
  ],
  "urgency": "high|medium|low or null"
}

CORRESPONDENCE TEXT:
`;

function calculateConfidence(data: z.infer<typeof CorrespondenceResponseSchema>): number {
  const fields = [
    data.sender,
    data.recipient,
    data.date,
    data.subject,
    data.summary,
    data.correspondence_type,
  ];

  const extractedFields = fields.filter((f) => f !== null && f !== undefined).length;
  const totalFields = fields.length;

  const hasActionItems = data.action_items && data.action_items.length > 0;
  const bonus = hasActionItems ? 0.1 : 0;

  const baseConfidence = extractedFields / totalFields;
  return Math.min(1, baseConfidence + bonus);
}

function parseResponse(rawResponse: string): z.infer<typeof CorrespondenceResponseSchema> {
  const parsed = parseJsonResponse<Record<string, unknown>>(rawResponse);
  return CorrespondenceResponseSchema.parse(parsed);
}

export async function extractCorrespondence(rawText: string): Promise<CorrespondenceExtraction> {
  const model = getGeminiModel();
  const prompt = EXTRACTION_PROMPT + rawText.slice(0, 12000);
  let rawResponse = "";

  try {
    const { parsed, rawResponse: modelRaw } = await generateStructuredJson({
      model,
      prompt,
      schema: correspondenceResponseSchema,
      label: "correspondence extraction",
      attempts: [
        { temperature: 0.1, maxOutputTokens: 1200 },
        {
          temperature: 0,
          maxOutputTokens: 1800,
          promptSuffix:
            "Return one JSON object only. No preface, no explanation, no markdown.",
        },
      ],
      parser: parseResponse,
    });
    rawResponse = modelRaw;

    return {
      sender: parsed.sender ?? null,
      sender_organization: parsed.sender_organization ?? null,
      recipient: parsed.recipient ?? null,
      recipient_organization: parsed.recipient_organization ?? null,
      date: parsed.date ?? null,
      subject: parsed.subject ?? null,
      summary: parsed.summary ?? null,
      correspondence_type: parsed.correspondence_type ?? null,
      action_items: parsed.action_items || [],
      urgency: parsed.urgency ?? null,
      confidence: calculateConfidence(parsed),
      raw_response: rawResponse,
    };
  } catch (error) {
    if (error instanceof StructuredJsonError && error.diagnostics?.rawResponse) {
      rawResponse = error.diagnostics.rawResponse;
    }
    if (error instanceof StructuredJsonError && error.diagnostics?.finishReason) {
      console.warn(
        `  Correspondence extraction finish reason: ${error.diagnostics.finishReason}` +
          (error.diagnostics.finishMessage ? ` (${error.diagnostics.finishMessage})` : "")
      );
    }

    return {
      sender: null,
      sender_organization: null,
      recipient: null,
      recipient_organization: null,
      date: null,
      subject: null,
      summary: null,
      correspondence_type: null,
      action_items: [],
      urgency: null,
      confidence: 0,
      raw_response: rawResponse,
    };
  }

  return {
    sender: null,
    sender_organization: null,
    recipient: null,
    recipient_organization: null,
    date: null,
    subject: null,
    summary: null,
    correspondence_type: null,
    action_items: [],
    urgency: null,
    confidence: 0,
    raw_response: rawResponse,
  };
}
