import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeAudioContent, synthesisRequest } from "./google.ts";
import type { Voice } from "./types.ts";
import { voiceById } from "./voices.ts";

/**
 * The failures this file is here to catch are all silent ones: Google accepts
 * fields it does not honour, and returns perfectly good audio in the wrong voice
 * or at the wrong pace rather than an error.
 */

const vitoria = voiceById("vitoria");

describe("google synthesis request", () => {
  it("asks for the voice the catalogue cast, in pt-BR", () => {
    const body = synthesisRequest("Boa noite.", vitoria);

    assert.equal(body.voice.name, "pt-BR-Chirp3-HD-Achernar");
    assert.equal(body.voice.languageCode, "pt-BR");
    assert.equal(body.input.text, "Boa noite.");
  });

  // `ouvir` mode is a five-year-old following the story by ear alone. Dropping
  // this makes the narration faster and nobody sees an error.
  it("carries the voice's speed through as speakingRate", () => {
    assert.equal(
      synthesisRequest("Boa noite.", vitoria).audioConfig.speakingRate,
      vitoria.settings.speed,
    );
  });

  it("asks for MP3, not raw PCM — the clip crosses our own route", () => {
    assert.equal(
      synthesisRequest("Boa noite.", vitoria).audioConfig.audioEncoding,
      "MP3",
    );
  });

  // A voice with no provider id cannot be synthesized. Better here than as a
  // 200 from Google reading in some default voice.
  it("throws rather than letting the provider pick a voice", () => {
    const uncast: Voice = { ...vitoria, providerVoiceId: null };
    assert.throws(() => synthesisRequest("Boa noite.", uncast), /no google/);
  });
});

describe("decoding what google answers", () => {
  it("turns the base64 payload into bytes", () => {
    const bytes = decodeAudioContent({ audioContent: btoa("ID3-ish") });
    assert.deepEqual(
      [...bytes],
      [..."ID3-ish"].map((c) => c.charCodeAt(0)),
    );
  });

  // A 200 with no audio in it must not reach the browser as an empty clip: the
  // queue would treat the sentence as spoken and move on in silence.
  it("throws on a response with no audio in it", () => {
    assert.throws(() => decodeAudioContent({}), /no audioContent/);
    assert.throws(() => decodeAudioContent({ audioContent: "" }), /no audio/);
    assert.throws(() => decodeAudioContent(null), /no audioContent/);
  });
});
