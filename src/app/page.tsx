import { DeckBuilderApp } from "@/components/DeckBuilderApp";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="mana-orb"
          style={{
            top: "10%",
            left: "10%",
            width: "320px",
            height: "320px",
            background: "rgba(245, 158, 11, 0.35)",
          }}
        />
        <div
          className="mana-orb mana-orb-alt"
          style={{
            top: "30%",
            right: "10%",
            width: "260px",
            height: "260px",
            background: "rgba(168, 85, 247, 0.28)",
            animationDelay: "3s",
          }}
        />
        <div
          className="mana-orb"
          style={{
            bottom: "10%",
            left: "20%",
            width: "300px",
            height: "300px",
            background: "rgba(56, 189, 248, 0.22)",
            animationDelay: "6s",
          }}
        />
        <div
          className="mana-orb mana-orb-alt"
          style={{
            bottom: "30%",
            right: "20%",
            width: "220px",
            height: "220px",
            background: "rgba(74, 222, 128, 0.18)",
            animationDelay: "9s",
          }}
        />
      </div>
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4' viewBox='0 0 4 4'%3E%3Cpath fill='%23fff' d='M1 3h1v1H1zM3 1h1v1H3z'/%3E%3C/svg%3E\")",
        }}
      />
      <DeckBuilderApp />
    </div>
  );
}
