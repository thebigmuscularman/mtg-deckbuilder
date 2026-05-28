import { describe, expect, it } from "vitest";
import { parseSseChunk } from "./types";

describe("parseSseChunk", () => {
  it("parses a terminal done event", () => {
    const chunk = 'event: done\ndata: {"deck":{"name":"Test"}}\n\n';
    const { events, rest } = parseSseChunk(chunk);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("done");
    expect(JSON.parse(events[0].data).deck.name).toBe("Test");
    expect(rest).toBe("");
  });

  it("buffers an incomplete frame until the delimiter arrives", () => {
    const part1 = 'event: done\ndata: {"ok":true}';
    const { events: e1, rest: r1 } = parseSseChunk(part1);
    expect(e1).toHaveLength(0);
    expect(r1).toBe(part1);

    const { events: e2, rest: r2 } = parseSseChunk(r1 + "\n\n");
    expect(e2).toHaveLength(1);
    expect(e2[0].event).toBe("done");
    expect(r2).toBe("");
  });
});
