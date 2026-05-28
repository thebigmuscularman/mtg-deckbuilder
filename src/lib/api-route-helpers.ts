import { NextResponse } from "next/server";
import { validateDeck } from "./deck-validation";
import type { BuiltDeck, ResolvedCollectionCard } from "./types";

export function badRequest(error: string, details?: unknown) {
  return NextResponse.json(
    details ? { error, details } : { error },
    { status: 400 },
  );
}

export function serverError(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}

export function deckResponse(
  result: { deck: BuiltDeck; validationErrors: string[] },
  playable: ResolvedCollectionCard[],
  allowIllegal?: boolean,
) {
  const v = validateDeck(result.deck, playable, { allowIllegal });
  return NextResponse.json({
    deck: result.deck,
    validation: { valid: v.valid, errors: v.errors, warnings: v.warnings },
    validationErrors: result.validationErrors,
    enriched: {
      mainboard: v.enrichedMainboard,
      sideboard: v.enrichedSideboard,
      commander: v.commanderCard,
    },
  });
}

export function playableFrom(
  resolved: ResolvedCollectionCard[],
): ResolvedCollectionCard[] {
  return resolved.filter((r) => r.card);
}
