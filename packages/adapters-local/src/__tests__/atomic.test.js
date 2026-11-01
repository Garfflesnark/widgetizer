import { describe, it, beforeEach, afterEach, vi } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeFileAtomic, isAtomicTmpFile } from "../internal/atomic.js";

// writeFileAtomic stages to a UUID-suffixed tmp then renames, so a reader never
// sees a partial write and concurrent writers never collide on a shared tmp name.
// isAtomicTmpFile is the reader-side filter the adapter's list() uses to hide
// orphan tmps left by a process that died between the tmp-write and the rename.
let root;
const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "wz-atomic-"));
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(process, "platform", platformDescriptor);
  rmSync(root, { recursive: true, force: true });
});

const tmpFilesIn = (dir) => readdirSync(dir).filter((n) => n.endsWith(".tmp"));

describe("writeFileAtomic", () => {
  it("writes the content to the target and leaves no tmp file behind", async () => {
    const target = path.join(root, "basic.json");
    await writeFileAtomic(target, '{"hello":"world"}');
    assert.equal(readFileSync(target, "utf8"), '{"hello":"world"}');
    assert.deepEqual(tmpFilesIn(root), []);
  });

  it("overwrites an existing target (latest content wins)", async () => {
    const target = path.join(root, "overwrite.json");
    await writeFileAtomic(target, "v1");
    await writeFileAtomic(target, "v2-longer");
    assert.equal(readFileSync(target, "utf8"), "v2-longer");
    assert.deepEqual(tmpFilesIn(root), []);
  });

  it("handles concurrent writes to the same target without collision (one full payload wins, no orphan tmp)", async () => {
    const target = path.join(root, "item.json");
    const payloads = Array.from({ length: 12 }, (_, i) => `writer-${i}`);
    await assert.doesNotReject(Promise.all(payloads.map((p) => writeFileAtomic(target, p))));
    assert.ok(payloads.includes(readFileSync(target, "utf8")), "final content is exactly one writer's full payload");
    assert.deepEqual(tmpFilesIn(root), [], "no orphan tmp files after concurrent writes");
  });

  it("rejects when the target directory does not exist and leaves nothing behind", async () => {
    const missingDir = path.join(root, "nope");
    await assert.rejects(writeFileAtomic(path.join(missingDir, "x.json"), "data"));
    assert.equal(existsSync(missingDir), false);
  });
});

