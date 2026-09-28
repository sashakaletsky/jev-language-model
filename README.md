# Jev Language Model

A next-word predictor built entirely from [Jev](https://typesafe.ai), TypeSafe's System One decision model.

Jev cannot generate text. It answers typed questions: pick one of up to 255 options, and say how
confident it is about each. This project asks whether that is enough to behave like a language model.
You type a word, it predicts the next one, you press **Tab** to accept.

**No other model is involved at inference time.** No n-grams, no frequency tables, no prefix matching.
Every suggestion is the product of two Jev decisions and nothing else.

## How it works

The 65,025 most frequent English words (that is 255 × 255, contractions and slang included) are
arranged into **255 themed blocks of 255 words**. The word is the unit: after every finished word the
server asks Jev three questions about the text so far (nothing is asked mid-word):

1. **Level 1 (255 options):** which themed block contains the word this person is about to type?
   Jev sees each block's theme and a few example words. The thirty likeliest blocks are opened
   (configurable up to fifty).
2. **Level 2 (255 options per opened block, asked in parallel batches of ten):** within each opened
   block, which word is it? Each block then contributes a shortlist, sized in proportion to its level-1
   probability with a small floor so every opened block is represented, and the shortlists together
   make exactly 255 candidates.
3. **Level 3 (255 options):** which of those candidates is it? Each is shown in place at the end of the
   text, so Jev compares "Hello how are" against "Hello how you" as phrases.

Every question is framed as filling in a blank: Jev sees the text with `____` where the next word goes
(`Hello how ____`) and a few worked examples. The instructions ask for the
word an articulate person, speaking clearly, would most naturally say next, and spell out that speech moves
forward rather than piling up synonyms. That framing matters: asked plainly "what comes next?", a decision
model tends to favour words that already appear in the text and ends up repeating the last word, or
stringing adjectives together.

Punctuation is offered the same way: `.` `,` `?` and `!` are four of the 255 options in the core block, so
Jev can end a sentence or pause it instead of choosing a word. Whether a mark may come next is also
Jev's call: a small question rides along with level 1, "what is the very last character of the
text?", with the marks spelled out as options, and the four marks are in the shortlist only when Jev
says a letter or digit. The state carries the last few words as a separate `tail` field so the ending
is easy to inspect. Without that, a stray full stop echoes into `..` and `...`. After a sentence ends, the level-3 candidates are shown capitalised in place
(`the world. Offers`), and the instructions say a new sentence should begin a new thought rather than
restate the last one.

Jev returns a full probability distribution for each question. At temperature 0 the top level-3 word is
the suggestion; above 0 the suggestion is sampled from the nucleus of the distribution (the smallest set
of candidates covering 90% of the probability) in proportion to p^(1/T), so the second or third choice
sometimes wins without junk from the tail ever being suggested. Code does nothing else: it straightens curly apostrophes and bounds the context sent
([`lib/tokenize.ts`](lib/tokenize.ts)),
sizes the shortlists from Jev's own probabilities, and samples. See [`lib/predict.ts`](lib/predict.ts).

The site shows all three decisions for every word, with probabilities, latency and token usage, and
can display the exact request and response JSON of each Jev call.

## The dictionary and its blocks

Built once, in advance, and committed as plain data. Jev never sees anything else.

| File | What it is | How it was made |
| --- | --- | --- |
| `data/words.json` | 65,025 words in frequency order | [`scripts/build_words.py`](scripts/build_words.py): walk [wordfreq](https://github.com/rspeer/wordfreq)'s English list from most to least frequent, keep purely alphabetic tokens (apostrophes allowed, so `it's` and `wouldn't` stay), stop at 65,025. wordfreq merges subtitles, Twitter, Reddit, news, books and Wikipedia, which is why `gonna`, `tbh` and `idk` are in. |
| `data/taxonomy.json` | 89 themes, e.g. *Verbs \| movement & travel*, *Nouns \| food, drink & cooking*, *Contractions \| negatives* | Written by hand for this project. |
| `data/labels.json` | one theme per word | Assigned by Claude at build time, in chunks of ~1,000 words, following [`docs/LABELLING.md`](docs/LABELLING.md). [`scripts/label_chunks.py`](scripts/label_chunks.py) prepares the chunks and merges the results. |
| `data/blocks.json` | the 255 blocks Jev navigates | [`scripts/build_blocks.py`](scripts/build_blocks.py): merge the tiny function-word and contraction themes into one core theme, put `.` `,` `?` `!` at its head in place of the four rarest words, lay the themes out in order, keep frequency order inside a theme (alphabetical for names, places, brands and possessives), cut into 255 consecutive blocks of 255, and describe each block by its theme, its position in the theme and example words. |

Block descriptions look like
`Verbs | movement & travel (most common): go, come, walk, run, leave, arrive, move`
or `Surnames & famous people (arnett to berg): arnett, atkins, babcock, baldwin, barden, baskerville, beals`.
Where a block straddles two themes both are named, e.g.
`Adverbs | time & frequency: now, then, still, never, always, again, ever + Adverbs | degree & intensity (most common): just, only, very, even`.
The 255 descriptions total about 36,000 characters, which is most of what a level-1 question costs.

## Run it

```bash
git clone https://github.com/sashakaletsky/jev-language-model
cd jev-language-model
npm install
cp .env.example .env.local   # put your TypeSafe API key in TYPESAFE_API_KEY
npm run dev                  # http://localhost:3000
```

Node 20 or newer. The dictionary files are committed, so Python is only needed if you want to rebuild them.

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsashakaletsky%2Fjev-language-model&env=TYPESAFE_API_KEY&envDescription=Your%20TypeSafe%20API%20key%20(server-side%20only)&project-name=jev-language-model)

One environment variable, `TYPESAFE_API_KEY`. No database. Nothing about visitors is stored.

### Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | required | Your TypeSafe key. Server-side only. |
| `JEV_FANOUT` | `30` | How many of the top level-1 blocks to open at level 2 and shortlist from, up to 50. More blocks give the final round more variety; each block is one more 255-option question per word, so tokens scale with it. Also adjustable in the UI. |
| `NEXT_PUBLIC_JEV_PRICE_PER_M_INPUT_TOKENS` | unset | Your price per million input tokens, used only to show an estimated cost in the UI. |
| `JEV_TEMPERATURE` | `0.8` | Sampling temperature for the suggestion. 0 always takes the top candidate. Also adjustable in the UI. |
| `JEV_MAX_FANOUT` | `50` | The most blocks a visitor may open at level 2. |
| `JEV_RATE_LIMIT` | `40` | Requests per visitor per 10 seconds before the API answers 429. Per server instance, so for a busy public deployment also enable your host's firewall rate limiting (Vercel: Firewall → Rate limiting). |

The client asks only once a word has been finished with a space or a mark, waits 250 ms after the last
keystroke, and answers identical inputs from a small in-memory cache, so typing does not become a burst
of API calls.

## API

```
POST /api/predict   { "text": "I want to ", "fanout": 30, "temperature": 0.8, "trace": "summary" | "full" }
GET  /api/predict?text=I%20want%20to%20&trace=full
GET  /api/blocks              the 255 block descriptions Jev reads at level 1
GET  /api/blocks?id=<block>   one block with its 255 words
```

The response carries the level-3 candidates, the sampled `chosen` suggestion, the opened blocks, the
shortlist quotas, token usage, timing and a `trace` of each Jev call. With `trace=full` the trace includes the complete 255-option criteria exactly as sent.

## Measuring accuracy

[`scripts/harness.mjs`](scripts/harness.mjs) replays the same three Jev questions over real text. It
hides a word, shows Jev the text before it, and counts exact matches at temperature 0. Jev is the only
model in the loop; scoring is string equality.

```bash
npm run dev                                   # in one terminal
npm run harness -- --corpus some-text.txt --samples 100 --out results.json
```

Any plain-text file works. Public-domain English text is easy to find, for example the
[NLTK corpora](https://github.com/nltk/nltk_data/tree/gh-pages/packages/corpora) (`webtext.zip` is
informal web text, `gutenberg.zip` is classic novels). It prints a table like:

```
n   | top-1  | top-5  | block hit | tokens/pred | ms/pred
100 | ...    | ...    | ...       | ...         | ...
```

"Block hit" is whether the hidden word's block was among those opened at level 2, which separates
level-1 mistakes from later ones.

## Licence

Code is MIT (see [`LICENSE`](LICENSE)). The word list in `data/words.json`, and the files derived from
it, are built from [wordfreq](https://github.com/rspeer/wordfreq) data, which is
[CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), and are shared under the same licence.
