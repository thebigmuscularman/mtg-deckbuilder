import { NextResponse } from "next/server";
import { parseCollectionText } from "@/lib/collection";
import { cardKey, resolveCollection } from "@/lib/scryfall";
import type {
  CollectionSummary,
  ResolvedCollectionCard,
} from "@/lib/types";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    let text: string;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: "Upload a .txt file with your collection." },
          { status: 400 },
        );
      }
      if (!file.name.toLowerCase().endsWith(".txt")) {
        return NextResponse.json(
          { error: "Only .txt files are supported." },
          { status: 400 },
        );
      }
      text = await file.text();
    } else {
      const body = await request.json();
      if (!body.text || typeof body.text !== "string") {
        return NextResponse.json(
          { error: "Provide collection text or upload a file." },
          { status: 400 },
        );
      }
      text = body.text;
    }

    const entries = parseCollectionText(text);

    if (!entries.length) {
      return NextResponse.json(
        { error: "No cards found. Use lines like: 4 Lightning Bolt" },
        { status: 400 },
      );
    }

    const scryfallMap = await resolveCollection(entries);

    const resolved: ResolvedCollectionCard[] = entries.map((entry) => {
      const key = cardKey(entry);
      const card = scryfallMap.get(key) ?? scryfallMap.get(entry.name.toLowerCase()) ?? null;
      return {
        entry,
        card,
        error: card ? undefined : `Could not find "${entry.name}" on Scryfall`,
      };
    });

    const summary: CollectionSummary = {
      totalEntries: entries.length,
      resolved: resolved.filter((r) => r.card),
      unresolved: resolved.filter((r) => !r.card),
    };

    return NextResponse.json({
      entries,
      resolved,
      summary,
      uniqueCount: new Set(
        resolved.filter((r) => r.card).map((r) => r.card!.id),
      ).size,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to resolve collection";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
