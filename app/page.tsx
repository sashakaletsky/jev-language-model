import Image from "next/image";
import Predictor from "./Predictor";
import ThemeToggle from "./ThemeToggle";
import logo from "./logo.png";

const REPO = "https://github.com/sashakaletsky/jev-language-model";

export default function Home() {
  return (
    <main>
      <header className="topbar">
        <span className="wordmark">
          <Image src={logo} alt="" width={32} height={32} priority />
          Jev Language Model
        </span>
        <nav className="topnav" aria-label="Site">
          <a href={REPO}>GitHub</a>
          <ThemeToggle />
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">A demo built on TypeSafe&rsquo;s Jev</p>
        <h1>A language model built on top of Jev</h1>
        <p className="lede">Type the first word below.</p>
      </section>

      <Predictor>
        <section className="explainer">
          <p className="eyebrow">The rules</p>
          <ul>
            <li>
              <strong>Only Jev decides.</strong> No other model, no frequency tables, no prefix matching. Code sizes
              the shortlists from Jev&rsquo;s own probabilities and, above temperature zero, samples the suggestion from
              Jev&rsquo;s final distribution. Even whether a punctuation mark may come next is Jev&rsquo;s call.
            </li>
            <li>
              <strong>The blocks were built once, in advance.</strong> Words were grouped by theme and cut into 255s at
              build time; Jev only ever reads that static file.
            </li>
            <li>
              <strong>Everything is inspectable.</strong> Open Settings at the foot of the page and tick &ldquo;Show the
              raw Jev calls&rdquo; to see every request and response.
            </li>
          </ul>
          <p>
            Source, data and build scripts on <a href={REPO}>GitHub</a>. Word frequencies from{" "}
            <a href="https://github.com/rspeer/wordfreq">wordfreq</a> (CC-BY-SA 4.0).
          </p>
        </section>
      </Predictor>

      <footer className="site-footer">
        <p>
          Built (with, among other things, Jev) by <a href="https://x.com/SashaKaletsky">Sasha Kaletsky</a> from{" "}
          <a href="https://www.creator.ventures/">Creator Ventures</a>.
        </p>
      </footer>
    </main>
  );
}
