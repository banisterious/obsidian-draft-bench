/**
 * Prose content for the example project (`Example - The Last Lighthouse`),
 * authored at implementation time per the onboarding planning doc.
 *
 * Lives in its own module so the example-project orchestration stays
 * focused on file creation and the prose can be revised independently.
 *
 * Tone target: literary-friendly, generic enough not to prescribe genre,
 * concrete enough to feel like real writing rather than lorem ipsum.
 * Three scenes spanning final / revision / idea so writers see how the
 * default status vocabulary flows through the manuscript view's chips
 * and breakdown.
 */

/**
 * Scene 1 ("Arrival"), status `final`. Polished prose under a `## Draft`
 * heading so word-count slicing works. Planning sections retained but
 * empty, modeling the post-revision state of a finished scene.
 */
export const SCENE_1_FINAL_BODY = `## Source passages

- Marina lighthouse, decommissioned 1989. Rebuilt for tourism 1995.
- "The Keeper's Year" by E. Donnelly, 1992 — atmospheric reference.

## Beat outline

- Arrival, climb, lamp lighting. (Done.)

## Open questions

(Resolved.)

## Draft

The fog had already settled by the time Mara reached the headland. She paused at the cliff path, her duffel bag biting into her shoulder, and looked up.

The lighthouse stood where it had stood for ninety years — a thin white needle against the slate. The lamp room at the top was dark, as it always was at this hour, and the door at its base was the same blue she remembered from her aunt's funeral.

She had been twelve, then. She was forty-six now, and she had come to switch off the lamp for the last time.

The keys were where Edmonds said they would be: under a flat stone by the door, wrapped in oilcloth. Mara turned the lock and pushed inside.

The smell hit her first — paraffin and damp wool. The same smell. She stood for a moment in the small entry, letting her eyes adjust, and then she began the long climb.

There were one hundred and seventeen steps. She counted them as she went, the way her aunt had taught her, the way her aunt's father had taught her aunt. The handrail was cold under her palm. The walls were whitewashed and slightly damp.

At the top, the lamp room was as her aunt had left it — the brass burnished, the lens covered with a soft cloth, the log book closed on the desk. Mara set her bag down. She lifted the cloth from the lens. She opened the log to the last entry, dated 1989, and she read it.

*Fog rolling in from the west. Lamp lit at 18:42. All quiet.*

She picked up the pen. She wrote the date. She wrote: *Lamp lit at 19:14. The last time. Mara Edmonds, keeper, after thirty-four years away.*

Then she set the pen down, walked to the lens, and lit the lamp.

The light caught the fog and turned it gold.
`;

/**
 * Scene 1's prior-draft snapshot. Earlier wording, less polished — shows
 * what gets captured when a writer runs "New draft of this scene" mid-
 * revision. Same paragraph structure as the final but with rougher
 * sentences, fewer specific images. Demonstrates the versioning model
 * end-to-end.
 *
 * Note: this body is what scene 1's note holds at the moment the draft
 * snapshot is created. The orchestration writes this body first, runs
 * `createDraft` to snapshot it, then overwrites scene 1 with the final
 * body — matching how a real writer iterates.
 */
export const SCENE_1_EARLIER_DRAFT_BODY = `## Source passages

- Marina lighthouse, decommissioned 1989.
- "The Keeper's Year" by E. Donnelly.

## Beat outline

- Mara walks up to the lighthouse with her duffel bag.
- Unlocks the door, climbs the stairs.
- Lights the lamp for the last time before decommissioning.

## Open questions

- How much backstory belongs in this scene?
- The 1989 log entry — verbatim, or paraphrased?

## Draft

Mara reached the headland and paused. The fog was already settling. Her duffel bag was heavy. The lighthouse was where it had always been — a white tower against the gray sky.

She had been twelve when she was last here, at her aunt's funeral. Now she was forty-six. She had come to turn off the lamp.

The keys were under a stone by the door, wrapped in cloth. She unlocked the door and went in.

The smell was paraffin and wet wool, the same smell as before. She stood in the entry to let her eyes adjust. Then she started up the stairs.

There were one hundred and seventeen of them. She counted as she climbed. Her aunt had taught her to count. Her aunt's father had taught her aunt.

At the top, everything was as her aunt had left it. The lamp was covered with a cloth. The log book was closed on the desk. Mara set down her bag. She uncovered the lens. She opened the log to the last entry, from 1989.

*Fog rolling in from the west. Lamp lit at 18:42. All quiet.*

Mara picked up the pen and wrote the date and her own entry.

Then she lit the lamp.

The light caught in the fog.
`;

/**
 * Scene 2 ("The Long Watch"), status `revision`. Partial draft (3
 * paragraphs) under `## Draft`, planning sections actively populated.
 * Shows what mid-revision work looks like — beat outline still consulted,
 * draft prose growing into it.
 */
export const SCENE_2_BODY = `## Source passages

- Mara's aunt's logbook, 1955-1989. Daily entries; reads like a kept journal.
- The 1973 storm — referenced in three separate entries. Two ships lost south of the headland. Aunt's recollection in a letter dated December.

## Beat outline

- Mara settles into the keeper's chair after lighting the lamp.
- Reads through the log books on the shelf — finds her aunt's voice across decades.
- The fog thickens. A ship's horn sounds, distant.
- Memory: the night her aunt taught her to count the steps.
- Mara realizes she's been crying. Doesn't know for how long.

## Open questions

- Does Mara know about the 1973 storm before she reads about it, or is it a discovery? Discovery feels stronger — gives the reading sequence weight.
- How long is the watch? One night, or several? Probably one. The story is the lighting and the unlighting; the middle is one long arc.

## Draft

The chair was where it had always been, by the south window, with a wool blanket folded over the arm. Mara pulled it across her knees and watched the lamp turn.

For an hour she only watched. The lens was a small thing, considered up close — no bigger than a barrel — but the light it threw reached fifteen miles on a clear night. Tonight it would not reach fifteen miles. Tonight it would carry a few hundred yards into fog and stop.

She got up after a while and went to the shelf where the old log books were kept. Twenty-three of them, leather-bound, in chronological order from 1955. She took down the volume marked 1973 and brought it back to the chair.
`;

/**
 * Scene 3 ("Last Light"), status `idea`. Planning sections populated,
 * `## Draft` empty. Shows how a writer holds a scene in pre-draft state
 * — the structure is sketched, the prose hasn't started.
 */
export const SCENE_3_BODY = `## Source passages

- The decommissioning notice from the harbor authority, dated August.
- Mara's resignation letter from the city, drafted but not sent until the end.

## Beat outline

- Sunrise: Mara puts out the lamp for the last time.
- She closes the log book.
- The decommissioning crew arrives — three men with a clipboard.
- A small ceremony, almost embarrassed.
- Mara walks back down the path. She does not look back at the tower.
- Last image: the empty lamp room from the outside, dark for the first time in ninety years.

## Open questions

- Does Mara take anything with her, or does she leave everything? Leaving everything is more honest to the character. The log book stays.
- Is the ending elegiac or ambiguous? Probably elegiac. The story has earned it.
- One line of prose remembered from the night, carried into the morning? Decide during draft.

## Draft

`;
