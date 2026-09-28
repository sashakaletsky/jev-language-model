import type { Metadata } from "next";
import "./globals.css";

const description =
  "A next-word predictor built entirely from Jev, TypeSafe's System One decision model: three 255-way choices per word, no text generation.";

export const metadata: Metadata = {
  metadataBase: new URL("https://jevlanguagemodel.com"),
  title: "Jev Language Model",
  description,
  openGraph: {
    title: "Jev Language Model",
    description,
    url: "https://jevlanguagemodel.com",
    siteName: "Jev Language Model",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Jev Language Model",
    description,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