describe("Windows rename retry", () => {
  beforeEach(() => Object.defineProperty(process, "platform", { value: "win32" }));

  it("retries transient EPERM with the same completed staging file and one atomic replacement", async () => {
    const target = path.join(root, "transient.json");
    writeFileSync(target, "previous content");
    const originalRename = fs.rename;
    const denial = Object.assign(new Error("temporarily denied"), { code: "EPERM" });
    const sources = [];
    const rename = vi.spyOn(fs, "rename").mockImplementation(async (source, destination) => {
      sources.push(source);
      assert.equal(destination, target);
      assert.equal(readFileSync(target, "utf8"), "previous content");
      assert.equal(readFileSync(source, "utf8"), "complete new content");
      if (sources.length <= 2) throw denial;
      return originalRename(source, destination);
    });
    const write = vi.spyOn(fs, "writeFile");
    const wait = vi.spyOn(globalThis, "setTimeout");

    await writeFileAtomic(target, "complete new content");

    assert.equal(rename.mock.calls.length, 3);
    assert.equal(write.mock.calls.length, 1);
    assert.equal(new Set(sources).size, 1);
    assert.deepEqual(wait.mock.calls.map(([, delay]) => delay), [10, 20]);
    assert.equal(readFileSync(target, "utf8"), "complete new content");
    assert.deepEqual(tmpFilesIn(root), []);
  });

  it("bounds persistent EPERM to 250 ms of delays, preserves the destination and cleans staging", async () => {
    const target = path.join(root, "denied.json");
    writeFileSync(target, "previous content");
    const denial = Object.assign(new Error("permanently denied"), { code: "EPERM" });
    const rename = vi.spyOn(fs, "rename").mockRejectedValue(denial);
    const wait = vi.spyOn(globalThis, "setTimeout");

    await assert.rejects(writeFileAtomic(target, "new content"), (error) => error === denial);

    assert.equal(rename.mock.calls.length, 6);
    assert.equal(new Set(rename.mock.calls.map(([source]) => source)).size, 1);
    const delays = wait.mock.calls.map(([, delay]) => delay);
    assert.deepEqual(delays, [10, 20, 40, 80, 100]);
    assert.equal(delays.reduce((total, delay) => total + delay, 0), 250);
    assert.equal(readFileSync(target, "utf8"), "previous content");
    assert.deepEqual(tmpFilesIn(root), []);
  });

  it.each(["EACCES", "EBUSY", "ENOENT", "EXDEV"])("propagates unrelated %s immediately without touching the destination", async (code) => {
    const target = path.join(root, "other-error.json");
    writeFileSync(target, "previous content");
    const failure = Object.assign(new Error(code), { code });
    const rename = vi.spyOn(fs, "rename").mockRejectedValue(failure);
    const wait = vi.spyOn(globalThis, "setTimeout");

    await assert.rejects(writeFileAtomic(target, "new content"), (error) => error === failure);

    assert.equal(rename.mock.calls.length, 1);
    assert.equal(wait.mock.calls.length, 0);
    assert.equal(readFileSync(target, "utf8"), "previous content");
    assert.deepEqual(tmpFilesIn(root), []);
  });

  it.each(["linux", "darwin"])("leaves EPERM handling unchanged on %s", async (platform) => {
    Object.defineProperty(process, "platform", { value: platform });
    const target = path.join(root, "non-windows.json");
    writeFileSync(target, "previous content");
    const failure = Object.assign(new Error("denied"), { code: "EPERM" });
    const rename = vi.spyOn(fs, "rename").mockRejectedValue(failure);
    const wait = vi.spyOn(globalThis, "setTimeout");

    await assert.rejects(writeFileAtomic(target, "new content"), (error) => error === failure);

    assert.equal(rename.mock.calls.length, 1);
    assert.equal(wait.mock.calls.length, 0);
    assert.equal(readFileSync(target, "utf8"), "previous content");
    assert.deepEqual(tmpFilesIn(root), []);
  });

  it("does not retry staging-write EPERM and cleans a partial staging file", async () => {
    const target = path.join(root, "write-error.json");
    writeFileSync(target, "previous content");
    const originalWrite = fs.writeFile;
    const failure = Object.assign(new Error("write denied"), { code: "EPERM" });
    const write = vi.spyOn(fs, "writeFile").mockImplementation(async (source, _content, options) => {
      await originalWrite(source, "partial staging content", options);
      throw failure;
    });
    const rename = vi.spyOn(fs, "rename");
    const wait = vi.spyOn(globalThis, "setTimeout");

    await assert.rejects(writeFileAtomic(target, "new content"), (error) => error === failure);

    assert.equal(write.mock.calls.length, 1);
    assert.equal(rename.mock.calls.length, 0);
    assert.equal(wait.mock.calls.length, 0);
    assert.equal(readFileSync(target, "utf8"), "previous content");
    assert.deepEqual(tmpFilesIn(root), []);
  });
});

describe("isAtomicTmpFile", () => {
  it("matches a UUID-suffixed tmp filename", () => {
    assert.equal(isAtomicTmpFile("item.json.3f2504e0-4f89-41d3-9a0c-0305e82c3301.tmp"), true);
    assert.equal(isAtomicTmpFile("_order.json.3f2504e0-4f89-41d3-9a0c-0305e82c3301.tmp"), true);
  });

  it("does not match normal data files", () => {
    assert.equal(isAtomicTmpFile("item.json"), false);
    assert.equal(isAtomicTmpFile("_order.json"), false);
  });

  it("does not match a non-UUID .tmp file", () => {
    assert.equal(isAtomicTmpFile("item.json.tmp"), false);
    assert.equal(isAtomicTmpFile("random.tmp"), false);
  });
});
