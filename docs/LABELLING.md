# Word labelling task

You are categorising English words for the Jev Language Model project. Every word in your chunk file
must be assigned exactly one category id from the taxonomy below. Your labels are used to group the
65,025 most frequent English words into themed blocks of 255, which a small decision model later
navigates to predict the next word someone is typing. Good thematic grouping is what makes that work.

## Input
Your chunk file has one word per line: `word<TAB>hints`. The hints are WordNet lexicographer
categories (e.g. `noun.food`, `verb.motion`, `adj.all`) for the word's first few senses, when WordNet
knows the word. They are hints only; many are wrong for the everyday sense of the word, and they are
absent for names, slang and contractions. Decide with your own knowledge.

## Rules
1. Classify by the word's most common meaning and part of speech in everyday typed English: texts,
   social media, emails, articles. Not the rarest sense, not the dictionary's first sense.
2. Inflections follow the base word: plurals go with the singular, verb forms (walked, walking,
   walks) go with the verb, comparatives with the adjective. Words ending in -ly that are adverbs go
   to an adverb category.
3. Noun/verb ambiguity: pick the more common use in typed text (e.g. `run` -> `vb_motion`,
   `work` -> `vb_activity`, `love` -> `vb_emotion`, `answer` -> `n_communication`). Do not agonise;
   a reasonable call is fine.
4. Words with an apostrophe: pronoun/word + verb contractions (`it's`, `i'm`, `that's`, `let's`) ->
   `ctr_pronoun_verb`; negatives (`don't`, `ain't`) -> `ctr_negative`; possessive `'s` forms of
   people, roles, animals and personal names (`mother's`, `john's`, `dog's`) -> `pos_people`; all
   other possessives (`world's`, `company's`, `today's`) -> `pos_things`.
5. Proper nouns: choose the `pn_*` category by what the name most commonly refers to in text.
   A name usable as both first name and surname goes by its more common use. Nationalities and
   languages used as adjectives (`french`, `chinese`) -> `adj_nationality`. Demonyms as nouns
   (`americans`) also -> `adj_nationality`.
6. Single letters, letter strings and keyboard mashes -> `misc_letters`. Misspellings, truncated
   words and fragments -> `misc_other`. Foreign words -> `misc_foreign`. Use these sparingly; most
   rare tokens are real words or names and belong in a real category.
7. Internet abbreviations and texting spellings (`lol`, `idk`, `u`, `gonna`, `tho`) -> `inf_internet`.
   Other slang -> `inf_slang`. Profanity and insults -> `inf_swear`.
8. Days, months, seasons and time units -> `time_calendar`. Numbers and ordinals -> `num_numbers`.
9. Every word gets exactly one id. Use only ids from the table. Never skip a word, never add one.

## Output
Write a single JSON object to the output path you were given, mapping every word in your chunk to its
category id, in the same order as the chunk file, for example:

```json
{
  "the": "fn_determiners",
  "walked": "vb_motion",
  "it's": "ctr_pronoun_verb"
}
```

Use the Read tool to read your chunk and the Write tool to write the output. Do not use the web, do
not run scripts to classify, and do not ask questions; decide from your own knowledge.

## Taxonomy (89 categories)

