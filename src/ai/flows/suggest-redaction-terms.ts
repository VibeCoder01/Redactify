// src/ai/flows/suggest-redaction-terms.ts
'use server';

/**
 * @fileOverview This file defines a Genkit flow for suggesting redaction terms based on common sensitive information types in a given text.
 *
 * The flow takes text as input and returns a list of suggested redaction terms.
 * - suggestRedactionTerms - A function that handles the suggestion of redaction terms.
 * - SuggestRedactionTermsInput - The input type for the suggestRedactionTerms function.
 * - SuggestRedactionTermsOutput - The return type for the suggestRedactionTerms function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestRedactionTermsInputSchema = z.object({
  text: z.string().describe('The text from which to suggest redaction terms.'),
});
export type SuggestRedactionTermsInput = z.infer<typeof SuggestRedactionTermsInputSchema>;

const SuggestRedactionTermsOutputSchema = z.object({
  terms: z.array(z.string()).describe('An array of suggested redaction terms.'),
});
export type SuggestRedactionTermsOutput = z.infer<typeof SuggestRedactionTermsOutputSchema>;

export async function suggestRedactionTerms(input: SuggestRedactionTermsInput): Promise<SuggestRedactionTermsOutput> {
  return suggestRedactionTermsFlow(input);
}

const suggestRedactionTermsPrompt = ai.definePrompt({
  name: 'suggestRedactionTermsPrompt',
  input: {schema: SuggestRedactionTermsInputSchema},
  output: {schema: SuggestRedactionTermsOutputSchema},
  prompt: `You are an AI assistant that suggests terms or phrases for redaction based on common sensitive information types (e.g., PII) in a given text.

  Given the following text:
  {{text}}

  Suggest a list of terms or phrases that should be considered for redaction. Return the terms in an array. Do not explain your reasoning.
  `,
});

const suggestRedactionTermsFlow = ai.defineFlow(
  {
    name: 'suggestRedactionTermsFlow',
    inputSchema: SuggestRedactionTermsInputSchema,
    outputSchema: SuggestRedactionTermsOutputSchema,
  },
  async input => {
    const {output} = await suggestRedactionTermsPrompt(input);
    return output!;
  }
);
