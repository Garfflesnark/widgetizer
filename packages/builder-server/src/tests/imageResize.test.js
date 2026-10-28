import { createComposition, dissolveComposition } from "@widgetizer/core/composition";
import { defaultImageTransform } from "@widgetizer/core/imageTransform";
import { after, before, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createExportHarness } from "./helpers/exportHarness.js";

const harness = await createExportHarness({
  rootPrefix: "widgetizer-image-resize",
  projectId: "resize-project",
  projectFolder: "resize-project",
  projectName: "Image resize",
  siteTitle: "Image resize",
  siteUrl: "https://example.com",
  theme: "arch",
});
const { LocalAssetStorageAdapter } = await import("@widgetizer/adapters-local");
const assetStorage = new LocalAssetStorageAdapter({
  dataRoot: path.dirname(path.dirname(harness.getProjectDir("resize-project"))),
});
const { savePageContent, getPage, updatePage } = await import("../controllers/pageController.js");
const { generatePreview } = await import("../controllers/previewController.js");
const { renderWidget } = await import("../services/renderingService.js");
const { writeMediaFile } = await import("../controllers/mediaController.js");
const source = fileURLToPath(new URL("../../../../themes/arch/widgets/image/", import.meta.url));
const themeSettings = { settings: { global: { general: [], colors: [] } } };
function response() {
  return {
    code: 200,
    data: null,
    html: "",
    headersSent: false,
    status(code) {
      this.code = code;
      return this;
    },
    json(data) {
      this.data = data;
      this.headersSent = true;
      return this;
    },
    send(html) {
      this.html = html;
      return this;
    },
  };
}
function request(body = {}) {
  return {
    params: { id: "index" },
    query: {},
    body,
    scope: harness.scope,
    activeProject: harness.projectRepo.getProjectById("resize-project"),
    adapters: { storage: harness.storage, assetStorage },
    app: { locals: {} },
    [Symbol.for("express-validator#contexts")]: [],
  };
}
before(async () => {
  await harness.seedProjectScaffold();
  await writeMediaFile("resize-project", {
    files: [
      {
        filename: "photo.jpg",
        path: "/uploads/images/photo.jpg",
        type: "image/jpeg",
        width: 800,
        height: 600,
        sizes: {},
        usedIn: [],
      },
    ],
  });
  // Only isolated fixture templates are updated. Never touch a real project.
  await fs.copy(source, path.join(harness.getProjectDir("resize-project"), "widgets", "image"));
});
after(() => harness.cleanup());

