## What changes

<!-- One or two sentences. -->

## Why

<!-- The problem, not the solution. -->

## Checklist

- [ ] `npm test && npm run typecheck && npm run build` pass
- [ ] If I changed the narrator's behaviour: I updated `docs/story-bible.md` **before** the prompt
- [ ] If I changed the constitution or the level rules: I raised `PROMPT_VERSION`
- [ ] If I changed streaming parsing: I added a test in `lib/stream-json.test.ts`
- [ ] I did not interpolate anything volatile into the `system` (I did not invalidate the prefix cache)
- [ ] I did not increase the latency to the first token
- [ ] I did not translate the narrator's pt-BR prose (constitution, bibles, UI strings)

## Example of a generated scene

<!-- If you touched the prompt, paste one scene from before and one from after. -->
