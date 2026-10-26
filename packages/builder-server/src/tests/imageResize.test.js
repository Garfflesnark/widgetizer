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
const { savePageContent, getPage } = await import("../controllers/pageController.js");
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
  await writeMediaFile("resize-project", { files: [{
    filename: "photo.jpg", path: "/uploads/images/photo.jpg", type: "image/jpeg",
    width: 800, height: 600, sizes: {}, usedIn: [],
  }] });
  // Only isolated fixture templates are updated. Never touch a real project.
  await fs.copy(source, path.join(harness.getProjectDir("resize-project"), "widgets", "image"));
});
after(() => harness.cleanup());

it("keeps real linked and unlinked images proportional inside either container mode", async () => {
  for (const fullwidth of [false, true]) {
    for (const link of [null, { href: "https://example.com" }]) {
      const html = await renderWidget("resize-project", "w1", {
        type: "image", settings: { image: "/uploads/images/photo.jpg", image_width_percent: 55, fullwidth, link },
      }, themeSettings);
      assert.match(html, /<img[^>]+width="800"[^>]+height="600"/);
      assert.match(html, /& \.image-resize-target\s*\{\s*width: 55%;\s*margin-inline: auto;\s*& img\s*\{\s*max-width: 100%;\s*height: auto;/);
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
    widgets: { w1: { type: "image", settings: { image_width_percent: 55 } } },
  };
  const saved = response();
  await savePageContent(request(page), saved);
  assert.equal(saved.code, 200, JSON.stringify(saved.data));
  const loaded = response();
  await getPage(request(), loaded);
  assert.equal(loaded.code, 200);
  assert.equal(loaded.data.widgets.w1.settings.image_width_percent, 55);

  const preview = response();
  await generatePreview(request({ pageData: loaded.data, themeSettings, previewMode: "editor" }), preview);
  assert.equal(preview.code, 200);
  const exported = await harness.runExport();
  assert.equal(exported._status, 200, JSON.stringify(exported._json));
  const html = await fs.readFile(path.join(harness.latestExportDir(), "index.html"), "utf8");
  const resizeCss = (content) => content.match(/& \.image-resize-target\s*\{([^&}]+)/)?.[1].replace(/\s+/g, "");
  assert.equal(resizeCss(preview.html), "width:55%;margin-inline:auto;");
  assert.equal(resizeCss(html), resizeCss(preview.html));
  assert.match(html, /height:\s*auto;/);
  assert.doesNotMatch(html, /wz-image-resize-handle|previewRuntime\.js/);
});
