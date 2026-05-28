"use client";

import { useCallback, useMemo, useState } from "react";
import { parseSseChunk, type DeckResult } from "./types";

type StreamEvent =
  | { type: "progress"; status?: string; tokenDelta?: string }
  | { type: "done"; result: DeckResult }
  | { type: "error"; error: string };

function dispatchSseEvent(
  event: string,
  data: string,
  onEvent: (ev: StreamEvent) => void,
): void {
  if (event === "progress") {
    const parsed = JSON.parse(data) as {
      type?: string;
      message?: string;
      delta?: string;
    };
    onEvent({
      type: "progress",
      status: parsed.type === "status" ? parsed.message : undefined,
      tokenDelta: parsed.type === "token" ? parsed.delta : undefined,
    });
  } else if (event === "done") {
    const payload = JSON.parse(data);
    onEvent({
      type: "done",
      result: {
        deck: payload.deck,
        enriched: payload.enriched,
        validation: payload.validation,
      },
    });
  } else if (event === "error") {
    const payload = JSON.parse(data);
    onEvent({ type: "error", error: payload.error ?? "Build failed" });
  }
}

function drainSseBuffer(buffer: string, onEvent: (ev: StreamEvent) => void): string {
  const { events, rest } = parseSseChunk(buffer);
  for (const { event, data } of events) {
    dispatchSseEvent(event, data, onEvent);
  }
  return rest;
}

async function readSse(
  res: Response,
  onEvent: (ev: StreamEvent) => void,
): Promise<void> {
  if (!res.body) throw new Error("No stream body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      buffer = drainSseBuffer(buffer, onEvent);
    }
    if (done) break;
  }
  if (buffer.trim()) {
    drainSseBuffer(
      buffer.endsWith("\n\n") ? buffer : `${buffer}\n\n`,
      onEvent,
    );
  }
}

async function postJson<T>(
  path: string,
  body: unknown,
  fallbackError: string,
): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // Catch handles non-JSON error bodies (e.g. Next.js HTML 500 page) so the
    // user sees `fallbackError` instead of an opaque JSON parse failure.
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? fallbackError);
  }
  return (await res.json()) as T;
}

export type BrewApi = {
  loading: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  streamStatus: string;
  streamPreview: string;
  call: <T = DeckResult>(path: string, body: unknown) => Promise<T | null>;
  stream: (
    path: string,
    body: unknown,
    onDone: (result: DeckResult) => void,
  ) => Promise<void>;
  swap: <T = DeckResult>(
    path: string,
    body: unknown,
    cardName: string,
  ) => Promise<T | null>;
  swappingCard: string | null;
};

export function useBrewApi(): BrewApi {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState("");
  const [streamPreview, setStreamPreview] = useState("");
  const [swappingCard, setSwappingCard] = useState<string | null>(null);

  const call = useCallback(
    async <T,>(path: string, body: unknown): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        return await postJson<T>(path, body, "Request failed");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const stream = useCallback(
    async (
      path: string,
      body: unknown,
      onDone: (result: DeckResult) => void,
    ) => {
      setLoading(true);
      setError(null);
      setStreamStatus("Connecting…");
      setStreamPreview("");
      try {
        const res = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Stream failed");
        }
        await readSse(res, (ev) => {
          if (ev.type === "progress") {
            if (ev.status) setStreamStatus(ev.status);
            if (ev.tokenDelta)
              setStreamPreview((p) => (p + ev.tokenDelta).slice(-800));
          } else if (ev.type === "done") {
            onDone(ev.result);
          } else if (ev.type === "error") {
            throw new Error(ev.error);
          }
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Stream failed");
      } finally {
        setLoading(false);
        setStreamStatus("");
        setStreamPreview("");
      }
    },
    [],
  );

  const swap = useCallback(
    async <T,>(path: string, body: unknown, cardName: string) => {
      setSwappingCard(cardName);
      setError(null);
      try {
        return await postJson<T>(path, body, "Swap failed");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Swap failed");
        return null;
      } finally {
        setSwappingCard(null);
      }
    },
    [],
  );

  // Memoize so downstream useCallback / useEffect dep arrays are stable
  // across renders that didn't actually change any of these values.
  return useMemo(
    () => ({
      loading,
      error,
      setError,
      streamStatus,
      streamPreview,
      call,
      stream,
      swap,
      swappingCard,
    }),
    [loading, error, streamStatus, streamPreview, call, stream, swap, swappingCard],
  );
}
