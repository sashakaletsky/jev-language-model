# Contributing

Thanks for taking a look. This is a small research project with one firm rule, so the bar for
contributions is mostly about keeping that rule intact.

## The one rule

**At inference time, Jev makes every linguistic decision.** Which block, which word, whether a
punctuation mark may follow: all of it comes from Jev's answers. Code may split text, size shortlists
from Jev's own probabilities, and sample from Jev's distribution. Code may not match prefixes, consult
word frequencies, penalise repetition, or call any other model. If a change would make the suggestion
depend on something other than Jev's answers, it belongs in a fork, not here.

Prompt wording, question structure, how many blocks are opened, how shortlists are sized and how the
final distribution is sampled are all fair game, and are where most of the interesting work is.

## Set-up

```bash
git clone https://github.com/sashakaletsky/jev-language-model
cd jev-language-model
npm install
npm run dev:mock     # runs the site against a local stand-in for the API; no key needed
```

With a TypeSafe key, copy `.env.example` to `.env.local`, fill in `TYPESAFE_API_KEY`, and use
`npm run dev` instead. Node 22.18 or newer is required (the tests use Node's built-in TypeScript
support).

## Checks

```bash
npm run check        # lint, typecheck, tests, production build; CI runs the same
npm test             # just the tests
```

The tests run the whole three-level pipeline against `scripts/mock-typesafe.mjs`, which answers with
made-up probabilities but tells the truth about what the text ends with, so the punctuation gate can be
exercised. They need no key and no network. Please keep it that way: a test that needs a real key
cannot run in CI.

## Where things live

| Path | What |
| --- | --- |
| `lib/predict.ts` | The three questions, their instructions and examples, shortlist sizing, sampling. Start here. |
| `lib/blocks.ts` | Loads `data/blocks.json` and builds the option sets. |
| `lib/tokenize.ts` | The only text handling: apostrophes, mid-word detection, context length. |
| `app/api/predict/route.ts` | The HTTP endpoint: validation, cache, rate limit. |
| `app/Predictor.tsx` | The editor, ghost text, Tab, and the "What Jev decided" panel. |
| `scripts/` | Data build scripts (Python), the mock API, the accuracy harness. |
| `data/` | Generated data. See [docs/DATA.md](docs/DATA.md) before editing. |
| `docs/` | Labelling instructions, data provenance, the pipeline diagram. |

## Changing the prompts

Everything Jev is told is in `lib/predict.ts`: the shared `TASK` (task, rules, examples), the
per-level questions, and the ending question. When you change wording, say in the pull request what
failure you saw and what you expected the change to do; a before-and-after from the site's
"Show the raw Jev calls" panel is ideal. If you can, run the harness (`npm run harness`) before and
after and include the table.

## Changing the data

The dictionary and its blocks are built by the Python scripts in `scripts/`; the process, the licences
and the judgement calls are in [docs/DATA.md](docs/DATA.md). Rebuild rather than hand-edit, and commit
the regenerated files with the script change that produced them.

## Pull requests

- Keep each pull request to one change, with `npm run check` passing.
- Say what you observed, what you changed, and what you expect to be different. Screenshots of the
  panel are welcome.
- Do not commit keys. `.env*` files are ignored except `.env.example`.
