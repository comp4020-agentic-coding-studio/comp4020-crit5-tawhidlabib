# C5 — A game

## What was the breakthrough that moved the work forward?

Realising that "the AI is too hard" is not a feeling, it is a measurement I had
not taken yet.

I had a game that worked and an opponent that beat me every time, and my
instinct was to nudge constants until it stopped doing that. Instead I simulated
three player profiles over forty matches each — random moves, a tracker running
a fifth of a second late, and the AI played against a copy of itself. That
turned a vague complaint into a specific shape: a perfect player won half its
matches, a slightly late one won *none*. The problem was never that the AI was
strong. It was that the game punished lateness absolutely, and every human is
late.

The fix followed from the diagnosis and was not what I would have guessed.
Handicapping the AI's reaction only made matches higher-scoring. The lever was
the ball's gravity — make it hang, and a missed header stops being a conceded
goal.

## What did this work change about who I want to be as a software developer?

I want to be the kind of developer who builds the instrument before turning the
dial. Tuning by feel would eventually have produced something playable, but I
would not have been able to say why, and I could not have defended it.

The other thing that stuck is distrust of green. My checks were passing while
the pitch stripes poured out of the frame and both on-screen arrows pointed the
same way. Tests prove what you thought to assert. Looking at the thing is not a
lesser form of verification — for anything visual, it is the only one that
catches what you did not think of.
