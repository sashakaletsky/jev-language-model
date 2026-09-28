import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
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

// Applies a saved theme before the first paint so the page never flashes the wrong one.
// Without a saved choice the CSS follows the system preference.
const themeInit = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={GeistSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
