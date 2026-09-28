import Predictor from "./Predictor";

const REPO = "https://github.com/sashakaletsky/jev-language-model";

export default function Home() {
  return (
    <main>
      <header className="hero">
        <h1>Jev Language Model</h1>
        <p className="lede">
          A next-word predictor built entirely from <a href="https://typesafe.ai">Jev</a>, TypeSafe&rsquo;s System One
          decision model. Jev cannot generate text. It can only choose between options, at most 255 at a time. So this
          site gives it a dictionary of 65,025 words arranged as 255 themed blocks of 255, and for every keystroke asks it
          two questions: <em>which block is the next word in?</em> and then <em>which word is it?</em>
        </p>
      </header>

      <Predictor />

      <section className="explainer">
        <h2>The rules of the experiment</h2>
        <ul>
          <li>
            <strong>Only Jev decides.</strong> No other model, no n-grams, no frequency tables and no prefix matching
            are used at inference time. Code splits the text into what has been typed and the partial word, sends both
            questions, multiplies the two probabilities Jev returns, and sorts.
          </li>
          <li>
            <strong>Two choices per keystroke.</strong> Level 1 is a 255-option choice between blocks. Level 2 is a
            255-option choice between that block&rsquo;s words. Both answers come back as full probability
            distributions, which is what the panel shows.
          </li>
          <li>
            <strong>The dictionary was arranged once, in advance.</strong> The 65,025 most frequent English words,
            including contractions and slang, were grouped into themes at build time and cut into blocks of 255. That
            arrangement is a static file in the repository; Jev only ever reads block descriptions and word lists from
            it.
          </li>
          <li>
            <strong>Everything is inspectable.</strong> Tick &ldquo;Show the raw Jev calls&rdquo; to see the exact
            requests and responses behind any suggestion.
          </li>
        </ul>
        <p>
          Source, data and the build scripts are on <a href={REPO}>GitHub</a>. Word frequencies come from{" "}
          <a href="https://github.com/rspeer/wordfreq">wordfreq</a> (data CC-BY-SA 4.0).
        </p>
      </section>
    </main>
  );
}
