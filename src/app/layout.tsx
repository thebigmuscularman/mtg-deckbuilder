import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "mana-font/css/mana.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MTG Deckbrewer — AI deck builder from your collection",
  description:
    "Upload your Magic: The Gathering collection and build Standard, Modern, or Commander decks with AI. Card data from Scryfall.",
};

export const viewport: Viewport = {
  themeColor: "#0a0807",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
