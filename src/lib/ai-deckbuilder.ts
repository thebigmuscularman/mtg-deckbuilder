import OpenAI from "openai";
import { z } from "zod";
import { collectionToPromptList } from "./collection";
import { formatRulesPrompt } from "./formats";
import { validateDeck } from "./deck-validation";
import type {
  BuiltDeck,
  FormatId,
  ResolvedCollectionCard,
} from "./types";
import { getDisplayName } from "./scryfall";

const cardLineSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  reason: z.string().optional(),
});

const deckSchema = z.object({
  name: z.string(),
  description: z.string(),
  commander: z.string().nullable(),
  commanderReason: z.string().optional(),
  mainboard: z.array(cardLineSchema),
  sideboard: z.array(cardLineSchema),
  strategy: z.string(),
  warnings: z.array(z.string()).optional(),
});

function buildCollectionContext(resolved: ResolvedCollectionCard[]): string {
  const playable = resolved
    .filter((r) => r.card)
    .map((r) => ({
      name: getDisplayName(r.card!),
      quantity: r.entry.quantity,
      typeLine: r.card!.type_line,
      colors: r.card!.color_identity,
    }));

  return collectionToPromptList(playable);
}

function systemPrompt(format: FormatId): string {
  return `You are an expert Magic: The Gathering deck architect.

You build COMPLETE, playable, competitive-leaning decks using ONLY cards from the user's collection list.

${formatRulesPrompt(format)}

Design principles:
- Include a coherent game plan (aggro, control, midrange, combo, etc.)
- Respect mana curve: enough lands, early plays, meaningful top-end where appropriate
- Include removal, card draw, or interaction where the format expects it
- For Commander: pick the best commander from the collection for the available card pool; explain the synergy
- For 60-card formats: target exactly 60 mainboard cards; sideboard 0-15 if useful
- NEVER use a card not in the collection
- NEVER exceed owned quantities
- Use exact English card names as they appear on Scryfall

For EVERY card you include (mainboard, sideboard, and commander) give a short "reason" (one sentence, 8-20 words) explaining why it earns its slot in THIS deck — its role, synergy, or matchup it answers. Be specific to the deck's plan, not generic.

Respond with JSON only matching this schema:
{
  "name": "deck name",
  "description": "short summary",
  "commander": "Card Name or null",
  "commanderReason": "why this commander, or null",
  "mainboard": [{ "name": "Exact Card Name", "quantity": 4, "reason": "Cheap removal that swings tempo." }],
  "sideboard": [{ "name": "Exact Card Name", "quantity": 2, "reason": "Comes in vs aggro for early blockers." }],
  "strategy": "how to pilot the deck",
  "warnings": ["optional notes about missing pieces"]
}`;
}

function buildBaseUserMessage(
  format: FormatId,
  resolved: ResolvedCollectionCard[],
  strategyHint?: string,
): string {
  const collectionContext = buildCollectionContext(resolved);
  const unresolved = resolved.filter((r) => !r.card).map((r) => r.entry.name);

  let userMessage = `Build a ${format} deck from this collection:\n\n${collectionContext}`;
  if (strategyHint?.trim()) {
    userMessage += `\n\nUser preference: ${strategyHint.trim()}`;
  }
  if (unresolved.length) {
    userMessage += `\n\nNote: these collection lines could not be resolved on Scryfall — do NOT use them: ${unresolved.join(", ")}`;
  }
  return userMessage;
}

async function runDeckGeneration(
  format: FormatId,
  resolved: ResolvedCollectionCard[],
  baseMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  maxAttempts: number,
): Promise<{ deck: BuiltDeck; validationErrors: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local to enable AI deck building.",
    );
  }

  const client = new OpenAI({ apiKey });
  let lastErrors: string[] = [];
  let parsedDeck: z.infer<typeof deckSchema> | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [...baseMessages];

    if (attempt > 0 && lastErrors.length) {
      messages.push({
        role: "user",
        content: `Your previous list failed validation. Fix ALL issues and return corrected JSON only:\n${lastErrors.map((e) => `- ${e}`).join("\n")}`,
      });
    }

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("AI returned an empty response");

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error("AI returned invalid JSON");
    }

    const parsed = deckSchema.safeParse(json);
    if (!parsed.success) {
      lastErrors = parsed.error.issues.map((i) => i.message);
      continue;
    }
    parsedDeck = parsed.data;

    const deck: BuiltDeck = {
      ...parsed.data,
      format,
      warnings: parsed.data.warnings ?? [],
    };

    const validation = validateDeck(deck, resolved);
    if (validation.valid) {
      return { deck, validationErrors: [] };
    }

    lastErrors = validation.errors;
  }

  if (!parsedDeck) {
    throw new Error(`Deck generation failed: ${lastErrors.join("; ")}`);
  }

  const deck: BuiltDeck = {
    ...parsedDeck,
    format,
    warnings: [...(parsedDeck.warnings ?? []), ...lastErrors],
  };

  return { deck, validationErrors: lastErrors };
}

export async function buildDeckWithAI(
  format: FormatId,
  resolved: ResolvedCollectionCard[],
  strategyHint?: string,
): Promise<{ deck: BuiltDeck; validationErrors: string[] }> {
  const userMessage = buildBaseUserMessage(format, resolved, strategyHint);
  const baseMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt(format) },
    { role: "user", content: userMessage },
  ];
  return runDeckGeneration(format, resolved, baseMessages, 2);
}

export async function refineDeckWithAI(
  format: FormatId,
  resolved: ResolvedCollectionCard[],
  previousDeck: BuiltDeck,
  errors: string[],
  strategyHint?: string,
): Promise<{ deck: BuiltDeck; validationErrors: string[] }> {
  const userMessage = buildBaseUserMessage(format, resolved, strategyHint);
  const previousJson = JSON.stringify(
    {
      name: previousDeck.name,
      description: previousDeck.description,
      commander: previousDeck.commander,
      commanderReason: previousDeck.commanderReason,
      mainboard: previousDeck.mainboard,
      sideboard: previousDeck.sideboard,
      strategy: previousDeck.strategy,
    },
    null,
    2,
  );

  const baseMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt(format) },
    { role: "user", content: userMessage },
    { role: "assistant", content: previousJson },
    {
      role: "user",
      content: `That deck has these problems — fix EVERY one and return corrected JSON only:\n${errors
        .map((e) => `- ${e}`)
        .join(
          "\n",
        )}\n\nKeep the same overall game plan and as many of the existing card choices as possible. Only change what is necessary to satisfy the rules and quantities.`,
    },
  ];

  return runDeckGeneration(format, resolved, baseMessages, 3);
}
