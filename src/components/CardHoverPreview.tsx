"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { getCardImage, getDisplayName } from "@/lib/scryfall";
import type { ScryfallCard } from "@/lib/types";

export function CardHoverPreview({
  card,
  children,
}: {
  card: ScryfallCard | null;
  children: ReactNode;
}) {
  if (!card) return <>{children}</>;

  const image = getCardImage(card);
  const large =
    card.image_uris?.large ?? card.card_faces?.[0]?.image_uris?.large ?? image;
  const name = getDisplayName(card);

  return (
    <span className="group/preview relative inline-flex max-w-full">
      {children}
      {large && (
        <span className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 hidden w-[280px] opacity-0 transition group-hover/preview:block group-hover/preview:opacity-100 sm:left-1/2 sm:-translate-x-1/2">
          <span className="block overflow-hidden rounded-xl border border-amber-700/50 bg-stone-950 shadow-2xl shadow-black/60 ring-2 ring-amber-500/30">
            <div className="relative aspect-[488/680] w-full">
              <Image
                src={large}
                alt={name}
                fill
                sizes="280px"
                className="object-cover"
                unoptimized
              />
            </div>
            {card.oracle_text && (
              <p className="max-h-32 overflow-y-auto border-t border-stone-800 p-3 text-xs leading-relaxed text-stone-300">
                {card.oracle_text}
              </p>
            )}
          </span>
        </span>
      )}
    </span>
  );
}
