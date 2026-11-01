import { mock } from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import path from "node:path";

// Inject a denial at the filesystem boundary without relying on POSIX modes,
// Windows ACL changes, or an unprivileged runner. All other I/O stays real.
export async function withFsFailure(target, operations, body, when = async () => true) {
  const denied = path.resolve(target);
  let failures = 0;
  const mocks = operations.map((operation) => {
    const original = fs[operation];
    return mock.method(fs, operation, async (source, ...args) => {
      const resolved = path.resolve(source);
      if ((resolved === denied || resolved.startsWith(`${denied}${path.sep}`)) && await when()) {
        failures++;
        throw Object.assign(new Error(`EACCES: injected ${operation} denial for ${source}`), {
          code: "EACCES", path: source, syscall: operation,
        });
      }
      return original(source, ...args);
    });
  });
  try {
    const result = await body();
    assert.ok(failures > 0, `The ${operations.join("/")} fault at ${denied} was not exercised`);
    return result;
  } finally {
    for (const method of mocks) method.mock.restore();
  }
}
