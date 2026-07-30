/**
 * Structured output and streaming have a real conflict: what arrives on the wire
 * is JSON, not prose. If you wait for the JSON to close before showing anything,
 * you throw away the very latency streaming exists to win — and a 5-year-old
 * gives up after 3 seconds of a frozen screen.
 *
 * This reader extracts ONE string field from a JSON that is still arriving,
 * decoding escapes and never emitting half an escape sequence. It is what lets
 * the scene appear word by word and, together with `Sentences`, what fires the
 * TTS per sentence.
 */
export class FieldReader {
  private buffer = "";
  private cursor = -1; // next position to decode; -1 = we have not found the field yet
  private closed = false;
  private readonly marker: string;

  constructor(field: string) {
    this.marker = `"${field}"`;
  }

  get done(): boolean {
    return this.closed;
  }

  /** Takes a chunk of the JSON and returns only the new, already decoded text. */
  push(chunk: string): string {
    if (this.closed) return "";
    this.buffer += chunk;

    if (this.cursor < 0) {
      const start = this.findStringStart();
      if (start < 0) return "";
      this.cursor = start;
    }

    let out = "";
    let i = this.cursor;

    while (i < this.buffer.length) {
      const c = this.buffer[i];

      if (c === '"') {
        this.closed = true;
        i += 1;
        break;
      }

      if (c === "\\") {
        // We need at least the next character to know what this is.
        if (i + 1 >= this.buffer.length) break;
        const escape = this.buffer[i + 1];

        if (escape === "u") {
          // \uXXXX needs 4 hex digits; if they have not all arrived, wait for the next chunk.
          if (i + 5 >= this.buffer.length) break;
          out += String.fromCharCode(
            parseInt(this.buffer.slice(i + 2, i + 6), 16),
          );
          i += 6;
          continue;
        }

        out += UNESCAPE[escape] ?? escape;
        i += 2;
        continue;
      }

      out += c;
      i += 1;
    }

    this.cursor = i;
    return out;
  }

  /** Finds `"field"` followed by `:` and the opening quote; returns the index of the value's 1st char. */
  private findStringStart(): number {
    const key = this.buffer.indexOf(this.marker);
    if (key < 0) return -1;

    const colon = this.buffer.indexOf(":", key + this.marker.length);
    if (colon < 0) return -1;

    const opening = this.buffer.indexOf('"', colon + 1);
    if (opening < 0) return -1;

    return opening + 1;
  }
}

const UNESCAPE: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
  '"': '"',
  "\\": "\\",
  "/": "/",
};

/**
 * Splits text into sentences as it arrives. Each complete sentence is delivered
 * exactly once — it is the unit the TTS receives so it can play in a queue while
 * the rest of the scene is still being generated.
 */
export class Sentences {
  private pending = "";

  push(text: string): string[] {
    this.pending += text;
    const ready: string[] = [];

    // End of sentence = final punctuation followed by a space/newline.
    const sentenceEnd = /[.!?…](?=[\s\n])/g;
    let cut = 0;
    let m: RegExpExecArray | null;

    while ((m = sentenceEnd.exec(this.pending)) !== null) {
      const sentence = this.pending.slice(cut, m.index + 1).trim();
      if (sentence) ready.push(sentence);
      cut = m.index + 1;
    }

    if (cut > 0) this.pending = this.pending.slice(cut);
    return ready;
  }

  /** Call at the end of the stream: the last sentence has no space after its punctuation. */
  drain(): string[] {
    const rest = this.pending.trim();
    this.pending = "";
    return rest ? [rest] : [];
  }
}
