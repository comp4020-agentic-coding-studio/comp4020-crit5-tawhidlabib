# C5 — A game

## What was the breakthrough that moved the work forward?

Watching three of my own explanations die, one after another, and only then
finding the real one.

Someone played the game and asked for the halfway wall to come out. Doing it
took a beatable opponent to an unbeatable one, and I responded by sweeping
sixty-odd combinations of constants. Nothing moved. A search space that flat is
telling you the model is wrong, not that you are looking in the wrong corner.

So I measured instead. It was not the new bouncing, which I proved by switching
it off. It was not that scoring had got easier — I ran the old code out of git
and found the same nineteen goals a match on both sides of the change, which
also caught me mis-remembering my own baseline. It was not the player
over-committing; average positions were identical. What I had never thought to
measure was who reaches the ball first after a kickoff. The AI won 99% of them,
against 45% with the wall. The wall had been holding the centre out of reach of
*both* heads, and removing it turned every restart into a footrace a machine
always wins.

## What did this work change about who I want to be as a software developer?

I want to be the kind of developer who builds the instrument before turning the
dial — and I now know that wanting it is not enough, because I relapsed into
tuning within a week of learning the lesson. What actually protects me is
cheaper: write down the belief, then go and check it before acting on it. Two
of my three beliefs were false, and one was a number I had misread and would
otherwise have optimised toward for hours.

The other thing that stuck is distrust of green. Every check passed while the
pitch stripes poured out of the frame, both arrows pointed the same way, and a
head landed on top of the very keys explaining how to jump. Tests prove what
you thought to assert. For anything visual, looking at it is not a lesser form
of verification — it is the only one that catches what you did not think of.
