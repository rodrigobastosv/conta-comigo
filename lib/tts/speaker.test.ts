import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickDeviceVoice } from "./speaker.ts";

/**
 * The real voice list from a macOS machine, in the order the browser returns it.
 * Note that the eight novelty voices sort ahead of Luciana — which is exactly why
 * "take the first pt-BR voice" is wrong.
 */
const MACOS = [
  { name: "Eddy (Portuguese (Brazil))", lang: "pt-BR" },
  { name: "Flo (Portuguese (Brazil))", lang: "pt-BR" },
  { name: "Grandma (Portuguese (Brazil))", lang: "pt-BR" },
  { name: "Grandpa (Portuguese (Brazil))", lang: "pt-BR" },
  { name: "Joana", lang: "pt-PT" },
  { name: "Luciana", lang: "pt-BR" },
  { name: "Reed (Portuguese (Brazil))", lang: "pt-BR" },
  { name: "Rocko (Portuguese (Brazil))", lang: "pt-BR" },
  { name: "Sandy (Portuguese (Brazil))", lang: "pt-BR" },
  { name: "Shelley (Portuguese (Brazil))", lang: "pt-BR" },
];

describe("pickDeviceVoice", () => {
  it("picks Luciana on macOS, not the novelty voice that sorts first", () => {
    assert.equal(pickDeviceVoice(MACOS)?.name, "Luciana");
  });

  it("picks the Android voice when that is what the device has", () => {
    const android = [
      { name: "Google português do Brasil", lang: "pt-BR" },
      { name: "Google português", lang: "pt-PT" },
    ];
    assert.equal(
      pickDeviceVoice(android)?.name,
      "Google português do Brasil",
    );
  });

  it("prefers pt-BR over pt-PT", () => {
    const mixed = [
      { name: "Joana", lang: "pt-PT" },
      { name: "Alguém", lang: "pt-BR" },
    ];
    assert.equal(pickDeviceVoice(mixed)?.name, "Alguém");
  });

  it("takes an unknown plain voice over a novelty one", () => {
    const odd = [
      { name: "Rocko (Portuguese (Brazil))", lang: "pt-BR" },
      { name: "Voz Nova", lang: "pt-BR" },
    ];
    assert.equal(pickDeviceVoice(odd)?.name, "Voz Nova");
  });

  // A cartoon voice is still better than no story.
  it("falls back to a novelty voice rather than nothing", () => {
    const only = [{ name: "Eddy (Portuguese (Brazil))", lang: "pt-BR" }];
    assert.equal(pickDeviceVoice(only)?.name, "Eddy (Portuguese (Brazil))");
  });

  it("accepts pt_BR with an underscore", () => {
    const underscore = [{ name: "Maria", lang: "pt_BR" }];
    assert.equal(pickDeviceVoice(underscore)?.name, "Maria");
  });

  it("returns null when the device speaks no Portuguese at all", () => {
    const english = [{ name: "Samantha", lang: "en-US" }];
    assert.equal(pickDeviceVoice(english), null);
  });

  it("survives a device with no voices installed", () => {
    assert.equal(pickDeviceVoice([]), null);
  });
});
