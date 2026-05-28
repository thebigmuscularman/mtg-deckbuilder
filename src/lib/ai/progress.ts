export type DeckBuildProgress =
  | { type: "status"; message: string }
  | { type: "token"; delta: string }
  | { type: "attempt"; attempt: number; maxAttempts: number };
