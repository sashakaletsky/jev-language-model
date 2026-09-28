"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { subscribeTheme } from "./theme";
import logoDark from "./cv-logo-dark.png";
import logoLight from "./cv-logo-light.png";

/**
 * The hand-drawn Creator Ventures wordmark in the footer: a short animation
 * per colour scheme, and a still frame when the visitor prefers reduced
 * motion. CSS shows the variant that matches the theme.
 */

// Raw markup on purpose: React leaves the `muted` attribute out of server-rendered
// video, and browsers then refuse to autoplay it.
const video = (mode: "light" | "dark") =>
  `<video class="${mode}" autoplay muted loop playsinline preload="metadata" width="600" height="186">` +
  `<source src="/cv-logo-${mode}.webm" type="video/webm"><source src="/cv-logo-${mode}.mp4" type="video/mp4"></video>`;
const videos = video("light") + video("dark");

export default function CvLogo() {
  const ref = useRef<HTMLAnchorElement>(null);

  // A video that was hidden when the page loaded does not start on its own when the
  // theme changes and it appears, so play whichever one CSS is showing.
  useEffect(() => {
    const sync = () => {
      for (const v of ref.current?.querySelectorAll("video") ?? []) {
        const shown = getComputedStyle(v).display !== "none";
        if (shown && v.paused) void v.play().catch(() => {});
        else if (!shown && !v.paused) v.pause();
      }
    };
    sync();
    return subscribeTheme(sync);
  }, []);

  return (
    <a ref={ref} className="cv-logo" href="https://www.creator.ventures/" aria-label="Creator Ventures">
      <span className="motion" aria-hidden="true" dangerouslySetInnerHTML={{ __html: videos }} />
      <span className="still" aria-hidden="true">
        <Image className="light" src={logoLight} alt="" />
        <Image className="dark" src={logoDark} alt="" />
      </span>
    </a>
  );
}
