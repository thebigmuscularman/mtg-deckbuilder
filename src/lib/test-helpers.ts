import type { CollectionEntry, ResolvedCollectionCard, ScryfallCard } from "./types";

export function mockCard(
  overrides: Partial<ScryfallCard> & { name: string },
): ScryfallCard {
  const { name, ...rest } = overrides;
  return {
    id: rest.id ?? `id-${name.replace(/\s/g, "-").toLowerCase()}`,
    name,
    cmc: rest.cmc ?? 2,
    type_line: rest.type_line ?? "Creature",
    colors: rest.colors ?? [],
    color_identity: rest.color_identity ?? [],
    legalities: {
      modern: "legal",
      standard: "legal",
      pioneer: "legal",
      pauper: rest.rarity === "common" ? "legal" : "not_legal",
      commander: "legal",
      ...(rest.legalities ?? {}),
    },
    set: "tst",
    set_name: "Test",
    rarity: rest.rarity ?? "common",
    layout: "normal",
    oracle_text: rest.oracle_text,
    ...rest,
  };
}

export function resolved(
  entry: CollectionEntry,
  card: ScryfallCard | null,
): ResolvedCollectionCard {
  return { entry, card };
}
