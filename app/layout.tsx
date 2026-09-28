import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jev Language Model",
  description:
    "A next-word predictor built entirely from Jev, TypeSafe's System One decision model: two 255-way choices per keystroke, no text generation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
