import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LLM Moodboard",
  description: "Your week in music, explained by AI."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
