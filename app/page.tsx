import Predictor from "./Predictor";

const REPO = "https://github.com/sashakaletsky/jev-language-model";

export default function Home() {
  return (
    <main>
      <header className="hero">
        <h1>Jev Language Model</h1>
        <p className="lede">
          A next-word predictor built entirely from <a href="https://typesafe.ai">Jev</a>, TypeSafe&rsquo;s decision
          model. Jev can&rsquo;t write; it can only pick one of up to 255 options. So the 65,025 most common English
          words sit in 255 themed blocks of 255, and after every word Jev is asked three questions: which blocks could
          hold the next word, which words in each of them, then which of those 255. Tab accepts.
        </p>
      </header>

      <Predictor />

      <section className="explainer">
        <h2>The rules</h2>
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
            <strong>Everything is inspectable.</strong> Tick &ldquo;Show the raw Jev calls&rdquo; to see the exact
            requests and responses.
          </li>
        </ul>
        <p>
          Source, data and build scripts on <a href={REPO}>GitHub</a>. Word frequencies from{" "}
          <a href="https://github.com/rspeer/wordfreq">wordfreq</a> (CC-BY-SA 4.0).
        </p>
      </section>
    </main>
  );
}
