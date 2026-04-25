# Bookmarks

Source of truth for `bookmarks.html`. Edit this file, then run `python build.py`.

**Schema:**
- `## Section` becomes a section heading.
- `### [Title](url) — Author` is an entry header. The author segment is everything after the em dash.
- The first paragraph after an entry header is the note (description).
- Each `>` blockquote becomes a pull quote in the right sidebar. Blank line separates quotes. Consecutive `>` lines join into one quote.
- `_italic_` in notes becomes `<i>italic</i>`.
- `&`, `<`, `>` are escaped automatically — write them naturally.

---

## Taste

### [Learning to See](https://ia.net/topics/learning-to-see) — iA

A designer's eye essay. Less about UI mechanics, more about training perception.

> "Learning to design is, first of all, learning to see. Designers see more, and more precisely. This is a blessing and a curse — once we have learned to see design, both good and bad, we cannot un-see. The downside is that the more you learn to see, the more you lose your 'common' eye, the eye you design for."
> "See with one eye, feel with the other. —Paul Klee"

### [What Screens Want](https://frankchimero.com/blog/2013/what-screens-want/) — Frank Chimero

A meditation on the screen as a material with its own grain — fluid, edgeless, and best designed with rather than against.

> "So, if computers are like aspirin, and we've been making the computers smaller and smaller, where's the necessary padding that allows us to grasp things? I stumbled over the question for a while. Then it hit me. The padding isn't around the screens. It's in them."

### [Web Design is 95% Typography](https://ia.net/topics/the-web-is-all-about-typography-period) — iA

Most of the web is text, so most of web design is typography. Treat type as interface.

> "Optimizing typography is optimizing readability, accessibility, usability, and overall graphic balance."

### [Patterns of Software](https://www.dreamsongs.com/Files/PatternsOfSoftware.pdf) — Christopher Alexander (preface) & Richard Gabriel

Alexander's preface alone is worth it: most professionals fail because they accept standards that are too low.

> "In my life as an architect, I find that the single thing which inhibits young professionals, new students most severely, is their acceptance of standards that are too low."

### [Simple Made Easy](https://www.infoq.com/presentations/Simple-Made-Easy/) — Rich Hickey

The careful distinction between _simple_ (untangled, single-purpose) and _easy_ (familiar, near-at-hand). One of the most useful lenses on software complexity.

> "Simple is the opposite of complex; easy is the opposite of hard. Simple is about the lack of interleaving, not about the cardinality. One braid is not simple — it's complected. We can make changes with confidence only in things we understand."

> "Easy means 'to be at hand,' 'to be approachable.' It also means 'to be familiar.' But familiar is not the same as simple. We choose familiar things and call them simple, and then wonder why our systems become hard."

## Interaction design

### [A Brief Rant on the Future of Interaction Design](https://worrydream.com/ABriefRantOnTheFutureOfInteractionDesign/) — Bret Victor

The canonical critique of "pictures under glass." A reminder that hands and bodies were left out of the modern interface.

> "Hands have an incredible inborn capability that we hardly even appreciate. Pictures Under Glass sacrifice all the tactile richness of working with our hands, offering instead a hokey visual facade. Pictures Under Glass is an interaction paradigm of permanent numbness. It denies our hands what they do best. And yet, it's the dominant interaction paradigm of our era."

### [Magic Ink](https://worrydream.com/MagicInk/) — Bret Victor

A long argument that most software should be information design — letting people see, not click.

> "Information software design is graphic design, not engineering, not human-computer interaction, not 'experience design.'"

### [Inventing on Principle](https://vimeo.com/36579366) — Bret Victor

A talk about building tools around a guiding principle. The live-feedback demos are still ahead of most software being shipped today.

> "Creators need an immediate connection to what they're making. If you make a change or you make a decision, you need to see the effect of that immediately. There can't be a delay, and there can't be anything hidden. Creators have to be able to see what they're doing."

### [No to NoUI](https://www.elasticspace.com/2013/03/no-to-no-ui) — Timo Arnall

A counterpoint to "invisible design." Argues for legibility, seams, and materiality so people can understand what systems are doing.

> "Invisibility is generally a poor design strategy. Hiding the seams hides what people need to know to engage critically with technology."

## Tools for thought

### [As We May Think](https://www.theatlantic.com/magazine/archive/1945/07/as-we-may-think/303881/) — Vannevar Bush, 1945

The memex essay. Prefigures hypertext, personal knowledge systems, and almost everything that came after.

> "The human mind operates by association. With one item in its grasp, it snaps instantly to the next that is suggested by the association of thoughts, in accordance with some intricate web of trails carried by the cells of the brain. Man cannot hope fully to duplicate this mental process artificially, but he certainly ought to be able to learn from it."

> "Consider a future device for individual use, which is a sort of mechanized private file and library. It needs a name, and to coin one at random, 'memex' will do."

### [Augmenting Human Intellect](https://www.dougengelbart.org/pubs/augment-3906.html) — Douglas Engelbart, 1962

The philosophical root of computing as augmentation, not automation.

> "By 'augmenting human intellect' we mean increasing the capability of a man to approach a complex problem situation, to gain comprehension to suit his particular needs, and to derive solutions to problems. We do not speak of isolated clever tricks that help in particular situations. We refer to a way of life in an integrated domain where hunches, cut-and-try, intangibles, and the human 'feel for a situation' usefully co-exist with powerful concepts, streamlined terminology, sophisticated methods, and high-powered electronic aids."

### [The Mother of All Demos](https://www.dougengelbart.org/theDemo) — Douglas Engelbart, 1968

Mouse, windows, hypertext, video conferencing, collaborative editing — all introduced in a single demo, decades early.

