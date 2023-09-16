#!/usr/bin/env -S deno run --allow-read
import type { YukariBookmarks } from "../lib/schema.ts";
import { ByteStream } from "../lib/bytestream.ts";
import { decode } from "../lib/serializable.ts";

const file = Deno.args[0];
if (!file) {
  console.error("error: too few arguments");
  Deno.exit(1);
}

const data = JSON.parse(Deno.readTextFileSync(file)) as YukariBookmarks;
if (!data.version || !data.SerializeEntity) {
  console.error("error: unsuppored file");
  Deno.exit(1);
}

const records = data.SerializeEntity.map((entity) => {
  const blob = new Uint8Array(entity.Blob);
  const [object] = decode(new ByteStream(blob));
  return object;
});

BigInt.prototype.toJSON = function () {
  return this.toString();
};
console.log(JSON.stringify(records));
