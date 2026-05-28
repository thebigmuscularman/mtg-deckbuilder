"use client";

import type { UploadMode } from "./types";

export function UploadStep({
  uploadMode,
  setUploadMode,
  pasteText,
  setPasteText,
  loading,
  onFile,
  onResolvePaste,
}: {
  uploadMode: UploadMode;
  setUploadMode: (mode: UploadMode) => void;
  pasteText: string;
  setPasteText: (text: string) => void;
  loading: boolean;
  onFile: (file: File) => void;
  onResolvePaste: () => void;
}) {
  return (
    <div className="fade-in-up space-y-4">
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={() => setUploadMode("file")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            uploadMode === "file"
              ? "bg-amber-600 text-stone-950"
              : "bg-stone-800 text-stone-400"
          }`}
        >
          Upload file
        </button>
        <button
          type="button"
          onClick={() => setUploadMode("paste")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            uploadMode === "paste"
              ? "bg-amber-600 text-stone-950"
              : "bg-stone-800 text-stone-400"
          }`}
        >
          Paste list
        </button>
      </div>

      {uploadMode === "file" ? (
        <div className="glass-panel relative overflow-hidden rounded-3xl p-10 text-center sm:p-14">
          <label className="relative block cursor-pointer">
            <input
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              disabled={loading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <span className="inline-flex flex-col items-center gap-5">
              <span className="text-xl font-semibold text-amber-50">
                {loading ? "Consulting Scryfall…" : "Upload your collection (.txt)"}
              </span>
              <span className="max-w-md text-sm text-stone-400">
                Moxfield / Manabox format supported.{" "}
                <a href="/sample-collection.txt" download className="text-amber-400 underline">
                  Sample file
                </a>
              </span>
            </span>
          </label>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl p-6">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"1 Lightning Bolt (MH2) 187\n4 Island (DMU) 280\n..."}
            rows={12}
            className="mb-4 w-full rounded-xl border border-stone-700/60 bg-stone-950/60 px-4 py-3 font-mono text-sm text-stone-100 placeholder:text-stone-600 focus:border-amber-500 focus:outline-none"
          />
          <button
            type="button"
            disabled={loading || !pasteText.trim()}
            onClick={onResolvePaste}
            className="rounded-xl bg-amber-600 px-6 py-2.5 font-bold text-stone-950 disabled:opacity-50"
          >
            {loading ? "Resolving…" : "Resolve collection"}
          </button>
        </div>
      )}
    </div>
  );
}
