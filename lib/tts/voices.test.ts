import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isReady, kindOf } from "./types.ts";
import {
  DEFAULT_VOICE_ID,
  VOICES,
  availableVoices,
  defaultVoice,
  voiceById,
} from "./voices.ts";

describe("voice catalogue", () => {
  it("has unique ids", () => {
    const ids = VOICES.map((v) => v.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  // A stored profile points at one of these strings. A rename leaves the profile
  // pointing at nothing; a re-cast puts a stranger in the bedtime story.
  it("keeps the ids that profiles.preferred_voice stores", () => {
    assert.deepEqual(VOICES.map((v) => v.id).sort(), [
      "contador",
      "dispositivo",
      "vitoria",
    ]);
  });

  it("resolves the default", () => {
    assert.equal(defaultVoice().id, DEFAULT_VOICE_ID);
  });

  // The whole point of the default: a fresh clone with no keys still narrates.
  it("defaults to a voice that needs no account", () => {
    assert.equal(kindOf(defaultVoice()), "device");
    assert.ok(isReady(defaultVoice()));
  });

  it("throws on an unknown id instead of falling back", () => {
    assert.throws(() => voiceById("nao-existe"), /unknown voice/);
  });

  it("gives every voice a label, a description and a personality", () => {
    for (const voice of VOICES) {
      assert.ok(voice.label.length > 0, `${voice.id} has no label`);
      assert.ok(voice.description.length > 0, `${voice.id} has no description`);
      assert.ok(voice.personality.length > 0, `${voice.id} has no personality`);
    }
  });

  it("requires a provider id on every server voice", () => {
    for (const voice of VOICES) {
      if (kindOf(voice) === "server") {
        assert.ok(voice.providerVoiceId, `${voice.id} cannot be synthesized`);
      }
    }
  });

  it("keeps the delivery settings inside the provider's ranges", () => {
    for (const { id, settings } of VOICES) {
      assert.ok(
        settings.stability >= 0 && settings.stability <= 1,
        `${id}: stability out of range`,
      );
      assert.ok(
        settings.similarityBoost >= 0 && settings.similarityBoost <= 1,
        `${id}: similarityBoost out of range`,
      );
      // Below 0.7 and children stop following; above 1.2 and it stops being a
      // bedtime story. The providers allow more than this on purpose.
      assert.ok(
        settings.speed >= 0.7 && settings.speed <= 1.2,
        `${id}: speed out of range`,
      );
    }
  });
});

describe("availableVoices", () => {
  it("offers the device voice with nothing configured at all", () => {
    assert.deepEqual(
      availableVoices(new Set()).map((v) => v.id),
      ["dispositivo"],
    );
  });

  // Offering a voice we cannot synthesize is worse than offering fewer: the
  // parent picks it and the story goes silent.
  it("hides voices whose provider has no credentials here", () => {
    const ids = availableVoices(new Set(["google"])).map((v) => v.id);
    assert.deepEqual(ids, ["dispositivo", "vitoria", "contador"]);
    assert.ok(!availableVoices(new Set(["elevenlabs"])).some((v) => v.provider === "google"));
  });
});
