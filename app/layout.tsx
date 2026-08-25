import type { Metadata } from "next";
import "./globals.css";
import "./results/[id]/results.css";

export const metadata: Metadata = {
  title: "ArchBid AI — RFP Intelligence for Architecture Firms",
  description: "Analyze architecture RFPs, score opportunities, and identify compliance risks before your team spends days responding.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