it("keeps real linked and unlinked images proportional inside either container mode", async () => {
  for (const fullwidth of [false, true]) {
    for (const link of [null, { href: "https://example.com" }]) {
      const html = await renderWidget(
        "resize-project",
        "w1",
        {
          type: "image",
          settings: { image: "/uploads/images/photo.jpg", image_width_percent: 55, fullwidth, link },
        },
        themeSettings,
      );
      assert.match(html, /<img[^>]+width="800"[^>]+height="600"/);
      assert.match(
        html,
        /& \.image-resize-target\s*\{\s*width: 55%;\s*margin-inline: auto;\s*& img\s*\{\s*width: 100%;\s*max-width: 100%;\s*height: auto;/,
      );
      assert.match(html, link ? /class="image-link/ : /class="image-wrapper/);
    }
  }
});

it("renders missing width identically to explicit 100%, retaining automatic height", async () => {
  const render = (settings) => renderWidget("resize-project", "w1", { type: "image", settings }, themeSettings);
  assert.equal(await render({}), await render({ image_width_percent: 100 }));
  const html = await render({});
  assert.match(html, /width: 100%;/);
  assert.match(html, /height: auto;/);
});

it("bounds template CSS even when stored data bypasses the editor", async () => {
  for (const [value, expected] of [
    [-20, 10],
    [200, 100],
    [50, 50],
    ["50; color:red", 10],
  ]) {
    const html = await renderWidget(
      "resize-project",
      "w1",
      { type: "image", settings: { image_width_percent: value } },
      themeSettings,
    );
    assert.match(html, new RegExp(`data-image-width="${expected}"`));
    assert.doesNotMatch(html, /color:red/);
  }
});

it("saves and reloads width through real storage and exports the same CSS as preview", async () => {
  const page = {
    id: "index",
    slug: "index",
    name: "Home",
    widgetsOrder: ["w1"],
    widgets: { w1: { type: "image", settings: { image_width_percent: 55, image_height_px: 347 } } },
  };
  const saved = response();
  await savePageContent(request(page), saved);
  assert.equal(saved.code, 200, JSON.stringify(saved.data));
  const loaded = response();
  await getPage(request(), loaded);
  assert.equal(loaded.code, 200);
  assert.equal(loaded.data.widgets.w1.settings.image_width_percent, 55);
  assert.equal(loaded.data.widgets.w1.settings.image_height_px, 347);

  const preview = response();
  await generatePreview(request({ pageData: loaded.data, themeSettings, previewMode: "editor" }), preview);
  assert.equal(preview.code, 200);
  const exported = await harness.runExport();
  assert.equal(exported._status, 200, JSON.stringify(exported._json));
  const html = await fs.readFile(path.join(harness.latestExportDir(), "index.html"), "utf8");
  const resizeCss = (content) => content.match(/& \.image-resize-target\s*\{([^&}]+)/)?.[1].replace(/\s+/g, "");
  assert.equal(resizeCss(preview.html), "width:55%;margin-inline:auto;");
  assert.equal(resizeCss(html), resizeCss(preview.html));
  assert.match(preview.html, /height:\s*347px;/);
  assert.match(html, /height:\s*347px;/);
  assert.match(html, /object-fit:\s*fill;/);
  assert.match(html, /height:\s*auto;/);
  assert.doesNotMatch(html, /wz-image-resize-handle|previewRuntime\.js/);
});

it("persists the opt-in transform and exports identical intrinsic scaling and normal-flow insets", async () => {
  const image_transform = { version: 1, reference: "intrinsic-fit", scale: { width: 50, height: 80 },
    flowInset: { inlinePercent: 10, blockPercent: 20 } };
  const page = { id: "index", slug: "index", name: "Home", widgetsOrder: ["w1"], widgets: {
    w1: { type: "image", settings: { image: "/uploads/images/photo.jpg", image_transform } },
  } };
  const saved = response();
  await savePageContent(request(page), saved);
  assert.equal(saved.code, 200);
  const loaded = response();
  await getPage(request(), loaded);
  assert.deepEqual(loaded.data.widgets.w1.settings.image_transform, image_transform);
  const preview = response();
  await generatePreview(request({ pageData: loaded.data, themeSettings, previewMode: "editor" }), preview);
  const exported = await harness.runExport();
  assert.equal(exported._status, 200);
  const html = await fs.readFile(path.join(harness.latestExportDir(), "index.html"), "utf8");
  const css = (text) => text.match(/--image-reference-width:[\s\S]+?object-fit: fill;/)?.[0].replace(/\s+/g, "");
  assert.ok(css(html));
  assert.equal(css(html), css(preview.html));
  assert.match(html, /min\(100cqw, 800px\)/);
  assert.match(html, /margin-inline-start: 10%;/);
  assert.match(html, /padding-block-start: calc\(var\(--image-reference-height\) \* 0.2\)/);
  assert.match(html, /height: calc\(var\(--image-reference-height\) \* 0.8\)/);
  assert.doesNotMatch(html, /wz-image-resize-handle/);
});

it("uses proportional dimensions for either Auto axis and rejects malformed transforms without changing legacy appearance", async () => {
  const render = (settings) => renderWidget("resize-project", "w1", { type: "image", settings }, themeSettings);
  for (const scale of [{ width: null, height: null }, { width: 50, height: null }, { width: null, height: 50 }]) {
    const html = await render({ image_transform: { version: 1, reference: "intrinsic-fit", scale, flowInset: { inlinePercent: 0, blockPercent: 0 } } });
    assert.match(html, /height: calc\(var\(--image-visible-width\) \* 900 \/ 1600\)/);
  }
  const legacy = { image_width_percent: 73, image_height_px: 350, fullwidth: true };
  const expected = await render(legacy);
  for (const value of [null, { version: 2 }, { version: 1, reference: "intrinsic-fit", scale: { width: "50", height: null }, flowInset: { inlinePercent: 0, blockPercent: 0 } }]) {
    assert.equal(await render({ ...legacy, image_transform: value }), expected);
  }
});

it("saves mixed-unit v2 dimensions and alignment exactly and exports the preview CSS for all four combinations", async () => {
  for (const [w, h] of [["%", "%"], ["%", "px"], ["px", "%"], ["px", "px"]]) {
    const image_transform = { version: 2, reference: "intrinsic-fit", alignment: "right", dimensions: {
      width: { unit: w, value: w === "px" ? 317 : 50 }, height: { unit: h, value: h === "px" ? 243 : 50 },
    }, flowInset: { inlinePercent: -5, blockPercent: 10 } };
    const page = { id: "index", slug: "index", name: "Home", widgetsOrder: ["w1"], widgets: {
      w1: { type: "image", settings: { image: "/uploads/images/photo.jpg", image_transform } },
    } };
    const saved = response(); await savePageContent(request(page), saved); assert.equal(saved.code, 200);
    const loaded = response(); await getPage(request(), loaded);
    assert.deepEqual(loaded.data.widgets.w1.settings.image_transform, image_transform);
    const preview = response(); await generatePreview(request({ pageData: loaded.data, themeSettings, previewMode: "editor" }), preview);
    assert.equal(preview.code, 200);
    const exported = await harness.runExport(); assert.equal(exported._status, 200);
    const html = await fs.readFile(path.join(harness.latestExportDir(), "index.html"), "utf8");
    const css = (text) => text.match(/--image-reference-width:[\s\S]+?object-fit: fill;/)?.[0].replace(/\s+/g, "");
    assert.ok(css(html)); assert.equal(css(html), css(preview.html));
    assert.match(html, /data-image-transform-version="2"/);
    const encoded = html.match(/data-image-transform=(["'])([\s\S]*?)\1/)[2];
    assert.deepEqual(JSON.parse(encoded.replaceAll("&quot;", '"').replaceAll("&#34;", '"')), image_transform);
    assert.match(html, /data-image-units="2"/);
    if (w === "px") assert.match(html, /--image-requested-width: 317px;/);
    if (h === "px") assert.match(html, /--image-requested-height: 243px;/);
    assert.doesNotMatch(html, /wz-image-menu|wz-image-resize-handle/);
  }
});

it("persists DragonFruit pins and exact image-owned spacing without overwriting resize flow insets", async () => {
  const image_transform = { version: 2, reference: "intrinsic-fit", alignment: "center", anchors: ["nw", "n"],
    dimensions: { width: { unit: "px", value: 317 }, height: { unit: "%", value: 80 } }, flowInset: { inlinePercent: 0, blockPercent: 10 } };
  const settings = { image_transform, top_spacing: "px", top_spacing_px: 23, bottom_spacing: "none", bottom_spacing_px: 999 };
  const page = { id: "index", slug: "index", name: "Home", widgetsOrder: ["w1"], widgets: { w1: { type: "image", settings } } };
  const saved = response(); await savePageContent(request(page), saved); assert.equal(saved.code, 200);
  const loaded = response(); await getPage(request(), loaded);
  assert.deepEqual(loaded.data.widgets.w1.settings.image_transform, image_transform);
  assert.equal(loaded.data.widgets.w1.settings.top_spacing_px, 23);
  const preview = response(); await generatePreview(request({ pageData: loaded.data, themeSettings, previewMode: "editor" }), preview);
  const exported = await harness.runExport(); assert.equal(exported._status, 200);
  const html = await fs.readFile(path.join(harness.latestExportDir(), "index.html"), "utf8");
  for (const content of [html, preview.html]) {
    assert.match(content, /padding-block-start: 23px;/);
    assert.match(content, /margin-block-end: 0;/);
    assert.match(content, /padding-block-end: 0;/);
    assert.match(content, /padding-block-start: calc\(var\(--image-reference-height\) \* 0.1\)/);
  }
  const marker = html.match(/data-image-transform=(["'])([\s\S]*?)\1/)[2];
  assert.deepEqual(JSON.parse(marker.replaceAll("&quot;", '"').replaceAll("&#34;", '"')).anchors, ["nw", "n"]);
  assert.doesNotMatch(html, /wz-image-resize-handle/);
});

it("keeps the existing container-constrained default and renders saved Full Width percentages unchanged", async () => {
  const imageSchema = await fs.readJson(path.join(source, "schema.json"));
  assert.equal(imageSchema.settings.find((setting) => setting.id === "fullwidth").default, false);
  const render = (settings) => renderWidget("resize-project", "w1", { type: "image", settings }, themeSettings);
  const legacy = await render({});
  assert.match(legacy, /max-width: var\(--container-max-width\)/);
  assert.equal(legacy, await render({ fullwidth: false, image_width_percent: 100, image_height_px: 0 }));
  const full = await render({ fullwidth: true, image_width_percent: 45 });
  assert.match(full, /data-image-width="45"/);
  assert.match(full, /max-width: none/);
});

it("bounds pixel height and retains Auto height for missing values", async () => {
  for (const [height, expected] of [
    [-1, 0],
    [3000, 2000],
    [347, 347],
    ["1;bad:css", 0],
  ]) {
    const html = await renderWidget(
      "resize-project",
      "w1",
      { type: "image", settings: { image_height_px: height } },
      themeSettings,
    );
    assert.match(html, new RegExp(`data-image-height="${expected}"`));
    assert.doesNotMatch(html, /bad:css/);
    if (expected) assert.match(html, new RegExp(`height: ${expected}px;`));
  }
});

it("project copies use installed themes and versioned latest snapshots rather than edited seed files", async () => {
  const { THEMES_SEED_DIR, getThemeDir } = await import("../config.js");
  const { ensureThemesDirectory, copyThemeToProject, buildLatestSnapshot } =
    await import("../controllers/themeController.js");
  const theme = "resize-seeding";
  const seed = path.join(THEMES_SEED_DIR, theme);
  const baseSchema = { type: "image", settings: [{ id: "fullwidth", type: "checkbox", default: false }] };
  await fs.outputJson(path.join(seed, "theme.json"), { name: "Resize seed", version: "1.0.0" });
  await fs.outputJson(path.join(seed, "widgets/image/schema.json"), baseSchema);
  await fs.outputFile(path.join(seed, "widgets/image/widget.liquid"), "old image template");
  await ensureThemesDirectory();
  // Editing the shipped source does not replace the already-installed copy.
  await fs.copy(source, path.join(seed, "widgets/image"));
  const project = path.join(harness.getProjectDir("resize-project"), "isolated-old-copy");
  await copyThemeToProject(theme, project);
  assert.deepEqual(await fs.readJson(path.join(project, "widgets/image/schema.json")), baseSchema);
  assert.deepEqual(await fs.readJson(path.join(getThemeDir(theme), "widgets/image/schema.json")), baseSchema);
  // A real versioned delta builds latest/ for subsequent project creation.
  const delta = path.join(seed, "updates/1.1.0");
  await fs.outputJson(path.join(delta, "theme.json"), { name: "Resize seed", version: "1.1.0" });
  await fs.copy(source, path.join(delta, "widgets/image"));
  await buildLatestSnapshot(theme);
  const nextProject = path.join(harness.getProjectDir("resize-project"), "isolated-new-copy");
  assert.equal(await copyThemeToProject(theme, nextProject), "1.1.0");
  assert.deepEqual(
    await fs.readJson(path.join(nextProject, "widgets/image/schema.json")),
    await fs.readJson(path.join(source, "schema.json")),
  );
  assert.deepEqual(await fs.readJson(path.join(project, "widgets/image/schema.json")), baseSchema);
});

it("saves Composition membership/stacking and shares exact preview/export placement with real image metadata", async () => {
  const transform = defaultImageTransform();
  transform.dimensions = { width: { unit: "px", value: 300 }, height: { unit: "%", value: 50 } };
  transform.anchors = ["ne"];
  const image = () => ({ type: "image", settings: { image: "/uploads/images/photo.jpg", image_transform: structuredClone(transform) }, blocks: {}, blocksOrder: [] });
  const page = createComposition({ id: "index", slug: "index", name: "Home", widgets: { a: image(), b: image(), after: image() }, widgetsOrder: ["a", "b", "after"] }, "canvas", ["a", "b"], {
    a: { x: 0.5, y: 0.15, pivot: { x: 0.5, y: 0 } }, b: { x: 0.4, y: 0.2, pivot: { x: 0, y: 0 } },
  });
  page.layout.compositions.canvas.stackOrder = ["b", "a"];
  page.layout.contentOrder.reverse();
  page.widgetsOrder = ["after", "a", "b"];
  const saved = response(); await savePageContent(request(page), saved);
  assert.equal(saved.code, 200, JSON.stringify(saved.data));
  const loaded = response(); await getPage(request(), loaded);
  assert.deepEqual(loaded.data.layout, page.layout);
  assert.deepEqual(loaded.data.widgetsOrder, ["after", "a", "b"]);
  assert.deepEqual(loaded.data.widgets.a.settings.image_transform, transform);
  const preview = response(); await generatePreview(request({ pageData: loaded.data, themeSettings, previewMode: "editor" }), preview);
  assert.equal(preview.code, 200);
  assert.match(preview.html, /data-composition-id="canvas"/);
  const exported = await harness.runExport(); assert.equal(exported._status, 200, JSON.stringify(exported._json));
  const html = await fs.readFile(path.join(harness.latestExportDir(), "index.html"), "utf8");
  const css = (text) => text.match(/left:\s*37.5%;\s*top:\s*22.5%;\s*width:\s*25%;\s*height:\s*37.5%;\s*z-index:\s*2/);
  assert.ok(css(preview.html)); assert.ok(css(html));
  assert.match(html, /aspect-ratio:\s*1200\s*\/\s*800/);
  assert.doesNotMatch(html, /wz-image-resize-handle|previewRuntime\.js/);
  const unsupported = response(); await savePageContent(request({ ...loaded.data, layout: { ...page.layout, version: 99 } }), unsupported);
  assert.equal(unsupported.code, 422);
  const oldClient = response(), oldPage = { ...loaded.data }; delete oldPage.layout;
  await savePageContent(request(oldPage), oldClient); assert.equal(oldClient.code, 409);
  const details = response(); await updatePage(request({ slug: "index", name: "Renamed composition page" }), details);
  assert.equal(details.code, 200, JSON.stringify(details.data));
  const afterDetails = response(); await getPage(request(), afterDetails);
  assert.deepEqual(afterDetails.data.layout, loaded.data.layout);
  assert.deepEqual(afterDetails.data.widgetsOrder, loaded.data.widgetsOrder);
  const reverted = response(); await savePageContent(request(dissolveComposition(loaded.data, "canvas")), reverted); assert.equal(reverted.code, 200);
});