| id | category | description | examples |
|---|---|---|---|
| `fn_determiners` | Function words | articles, determiners & quantifiers | Articles, demonstratives and quantifying determiners that introduce a noun. | the, a, an, this, that, these, those, some, any, every, each, all, both, no |
| `fn_pronouns` | Function words | pronouns | Personal, possessive, reflexive and indefinite pronouns. | i, you, he, she, it, we, they, me, him, her, us, them, my, your |
| `fn_wh_words` | Function words | question & relative words | Wh-words used for questions and relative clauses. | what, which, who, whom, whose, where, when, why, how, whatever, whenever, wherever, whoever |
| `fn_prepositions` | Function words | prepositions | Prepositions and particles expressing relation, place, time or direction. | of, in, to, for, with, on, at, by, from, about, into, over, after, under |
| `fn_conjunctions` | Function words | conjunctions & linking words | Words that join clauses or phrases. | and, or, but, so, because, if, when, while, although, though, unless, until, whereas, nor |
| `fn_auxiliaries` | Function words | auxiliary & modal verbs, negation | Forms of be/have/do used as auxiliaries, modal verbs, and 'not'. | is, are, was, were, be, been, being, am, have, has, had, do, does, did |
| `ctr_pronoun_verb` | Contractions | pronoun/word + verb (it's, i'm, they'll, that's) | Apostrophe contractions of a pronoun or other word with a verb: 's, 'm, 're, 've, 'll, 'd. | it's, i'm, you're, he's, we've, they'll, i'd, that's, there's, what's, here's, who's, let's |
| `ctr_negative` | Contractions | negatives (don't, can't, isn't, wouldn't) | Apostrophe contractions with not. | don't, can't, won't, isn't, didn't, wasn't, wouldn't, couldn't, shouldn't, aren't, doesn't, hasn't, ain't |
| `pos_people` | Possessives | people & names ('s: mother's, women's, john's) | Possessive 's forms of people, roles, family words and personal names. | mother's, women's, children's, people's, john's, father's, king's, boss's, man's, girl's |
| `pos_things` | Possessives | places, organisations & things ('s: world's, company's, today's) | Possessive 's forms of places, organisations, objects, times and other non-person nouns. | world's, company's, today's, america's, country's, city's, god's, year's, team's, earth's |
| `inf_interjections` | Interjections, greetings & responses | Stand-alone exclamations, greetings, polite formulas and yes/no responses. | yes, no, okay, ok, yeah, yep, nope, oh, wow, hey, hi, hello, bye, thanks |
| `inf_discourse` | Discourse markers & fillers | Words used to manage conversation flow rather than for content. | well, anyway, actually, basically, honestly, um, uh, er, like, right, mean, literally, seriously, whatever |
| `inf_internet` | Internet slang, texting abbreviations & spellings | Acronyms and shortenings typical of texting and social media, plus informal spellings. | lol, lmao, omg, tbh, idk, btw, brb, imo, wtf, u, ur, pls, thx, ppl |
| `inf_slang` | Casual slang words | Informal or slang vocabulary that is not an abbreviation. | dude, bro, guys, cool, awesome, yo, nah, chill, dope, lit, savage, cringe, meh, buddy |
| `inf_swear` | Swear words, insults & crude slang | Profanity, insults and vulgar or sexual slang. | shit, fuck, fucking, damn, ass, bitch, crap, hell, idiot, jerk, moron, dumbass, bastard, loser |
| `inf_sounds` | Sounds, laughter & onomatopoeia | Written laughter, noises and sound effects. | haha, hehe, lmfao?, boom, bang, meow, woof, aah, ooh, mwah, ugh, whoa, zzz, hmmm |
| `misc_letters` | Single letters, letter strings & non-word tokens | Individual letters, alphabet strings, keyboard mashes and other non-words. | b, c, d, x, z, xx, zz, aaaa, qq, abc, xyz |
| `misc_foreign` | Foreign-language words | Words from other languages that appear in English text (Spanish, French, German, Latin, etc.). | de, la, le, el, y, et, der, von, une, das, los, das, du, des |
| `misc_abbrev` | Abbreviations, acronyms & titles | General abbreviations, acronyms and titles that are not brand or organisation names. | mr, mrs, ms, dr, st, jr, sr, etc, vs, ie, eg, inc, ltd, co |
| `num_numbers` | Numbers, ordinals & math words | Number words, ordinals, fractions and basic arithmetic terms. | one, two, three, ten, twenty, hundred, thousand, million, billion, first, second, third, half, quarter |
| `num_quantity` | Quantity, amount & measurement | Words for amounts, sizes, units and measurement. | amount, number, lot, lots, plenty, enough, total, average, size, length, weight, height, meter, mile |
| `time_calendar` | Time, dates & the calendar | Nouns for times, dates, days, months, seasons of the calendar and periods. | today, tomorrow, yesterday, week, month, year, monday, friday, january, december, morning, night, hour, minute |
| `adv_time` | Adverbs | time & frequency | Adverbs saying when or how often. | now, then, already, still, yet, soon, again, always, never, often, sometimes, usually, rarely, once |
| `adv_degree` | Adverbs | degree & intensity | Adverbs saying how much. | very, really, quite, too, so, extremely, pretty, rather, almost, nearly, completely, totally, absolutely, slightly |
| `adv_manner` | Adverbs | manner (how something is done) | Adverbs, mostly -ly, describing the manner of an action. | quickly, slowly, carefully, easily, badly, suddenly, gently, quietly, loudly, directly, properly, together, alone, automatically |
| `adv_place` | Adverbs | place & direction | Adverbs saying where or which way. | here, there, everywhere, somewhere, anywhere, nowhere, away, back, home, out, up, down, inside, outside |
| `adv_stance` | Adverbs | stance, certainty & linking | Sentence adverbs expressing attitude, certainty, emphasis or logical links. | however, therefore, maybe, perhaps, probably, definitely, certainly, obviously, clearly, apparently, unfortunately, hopefully, especially, particularly |
| `adj_positive` | Adjectives | positive evaluation | Adjectives expressing approval or good quality. | good, great, best, better, nice, beautiful, amazing, wonderful, excellent, perfect, awesome, fantastic, lovely, brilliant |
| `adj_negative` | Adjectives | negative evaluation | Adjectives expressing disapproval or poor quality. | bad, worse, worst, terrible, awful, horrible, poor, wrong, ugly, boring, stupid, dumb, nasty, disgusting |
| `adj_emotion` | Adjectives | emotions, mood & personality | Adjectives describing feelings, moods and character traits. | happy, sad, angry, afraid, scared, excited, nervous, proud, glad, upset, worried, calm, kind, friendly |
| `adj_physical` | Adjectives | size, shape & physical properties | Adjectives for size, shape, texture, temperature and physical state. | big, small, large, little, huge, tiny, long, short, tall, wide, narrow, thick, thin, heavy |
| `adj_color` | Adjectives | colour & appearance | Colour words and adjectives about how things look. | red, blue, green, black, white, yellow, brown, pink, purple, grey, gray, orange, dark, bright |
| `adj_time_order` | Adjectives | age, time, order & newness | Adjectives about age, recency, sequence and duration. | new, old, young, ancient, modern, recent, early, late, former, current, previous, next, last, final |
| `adj_quantity` | Adjectives | amount, degree & comparison | Adjectives about how many, how much, or relative extent. | whole, entire, extra, additional, main, major, minor, single, equal, total, sufficient, numerous, countless, multiple |
| `adj_quality` | Adjectives | importance, difficulty & general quality | General evaluative adjectives about importance, difficulty, truth, possibility and normality. | important, key, serious, significant, basic, simple, easy, difficult, complex, strong, weak, powerful, safe, dangerous |
| `adj_relational` | Adjectives | society, fields & classification (political, medical, digital) | Relational adjectives that classify things by domain: social, political, economic, medical, legal, technical, etc. | social, political, national, international, public, private, personal, human, local, popular, legal, official, military, religious |
| `adj_nationality` | Adjectives & demonyms | nationality, region, religion & group identity | Nationalities, languages as adjectives, regional and religious identities. | american, british, english, french, german, chinese, japanese, indian, european, asian, african, russian, italian, spanish |
| `vb_motion` | Verbs | movement & travel | Verbs of moving, going and travelling, including all inflections. | go, come, walk, run, move, leave, arrive, return, enter, follow, travel, drive, ride, fly |
| `vb_physical` | Verbs | physical actions with hands & body | Verbs of handling, hitting, holding and manipulating objects. | put, set, place, pull, push, throw, catch, hit, kick, touch, grab, carry, lift, drop |
| `vb_body` | Verbs | body, eating, drinking & health | Verbs of bodily functions, eating, sleeping, dressing and health. | eat, drink, sleep, wake, breathe, cook, bake, chew, swallow, bite, sit, stand, lie, rest |
| `vb_possession` | Verbs | having, giving, getting, buying & money | Verbs of possession, transfer, trade and finding or losing. | have, get, give, take, bring, receive, keep, hold, own, buy, sell, pay, spend, earn |
| `vb_change` | Verbs | making, building, changing & destroying | Verbs of creation, transformation, growth and destruction. | make, create, build, produce, design, develop, form, shape, grow, change, become, turn, improve, fix |
| `vb_activity` | Verbs | work, organising & everyday activities | Verbs of doing, working, starting, finishing, planning and managing activities. | work, use, try, play, start, begin, finish, end, continue, stop, wait, stay, live, plan |
| `vb_social` | Verbs | social interaction, helping & conflict | Verbs of interacting with people: helping, meeting, leading, fighting, allowing. | help, meet, join, visit, invite, marry, support, protect, defend, attack, fight, kill, threaten, punish |
| `vb_communication` | Verbs | speaking, writing & communication | Verbs of saying, telling, writing and messaging. | say, tell, talk, speak, ask, answer, call, write, read, explain, describe, discuss, argue, mention |
| `vb_cognition` | Verbs | thinking, knowing & perceiving | Verbs of thought, knowledge, belief, perception and appearance. | think, know, believe, understand, remember, forget, learn, realize, guess, wonder, consider, decide, expect, imagine |
| `vb_emotion` | Verbs | wanting, liking & emotions | Verbs of desire, preference, emotion and emotional reaction. | want, need, like, love, hate, enjoy, prefer, wish, care, mind, miss, fear, worry, hurt |
| `vb_general` | Verbs | general, abstract & state verbs | Verbs of existence, relation, causation and abstract states. | exist, remain, include, involve, contain, consist, depend, belong, require, cause, result, affect, relate, represent |
| `vb_tech` | Verbs | technology & computing actions | Verbs specific to computers, phones and the internet. | download, install, upload, click, log, delete, print, scan, program, code, compute, stream, update, reboot |
| `n_people` | Nouns | people, roles & occupations | Common nouns for people by role, job or type. | man, woman, person, people, guy, girl, boy, child, kid, friend, doctor, teacher, student, worker |
| `n_family` | Nouns | family & relationships | Family members and relationship words. | mother, father, mom, dad, parent, son, daughter, brother, sister, husband, wife, baby, uncle, aunt |
| `n_body` | Nouns | body, health & medicine | Body parts, health conditions, medicine and medical care. | head, hand, eye, face, heart, blood, body, leg, arm, foot, hair, skin, brain, bone |
| `n_emotion` | Nouns | emotions, mind & personality | Feelings, mental states and character. | love, fear, anger, joy, happiness, sadness, hope, stress, anxiety, pride, shame, guilt, mood, feeling |
| `n_abstract` | Nouns | abstract concepts, qualities & ideas | General abstract nouns: things, ways, facts, problems, reasons, results. | thing, way, life, fact, problem, reason, question, issue, point, kind, sort, type, case, part |
| `n_events` | Nouns | actions, events, holidays & activities | Happenings, activities, celebrations and incidents. | action, activity, event, game, party, trip, journey, visit, meeting, accident, crash, fire, crime, murder |
| `n_communication` | Nouns | language, communication & media | Words about words: language, writing, speech, news and messaging. | word, name, letter, message, story, news, book, article, page, text, speech, language, conversation, answer |
| `n_arts` | Nouns | arts, music, film & entertainment | Music, movies, TV, theatre, visual arts and performance. | music, song, album, band, concert, guitar, piano, drum, movie, film, show, episode, series, character |
| `n_sports` | Nouns | sports, games & hobbies | Sports, games, fitness and pastimes. | football, soccer, basketball, baseball, tennis, golf, hockey, boxing, team, coach, goal, score, ball, bat |
| `n_food` | Nouns | food, drink & cooking | Foods, drinks, meals, ingredients and cooking. | food, bread, meat, cheese, egg, rice, pizza, burger, chicken, beef, fruit, apple, banana, vegetable |
| `n_animals` | Nouns | animals & creatures | Animals, insects, pets and mythical creatures' species words. | dog, cat, horse, cow, pig, bird, fish, chicken, lion, tiger, bear, wolf, monkey, elephant |
| `n_nature` | Nouns | plants, nature, landscape & weather | Plants, geography, the environment, sky and weather. | tree, flower, grass, leaf, forest, garden, plant, seed, rose, oak, mountain, river, lake, sea |
| `n_home` | Nouns | home, furniture & household objects | Houses, rooms, furniture and everyday household items. | house, home, room, door, window, wall, floor, roof, kitchen, bathroom, bedroom, bed, table, chair |
| `n_clothing` | Nouns | clothing, fashion & personal items | Clothes, accessories, fashion and grooming products. | shirt, pants, dress, shoes, jacket, coat, hat, jeans, socks, skirt, suit, tie, boots, sneakers |
| `n_places` | Nouns | buildings, places & the city | Common nouns for buildings, venues, urban places and locations. | city, town, village, street, road, building, office, church, store, shop, mall, market, restaurant, hotel |
| `n_transport` | Nouns | vehicles, transport & travel | Vehicles, transport systems and travel. | car, bus, train, plane, ship, boat, bike, bicycle, truck, taxi, motorcycle, subway, flight, ticket |
| `n_tech` | Nouns | technology, computers, internet & devices | Computing, the internet, gadgets and electronics. | computer, phone, laptop, screen, keyboard, software, app, website, internet, online, data, file, network, server |
| `n_science` | Nouns | science, mathematics & academic fields | Scientific, mathematical and scholarly concepts and disciplines. | science, physics, chemistry, biology, math, theory, experiment, research, energy, force, gravity, atom, molecule, cell |
| `n_education` | Nouns | education, school & learning | Schooling, study and learning. | school, class, lesson, university, college, course, degree, exam, test, homework, grade, subject, education, knowledge |
| `n_business` | Nouns | work, business, jobs & the economy | Jobs, companies, commerce, industry and the economy. | job, work, business, company, career, salary, wage, employee, employer, industry, market, economy, trade, product |
| `n_money` | Nouns | money, finance & banking | Money, banking, investing, tax and payments. | money, cash, dollar, pound, euro, cent, coin, bank, credit, loan, debt, mortgage, interest, tax |
| `n_law` | Nouns | law, crime, police & justice | Legal system, policing, crime and punishment. | law, crime, police, court, judge, trial, jury, verdict, sentence, prison, jail, arrest, evidence, witness |
| `n_politics` | Nouns | politics, government & society | Government, elections, nations, ideology and social structure. | government, election, vote, party, democracy, congress, parliament, senate, minister, policy, campaign, candidate, mayor, governor |
| `n_military` | Nouns | military, war & weapons | Armed forces, warfare and weapons. | army, navy, war, battle, weapon, gun, rifle, bomb, missile, tank, sword, bullet, armor, shield |
| `n_religion` | Nouns | religion, myth, magic & the supernatural | Religion, belief, mythology and fantasy creatures. | god, religion, faith, prayer, bible, heaven, hell, angel, devil, demon, ghost, spirit, soul, sin |
| `n_materials` | Nouns | materials, substances & chemicals | Materials, raw substances and chemicals. | wood, metal, steel, iron, gold, silver, plastic, paper, oil, gas, coal, water, clay, rubber |
| `n_tools` | Nouns | tools, machines, parts & generic objects | Tools, machinery, components and generic object words. | tool, machine, motor, hammer, nail, screw, drill, saw, rope, chain, wire, pipe, gear, lever |
| `n_space` | Nouns | shapes, space, position & direction | Positions, directions, shapes and spatial relations. | side, top, bottom, front, back, middle, center, edge, end, line, circle, triangle, angle, surface |
| `n_groups` | Nouns | groups, organisations & institutions | Collective nouns and kinds of organisation. | group, club, organization, association, union, committee, council, board, agency, institute, foundation, corporation, community, crowd |
| `pn_first_male` | First names | male | Given names mainly used for men and boys. | john, michael, david, james, paul, chris, mike, tom, jack, daniel, robert, william, andrew, mark |
| `pn_first_female` | First names | female | Given names mainly used for women and girls. | mary, sarah, emma, lisa, anna, jennifer, emily, laura, jessica, kate, elizabeth, maria, susan, amy |
| `pn_surnames` | Surnames & famous people | Family names, including those of famous people known mainly by surname. | smith, johnson, williams, brown, jones, garcia, miller, davis, wilson, taylor, einstein, shakespeare, obama, lincoln |
| `pn_countries` | Places | countries, continents & world regions | Names of countries, continents and large regions. | america, england, france, germany, china, india, japan, europe, asia, africa, russia, italy, spain, mexico |
| `pn_us_places` | Places | US states & cities | US states, cities and well-known American locations. | california, texas, florida, chicago, boston, seattle, brooklyn, denver, atlanta, vegas, ohio, manhattan, miami, dallas |
| `pn_world_places` | Places | cities & places outside the US | Cities, towns and landmarks outside the United States. | london, paris, tokyo, sydney, toronto, berlin, moscow, dubai, mumbai, rome, madrid, beijing, amsterdam, dublin |
| `pn_brands` | Brands, companies & products | Company names, brands and product names. | google, apple, amazon, microsoft, facebook, twitter, nike, toyota, samsung, netflix, xbox, playstation, walmart, starbucks |
| `pn_media` | Media titles, fictional characters & franchises | Titles of films, shows, games and books, and fictional characters. | batman, superman, pokemon, marvel, disney, simpsons, sherlock, gandalf, mario, zelda, hogwarts, vader, spiderman |
| `pn_orgs` | Organisations, sports teams & institutions | Named organisations, agencies, universities, sports teams and leagues. | nasa, fbi, cia, nfl, nba, bbc, cnn, nato, un, harvard, yale, lakers, yankees, cowboys |
| `pn_other` | Other proper nouns | Proper nouns that fit none of the above: named events, awards, ships, buildings, gods, historical eras, etc. | olympics, grammy, titanic, pentagon, kremlin, zeus, renaissance, woodstock, coachella |
| `misc_other` | Uncategorisable | misspellings, fragments & other tokens | Tokens that are not real words or fit nowhere: misspellings, fragments, truncated words. | aaaaand, thicc, nonce, mfw, sein, zwei |
