import Predictor from "./Predictor";
import ThemeToggle from "./ThemeToggle";

const REPO = "https://github.com/sashakaletsky/jev-language-model";

export default function Home() {
  return (
    <main>
      <header className="topbar">
        <span className="wordmark">Jev Language Model</span>
        <nav className="topnav" aria-label="Site">
          <a href={REPO}>GitHub</a>
          <ThemeToggle />
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">A research demo built on TypeSafe&rsquo;s Jev</p>
        <h1>A language model that can only choose.</h1>
        <p className="lede">
          <a href="https://typesafe.ai">Jev</a> can&rsquo;t write. It picks one of up to 255 options and says how sure
          it is of each. So the 65,025 most common English words sit in 255 themed blocks of 255, and after every word
          Jev is asked three questions: which blocks could hold the next word, which words within each of them, then
          which of those 255. Type below. Tab accepts.
        </p>
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
