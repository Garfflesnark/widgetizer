import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { applyThemeUpdateToDir } from "../services/themeUpdateService.js";

async function makeFixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "apply-"));
  const src = path.join(base, "source");
  const proj = path.join(base, "project");
  await fs.outputJson(path.join(src, "theme.json"), {
    version: "1.3.0",
    settings: {
      global: {
        colors: [
          { id: "primary", value: "#00f", default: "#00f" },
          { id: "accent", value: "#0f0", default: "#0f0" },
        ],
      },
    },
  });
  await fs.outputFile(path.join(src, "assets", "app.css"), "new");
  await fs.outputJson(path.join(src, "menus", "footer.json"), { name: "Footer", items: [] });
  await fs.outputJson(path.join(proj, "theme.json"), {
    version: "1.0.0",
    settings: {
      global: {
        colors: [
          { id: "primary", value: "#123456", default: "#00f" },
          { id: "gone", value: "#999", default: "#999" },
        ],
      },
    },
  });
  await fs.outputFile(path.join(proj, "assets", "old.css"), "stale");
  await fs.outputJson(path.join(proj, "menus", "main.json"), { name: "Main (edited)", items: [] });
  await fs.outputJson(path.join(proj, "pages", "home.json"), { id: "home", title: "My Home" });
  return { src, proj };
}

test("applyThemeUpdateToDir: wholesale replace, add-only, merge, version", async () => {
  const { src, proj } = await makeFixture();
  const result = await applyThemeUpdateToDir({ themeSourceDir: src, projectDir: proj });
  assert.equal(result.newVersion, "1.3.0");
  assert.equal(await fs.pathExists(path.join(proj, "assets", "old.css")), false);
  assert.equal(await fs.readFile(path.join(proj, "assets", "app.css"), "utf8"), "new");
  assert.equal((await fs.readJson(path.join(proj, "menus", "main.json"))).name, "Main (edited)");
  const footer = await fs.readJson(path.join(proj, "menus", "footer.json"));
  assert.equal(footer.id, "footer");
  assert.ok(footer.uuid);
  assert.equal((await fs.readJson(path.join(proj, "pages", "home.json"))).title, "My Home");
  const merged = await fs.readJson(path.join(proj, "theme.json"));
  const ids = merged.settings.global.colors.map((c) => c.id);
  assert.deepEqual(ids, ["primary", "accent"]);
  // User's customized value survives; the new setting keeps the theme default
  assert.equal(merged.settings.global.colors[0].value, "#123456");
  assert.equal(merged.settings.global.colors[1].value, "#0f0");
});

// A language's pages and a collection's main-language items both publish into a
// folder named by their code or slugPrefix. An update that brings in a collection
// prefixed with one of the project's languages is refused before the swap.
const collectionSchema = (type, extra = {}) => ({
  type,
  displayName: "Product",
  displayNamePlural: "Products",
  hasItemPages: true,
  settings: [{ type: "text", id: "title", label: "Title", required: true, usedAsTitle: true }],
  ...extra,
});
const writeCollection = (src, type, schema) =>
  fs.outputJson(path.join(src, "collection-types", type, "schema.json"), schema);

test("applyThemeUpdateToDir: refuses a collection that would publish into a language folder", async () => {
  const { src, proj } = await makeFixture();
  await writeCollection(src, "products", collectionSchema("products", { slugPrefix: "it" }));

  await assert.rejects(applyThemeUpdateToDir({ themeSourceDir: src, projectDir: proj, languages: ["it"] }), (error) => {
    assert.match(error.message, /"Products" collection in the it\/ folder.*This update was not applied/s);
    assert.equal(error.statusCode, 409);
    return true;
  });
  assert.equal(await fs.readFile(path.join(proj, "assets", "old.css"), "utf8"), "stale", "the project is untouched");
  assert.equal((await fs.readJson(path.join(proj, "theme.json"))).version, "1.0.0");
  assert.equal(await fs.pathExists(path.join(proj, "collection-types")), false);
  assert.equal(await fs.pathExists(path.join(proj, ".theme-update-stage")), false, "the staged copy is removed");
});

test("applyThemeUpdateToDir: a slugPrefix left out defaults to the type, and still clashes", async () => {
  const { src, proj } = await makeFixture();
  await writeCollection(src, "it", collectionSchema("it"));

  await assert.rejects(
    applyThemeUpdateToDir({ themeSourceDir: src, projectDir: proj, languages: ["it"] }),
    /in the it\/ folder/,
  );
});

// An interrupted run is undone before the check, so a refused update still
// repairs a project that run left half-swapped.
test("applyThemeUpdateToDir: a refused update still undoes an interrupted run", async () => {
  const { src, proj } = await makeFixture();
  await writeCollection(src, "products", collectionSchema("products", { slugPrefix: "it" }));
  await fs.remove(path.join(proj, "assets", "old.css"));
  await fs.outputFile(path.join(proj, ".theme-update-backup", "assets", "old.css"), "stale");
  await fs.outputJson(path.join(proj, ".theme-update-backup", ".in-progress"), { added: [], placedWhereAbsent: [] });

  await assert.rejects(
    applyThemeUpdateToDir({ themeSourceDir: src, projectDir: proj, languages: ["it"] }),
    (error) => error.statusCode === 409,
  );
  assert.equal(await fs.readFile(path.join(proj, "assets", "old.css"), "utf8"), "stale", "the displaced file is back");
  assert.equal(await fs.pathExists(path.join(proj, ".theme-update-backup")), false);
});

// A collection-types the update cannot read is a failed preparation, reported
// in the same words as any other, not a raw filesystem error.
test("applyThemeUpdateToDir: an unreadable collection-types fails the preparation safely", async () => {
  const { src, proj } = await makeFixture();
  await fs.outputFile(path.join(src, "collection-types"), "not a folder");

  await assert.rejects(
    applyThemeUpdateToDir({ themeSourceDir: src, projectDir: proj, languages: ["it"] }),
    /The update could not be prepared, so nothing in the project was changed/,
  );
  assert.equal(await fs.readFile(path.join(proj, "assets", "old.css"), "utf8"), "stale");
  assert.equal(await fs.pathExists(path.join(proj, ".theme-update-stage")), false);
});

// What the project would not load publishes nothing, so it is no clash.
test("applyThemeUpdateToDir: no clash from another language, list-only or invalid collections", async () => {
  const { src, proj } = await makeFixture();
  await writeCollection(src, "products", collectionSchema("products", { slugPrefix: "it" }));
  await writeCollection(src, "notes", collectionSchema("notes", { slugPrefix: "el", hasItemPages: false }));
  await writeCollection(src, "broken", { type: "broken", hasItemPages: true, slugPrefix: "el" });

  const result = await applyThemeUpdateToDir({ themeSourceDir: src, projectDir: proj, languages: ["el"] });
  assert.equal(result.newVersion, "1.3.0");
});