> "If in your office, you, as an intellectual worker, were supplied with a computer display backed up by a computer that was alive for you all day, and was instantly responsive to every action you have — how much value could you derive from that?"

### [Personal Dynamic Media](https://www.newmediareader.com/book_samples/nmr-26-kay.pdf) — Alan Kay & Adele Goldberg, 1977

The Dynabook vision: personal computing as an active medium for learning and creation, not a productivity appliance.

> "Imagine having your own self-contained knowledge manipulator in a portable package the size and shape of an ordinary notebook."

### [Bicycle for the Mind](https://www.youtube.com/watch?v=ob_GX50Za6c) — Steve Jobs

Two minutes on why computers, like bicycles, are tools that amplify what humans can already do.

> "I read a study that measured the efficiency of locomotion for various species on the planet. The condor used the least energy. Humans came in with a rather unimpressive showing about a third of the way down the list. But then somebody at Scientific American had the insight to test the efficiency of locomotion for a man on a bicycle, and a man on a bicycle blew the condor away. That's what a computer is to me. It's the most remarkable tool we've ever come up with. It's the equivalent of a bicycle for our minds."

### [How Can We Develop Transformative Tools for Thought?](https://numinous.productions/ttft/) — Andy Matuschak & Michael Nielsen

A modern continuation of Engelbart and Kay. Why we still don't have real tools for thought, and what kind of work might get us there.

> "Tools for thought is a catch-all phrase for systems that expand the kinds of thoughts human beings can think."

## First principles

### [The Coming Age of Calm Technology](https://calmtech.com/papers/coming-age-calm-technology) — Mark Weiser & John Seely Brown

Technology should move between the center and periphery of attention, not constantly demand it.

> "Calm technology engages both the center and the periphery of our attention, and in fact moves back and forth between the two."

### [Ten Principles for Good Design](https://www.vitsoe.com/us/about/good-design) — Dieter Rams

Useful, understandable, unobtrusive, honest, long-lasting, thorough, environmental, minimal. Still the cleanest principle set in design.

> "Good design is as little design as possible. Less, but better — because it concentrates on the essential aspects, and the products are not burdened with non-essentials. Back to purity, back to simplicity."

## Habits of thought

### [The Work Required to Have an Opinion](https://fs.blog/the-work-required-to-have-an-opinion/) — Farnam Street

Charlie Munger's rule: you don't get an opinion on something until you can argue the other side better than its strongest defender. A discipline for honest thinking.

> "I never allow myself to have an opinion on anything that I don't know the other side's argument better than they do."

> "Teach thy tongue to say 'I do not know,' and thou shalt progress."

### [The Shapes of Stories](https://www.youtube.com/watch?v=oP3c1h8v2ZQ) — Kurt Vonnegut

A five-minute lecture that maps every narrative onto a few simple curves. Delightful in itself, and quietly profound as a tool for seeing structure.

> "There's no reason why the simple shapes of stories can't be fed into computers. They are beautiful shapes."

> "The truth is, we know so little about life, we don't really know what the good news is and what the bad news is."

## On walking

### [Walking](https://www.theatlantic.com/magazine/archive/1862/06/walking/304674/) — Henry David Thoreau, 1862

The foundational essay on walking as a discipline rather than an exercise — the case for sauntering, for wildness, and for going somewhere on foot.

> "He who sits still in a house all the time may be the greatest vagrant of all; but the saunterer, in the good sense, is no more vagrant than the meandering river, which is all the while sedulously seeking the shortest course to the sea."

> "In Wildness is the preservation of the World."

### [Heaven's Gaits](https://www.newyorker.com/magazine/2014/09/01/heavens-gaits) — Adam Gopnik, The New Yorker

A survey of the modern literature on walking — Solnit, Gros, Nicholson — and a clear-eyed argument for why we walk: not for fitness, but for the way it changes thought.

> "Walking is the Western form of meditation: 'You're doing nothing when you walk, nothing but walking.'"

> "Movement and mind are linked in Western thought."

### [Why We Walk: A Manifesto for Peripatetic Empowerment](https://www.themarginalian.org/2019/05/21/flaneuse-lauren-elkin/) — Maria Popova / The Marginalian

On Lauren Elkin and the flâneuse — walking as the body's way of thinking, and the city as a medium for attention and reflection.

> "Walking is mapping with your feet. It helps you piece a city together, connecting up neighbourhoods that might otherwise have remained discrete entities."

> "I walk because it confers — or restores — a feeling of placeness. The geographer Yi-Fu Tuan says a space becomes a place when through movement we invest it with meaning."

### [Give Your Ideas Some Legs](https://www.apa.org/pubs/journals/releases/xlm-a0036577.pdf) — Marily Oppezzo & Daniel L. Schwartz, Stanford 2014

The research paper everyone cites. Walking lifts creative output by ~60% in a controlled study; the effect persists shortly after sitting down.

> "Walking opens up the free flow of ideas, and it is a simple and robust solution to the goals of increasing creativity and increasing physical activity."

---

<!--
Stashed from the previous bookmarks.md (not currently on the page; decide
whether to add as entries):

## George Orwell: Politics and the English Language

> What is above all needed is to let the meaning choose the word, and not the other way around. ...

> * Never use a metaphor, simile, or other figure of speech which you are used to seeing in print.
> * Never use a long word where a short one will do
> * If it is possible to cut a word out, always cut it out
> * Never use the passive where you can use the active
> * Never use a foreign phrase, a scientific word, or a jargon word if you can think of an everyday English equivalent.
> * Break any of these rules sooner than say anything outright barbarous

## Other links (uncategorised)

* http://mrmrs.cc/writing/2016/03/23/the-veil-of-ignorance/
* https://vimeo.com/85040589
-->
