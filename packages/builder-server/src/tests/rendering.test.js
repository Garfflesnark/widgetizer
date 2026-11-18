/**
 * Rendering Pipeline Test Suite
 *
 * Tests renderWidget and renderPageLayout from the rendering service.
 * Uses a minimal test project with real core widgets (core-spacer, core-divider)
 * to verify the full rendering pipeline: schema defaults, settings merge,
 * link resolution, menu resolution, sanitization, and Liquid output.
 *
 * Run with: node --test server/tests/rendering.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import path from "path";
import os from "os";

// ============================================================================
// Isolated test environment
// ============================================================================

const TEST_ROOT = path.join(os.tmpdir(), `widgetizer-render-test-${Date.now()}`);
const TEST_DATA_DIR = path.join(TEST_ROOT, "data");
const TEST_THEMES_DIR = path.join(TEST_ROOT, "themes");

process.env.DATA_ROOT = TEST_DATA_DIR;
process.env.THEMES_ROOT = TEST_THEMES_DIR;
process.env.NODE_ENV = "test";

const { getProjectDir, getProjectPagesDir, getProjectMenusDir } = await import("../config.js");

const projectRepo = await import("../db/repositories/projectRepository.js");
const { writeMediaFile } = await import("../controllers/mediaController.js");
const { renderWidget, renderPageLayout, buildRenderDeps } = await import("../services/renderingService.js");
const { renderWidget: engineRenderWidget } = await import("@widgetizer/render-engine");
const { closeDb } = await import("../db/index.js");

// ============================================================================
// Test constants
// ============================================================================

const PROJECT_ID = "render-test-uuid";
const PROJECT_FOLDER = "render-test-project";

// Minimal raw theme settings (what theme.json looks like)
const RAW_THEME_SETTINGS = {
  settings: {
    global: {
      general: [{ id: "favicon", value: "/uploads/images/site-icon.svg", default: "" }],
      colors: [{ id: "primary_color", value: "#0066cc", default: "#000000" }],
    },
  },
};

// ============================================================================
// Global teardown
// ============================================================================

after(async () => {
  closeDb();
  await fs.remove(TEST_ROOT);
});

// ============================================================================
// Setup
// ============================================================================

before(async () => {
  // Seed projects in the test DB
  await projectRepo.writeProjectsData({
    projects: [
      {
        id: PROJECT_ID,
        folderName: PROJECT_FOLDER,
        name: "Render Test Project",
        siteTitle: "Render Test Site",
        theme: "__render_test_theme__",
        siteUrl: "https://example.com",
        created: new Date().toISOString(),
      },
    ],
    activeProjectId: PROJECT_ID,
  });

  const projectDir = getProjectDir(PROJECT_FOLDER);

  // Create project directory structure
  await fs.ensureDir(projectDir);
  await fs.ensureDir(getProjectPagesDir(PROJECT_FOLDER));
  await fs.ensureDir(path.join(getProjectPagesDir(PROJECT_FOLDER), "global"));
  await fs.ensureDir(path.join(projectDir, "snippets"));
  await fs.ensureDir(path.join(projectDir, "widgets"));
  await fs.ensureDir(getProjectMenusDir(PROJECT_FOLDER));

  const archThemeDir = path.resolve("themes/arch");
  await fs.copy(path.join(archThemeDir, "widgets/global/header"), path.join(projectDir, "widgets/global/header"));
  await fs.copy(path.join(archThemeDir, "widgets/global/footer"), path.join(projectDir, "widgets/global/footer"));
  await fs.copy(path.join(archThemeDir, "snippets"), path.join(projectDir, "snippets"));

  // Create media data
  await writeMediaFile(
    PROJECT_ID,
    {
      files: [
        {
          id: "img-1",
          filename: "hero.jpg",
          path: "/uploads/images/hero.jpg",
          type: "image/jpeg",
          width: 800,
          height: 600,
          usedIn: [],
          sizes: { medium: { path: "/uploads/images/hero-medium.jpg", width: 400, height: 300 } },
        },
        {
          id: "img-2",
          filename: "site-icon.svg",
          path: "/uploads/images/site-icon.svg",
          type: "image/svg+xml",
          width: 512,
          height: 512,
          usedIn: [],
        },
      ],
    },
  );

  // Create test pages for link resolution
  const pagesDir = getProjectPagesDir(PROJECT_FOLDER);
  await fs.writeFile(
    path.join(pagesDir, "home.json"),
    JSON.stringify({ name: "Home", slug: "home", uuid: "page-uuid-home", widgets: {} }),
  );
  await fs.writeFile(
    path.join(pagesDir, "about.json"),
    JSON.stringify({ name: "About Us", slug: "about-us", uuid: "page-uuid-about", widgets: {} }),
  );

  // Create a minimal layout.liquid for renderPageLayout tests
  await fs.writeFile(
    path.join(projectDir, "layout.liquid"),
    `<!DOCTYPE html>
<html lang="en">
<head>
  <title>{{ page.name }}</title>
  {% if site_icons.primaryIconHref != blank %}<link rel="icon" href="{{ site_icons.primaryIconHref }}" {% if site_icons.primaryIconType != blank %}type="{{ site_icons.primaryIconType }}"{% endif %}{% if site_icons.primaryIconSizes != blank %} sizes="{{ site_icons.primaryIconSizes }}"{% endif %}>{% endif %}
  {% if site_icons.serpIconHref != blank %}<link rel="icon" href="{{ site_icons.serpIconHref }}" type="image/png" sizes="192x192">{% endif %}
  {% if site_icons.appleTouchIconHref != blank %}<link rel="apple-touch-icon" href="{{ site_icons.appleTouchIconHref }}" sizes="180x180">{% endif %}
  {% seo %}
</head>
<body class="{{ body_class }}">
  {{ header | raw }}
  <main>{{ main_content | raw }}</main>
  {{ footer | raw }}
</body>
</html>`,
  );

  // Create a simple theme widget for testing non-core widgets
  const testWidgetDir = path.join(projectDir, "widgets", "test-hero");
  await fs.ensureDir(testWidgetDir);
  await fs.writeFile(
    path.join(testWidgetDir, "widget.liquid"),
    `<section class="hero">
  <h1>{{ widget.settings.heading }}</h1>
  {% if widget.settings.subtitle %}<p>{{ widget.settings.subtitle }}</p>{% endif %}
  {% if widget.settings.cta_link.href != blank %}<a href="{{ widget.settings.cta_link.href }}">{{ widget.settings.cta_link.text }}</a>{% endif %}
</section>`,
  );
  await fs.writeFile(
    path.join(testWidgetDir, "schema.json"),
    JSON.stringify(
      {
        type: "test-hero",
        settings: [
          { id: "heading", type: "text", default: "Default Heading" },
          { id: "subtitle", type: "text", default: "" },
          { id: "cta_link", type: "link", default: { href: "", text: "", target: "_self" } },
          { id: "nav_menu", type: "menu", default: null },
        ],
        blocks: [
          {
            type: "feature",
            settings: [
              { id: "label", type: "text", default: "Feature" },
              { id: "link", type: "link", default: { href: "", text: "" } },
            ],
          },
        ],
      },
      null,
      2,
    ),
  );

  // Create a test menu
  await fs.writeFile(
    path.join(getProjectMenusDir(PROJECT_FOLDER), "main-nav.json"),
    JSON.stringify(
      {
        id: "main-nav",
        uuid: "menu-uuid-main-nav",
        name: "Main Navigation",
        items: [
          { id: "item_1", label: "Home", link: "/", pageUuid: "page-uuid-home" },
          { id: "item_2", label: "About", link: "/about", pageUuid: "page-uuid-about" },
          { id: "item_3", label: "External", link: "https://external.com" },
          {
            id: "item_4",
            label: "Parent",
            link: "#",
            items: [{ id: "item_4_1", label: "Child", link: "/child", pageUuid: "page-uuid-home" }],
          },
        ],
      },
      null,
      2,
    ),
  );
});

// ============================================================================
// renderWidget — core widgets
// ============================================================================

describe("renderWidget — core widgets", () => {
  it("renders core-spacer with default settings", async () => {
    const html = await renderWidget(
      PROJECT_ID,
      "spacer-1",
      {
        type: "core-spacer",
        settings: {},
      },
      RAW_THEME_SETTINGS,
      "preview",
      null,
      null,
    );

    assert.ok(html.includes("core-spacer"));
    assert.ok(html.includes("spacer-1"));
    // Default height from schema is 40
    assert.ok(html.includes("height: 40px"));
  });

  it("renders core-spacer with custom settings", async () => {
    const html = await renderWidget(
      PROJECT_ID,
      "spacer-2",
      {
        type: "core-spacer",
        settings: { height: 100, mobileHeight: 50, showOnMobile: true },
      },
      RAW_THEME_SETTINGS,
      "preview",
      null,
      null,
    );

    assert.ok(html.includes("height: 100px"));
    assert.ok(html.includes("height: 50px"));
  });

  it("passes widget index to template", async () => {
    const html = await renderWidget(
      PROJECT_ID,
      "spacer-idx",
      { type: "core-spacer", settings: {} },
      RAW_THEME_SETTINGS,
      "preview",
      null,
      3,
    );
    assert.ok(html.includes('data-widget-index="3"'));
  });

  it("returns error HTML when widget template is missing", async () => {
    const html = await renderWidget(
      PROJECT_ID,
      "missing-1",
      {
        type: "nonexistent-widget",
        settings: {},
      },
      RAW_THEME_SETTINGS,
      "preview",
      null,
      null,
    );

    assert.ok(html.includes("widget-error") || html.includes("not found"));
  });
});

// ============================================================================
// renderWidget — theme widgets with schema defaults
// ============================================================================

describe("renderWidget — theme widgets & schema defaults", () => {
  it("renders with schema default when setting not provided", async () => {
    const html = await renderWidget(
      PROJECT_ID,
      "hero-1",
      {
        type: "test-hero",
        settings: {},
      },
      RAW_THEME_SETTINGS,
      "preview",
      null,
      null,
    );

    // Schema default for heading is "Default Heading"
    assert.ok(html.includes("Default Heading"));
  });

  it("overrides schema default with provided setting", async () => {
    const html = await renderWidget(
      PROJECT_ID,
      "hero-2",
      {
        type: "test-hero",
        settings: { heading: "Custom Title" },
      },
      RAW_THEME_SETTINGS,
      "preview",
      null,
      null,
    );

    assert.ok(html.includes("Custom Title"));
    assert.ok(!html.includes("Default Heading"));
  });

  it("auto-escapes text settings (XSS protection)", async () => {
    const html = await renderWidget(
      PROJECT_ID,
      "hero-xss",
      {
        type: "test-hero",
        settings: { heading: '<script>alert("xss")</script>' },
      },
      RAW_THEME_SETTINGS,
      "preview",
      null,
      null,
    );

    assert.ok(!html.includes("<script>alert"));
    assert.ok(html.includes("&lt;script&gt;") || html.includes("&amp;"));
  });
});

describe("Arch Header v1", () => {
  it("keeps legacy Header rendering by default", async () => {
    const html = await renderWidget(PROJECT_ID, "header-legacy", {
      type: "header",
      settings: { logoText: "Existing Brand", headerNavigation: "main-nav", three_region_enabled: false },
    }, RAW_THEME_SETTINGS, "preview", null, null);

    assert.ok(html.includes("Existing Brand"));
    assert.ok(html.includes("header-branding"));
    assert.doesNotMatch(html, /<header[^>]*class="[^"]*\bheader-v1\b/);
  });

  it("renders visible links, button styling, independent logo visibility and social icons in assigned regions", async () => {
    const html = await renderWidget(PROJECT_ID, "header-v1", {
      type: "header",
      settings: {
        three_region_enabled: true,
        logoText: "Accessible Brand",
        show_logo_image: false,
        show_logo_text: true,
        logo_region: "left",
        navigation_region: "center",
        social_region: "right",
        social_icon_size: 48,
        nav_label: "Primary site links",
        header_links: [
          { label: "About", destination: "about-us", destination_type: "page", presentation: "link" },
          { label: "Contact", destination: "https://example.com/contact", destination_type: "url", presentation: "button" },
          { label: "Unsafe", destination: "javascript:alert(1)", destination_type: "url", presentation: "link" },
        ],
        header_social_links: [
          { icon: "instagram", url: "https://example.com/social", accessible_label: "Photo updates" },
        ],
      },
    }, RAW_THEME_SETTINGS, "preview", null, null);

    assert.ok(html.includes("header-region--left"));
    assert.ok(html.includes("header-region--center"));
    assert.ok(html.includes("header-region--right"));
    assert.ok(html.includes("Accessible Brand"));
    assert.doesNotMatch(html, /<img[^>]*header-logo-image/);
    assert.ok(html.includes('aria-label="Primary site links"'));
    assert.ok(html.includes('href="about-us.html"'));
    assert.ok(html.includes('href="https://example.com/contact"'));
    assert.ok(html.indexOf("About") < html.indexOf("Contact"));
    assert.ok(html.includes("nav-link--button"));
    assert.ok(html.includes('aria-label="Photo updates"'));
    assert.ok(html.includes('target="_blank" rel="noopener noreferrer"'));
    assert.ok(html.includes("--header-social-icon-size: 48px"));
    assert.ok(!html.includes("javascript:alert"));
  });

  it("keeps contact and border visibility independent and renders navigation tab preferences", async () => {
    const hiddenHtml = await renderWidget(PROJECT_ID, "header-v1-visibility-off", {
      type: "header",
      settings: {
        three_region_enabled: true,
        show_contact_details: false,
        show_bottom_border: false,
        contactDetailsLine1: "Stored phone detail",
        contactDetailsLine2: "Stored address detail",
        logo_region: "left", navigation_region: "center", social_region: "right",
        header_links: [
          { label: "Same tab", destination: "https://example.com/same", destination_type: "url", presentation: "link", open_in_new_tab: "false" },
          { label: "New tab", destination: "https://example.com/new", destination_type: "url", presentation: "button", open_in_new_tab: "true" },
          { label: "Internal new tab", destination: "old-about", destination_type: "page", destination_page_uuid: "page-uuid-about", presentation: "link", open_in_new_tab: "true" },
        ],
      },
    }, RAW_THEME_SETTINGS, "preview", null, null);

    assert.match(hiddenHtml, /header-no-bottom-border/);
    assert.doesNotMatch(hiddenHtml, /Stored phone detail|Stored address detail/);
    assert.match(hiddenHtml, /href="https:\/\/example\.com\/same" class="nav-link"/);
    assert.doesNotMatch(hiddenHtml, /href="https:\/\/example\.com\/same"[^>]*target=/);
    assert.match(hiddenHtml, /href="https:\/\/example\.com\/new"[^>]*target="_blank" rel="noopener noreferrer"/);
    assert.match(hiddenHtml, /href="about-us\.html"[^>]*target="_blank" rel="noopener noreferrer"/);
    assert.match(hiddenHtml, /--arch-header-navigation-font-size: 16px/);
    assert.match(hiddenHtml, /--arch-header-navigation-font-family: var\(--typography-body_font-family, inherit\)/);
    assert.match(hiddenHtml, /--arch-header-navigation-text-color: var\(--header-nav-top-link-color\)/);
    assert.match(hiddenHtml, /--arch-header-navigation-hover-color: var\(--header-nav-top-link-hover-color\)/);
    assert.match(hiddenHtml, /--arch-header-navigation-button-color: var\(--accent-text\)/);
    assert.match(hiddenHtml, /font-size: var\(--arch-header-navigation-font-size\)/);
    assert.doesNotMatch(hiddenHtml, /\.nav-link--button \{[^}]*font-size:/);
    assert.match(hiddenHtml, /--arch-header-logo-font-size: 24px/);
    assert.match(hiddenHtml, /--arch-header-logo-text-color: inherit/);

    const legacyDefaultHtml = await renderWidget(PROJECT_ID, "header-legacy-contact-default", {
      type: "header",
      settings: { three_region_enabled: false, contactDetailsLine1: "Legacy phone" },
    }, RAW_THEME_SETTINGS, "preview", null, null);
    assert.ok(legacyDefaultHtml.includes("Legacy phone"), "missing visibility setting retains the legacy default");
  });

  it("keeps navigation labels and social icons visible without creating empty links", async () => {
    const html = await renderWidget(PROJECT_ID, "header-v1-empty-destinations", {
      type: "header",
      settings: {
        three_region_enabled: true,
        logo_region: "left", navigation_region: "center", social_region: "right",
        header_links: [
          { label: "Visible label", destination: "", destination_type: "page", presentation: "button" },
          { label: "Missing page", destination: "gone", destination_type: "page", presentation: "link", destination_page_uuid: "deleted-page" },
        ],
        header_social_links: [
          { icon: "instagram", url: "", accessible_label: "Photo feed" },
          { icon: "github", url: "https://example.com/code", accessible_label: "Code", open_in_new_tab: "false" },
        ],
      },
    }, RAW_THEME_SETTINGS, "preview", null, null);

    assert.match(html, /<span class="nav-link nav-link--button[^>]*>Visible label<\/span>/);
    assert.match(html, /<span class="nav-link[^>]*>Missing page<\/span>/);
    assert.doesNotMatch(html, /href="(?:"|gone)/);
    assert.match(html, /<span class="social-link social-link--static" role="img" aria-label="Photo feed">/);
    assert.match(html, /<a href="https:\/\/example\.com\/code" class="social-link" aria-label="Code">/);
    assert.doesNotMatch(html, /href="https:\/\/example\.com\/code"[^>]*target=/);
    assert.match(html, /--header-social-icon-size: 32px/);
    assert.match(html, /--header-social-icon-color: var\(--text-content\)/);
    assert.match(html, /--header-social-icon-hover-color: var\(--accent\)/);
    assert.match(html, /\.header-three-region-social a\.social-link:hover \{\s*color: var\(--header-social-icon-hover-color, var\(--accent\)\);/);
    assert.match(html, /\.header-three-region-social \.social-link:focus-visible \{\s*outline: 2px solid var\(--accent\);/);
    assert.doesNotMatch(html, /\.social-link--static:hover/);
  });

  it("applies shared social icon colours to linked and unlinked SVGs without changing sizing or targets", async () => {
    const html = await renderWidget(PROJECT_ID, "header-v1-social-colours", {
      type: "header",
      settings: {
        three_region_enabled: true,
        social_icon_size: 44,
        social_icon_spacing: 14,
        social_icon_color: "#225577",
        social_icon_hover_color: "#cc4488",
        header_social_links: [
          { icon: "instagram", url: "https://example.com/social", accessible_label: "Social profile", open_in_new_tab: "true" },
          { icon: "github", url: "javascript:alert(1)", accessible_label: "Offline icon" },
        ],
      },
    }, RAW_THEME_SETTINGS, "publish", null, null);

    assert.match(html, /--header-social-icon-size: 44px; --header-social-icon-spacing: 14px; --header-social-icon-color: #225577; --header-social-icon-hover-color: #cc4488;/);
    assert.match(html, /<a href="https:\/\/example\.com\/social" class="social-link" aria-label="Social profile" target="_blank" rel="noopener noreferrer">/);
    assert.match(html, /<span class="social-link social-link--static" role="img" aria-label="Offline icon">/);
    assert.match(html, /\.header-three-region-social \.social-link \{[\s\S]*?color: var\(--header-social-icon-color, var\(--text-content\)\)/);
    assert.match(html, /\.header-three-region-social svg \{[\s\S]*?width: var\(--header-social-icon-size, 32px\)[\s\S]*?color: inherit/);
    assert.match(html, /\.header-three-region-social a\.social-link:hover \{\s*color: var\(--header-social-icon-hover-color, var\(--accent\)\);/);
    assert.match(html, /\.header-three-region-social \.social-link:focus-visible \{\s*outline: 2px solid var\(--accent\);/);
    assert.doesNotMatch(html, /\.header-three-region-social \.social-link--static:hover/);
  });

  it("applies shared navigation typography and independent Logo Text typography", async () => {
    const html = await renderWidget(PROJECT_ID, "header-v1-shared-typography", {
      type: "header",
      settings: {
        three_region_enabled: true,
        show_logo_image: false,
        show_logo_text: true,
        logoText: "My Brand",
        logo_font_family: "body",
        logo_font_size: 30,
        logo_font_weight: "800",
        logo_text_color: "#123456",
        logo_letter_spacing: 0.5,
        logo_text_transform: "capitalize",
        navigation_font_family: "heading",
        navigation_font_size: 22,
        navigation_font_weight: "600",
        navigation_text_color: "#aa2233",
        navigation_letter_spacing: 1.2,
        navigation_text_transform: "uppercase",
        navigation_hover_color: "#006644",
        navigation_hover_underline: true,
        header_links: [
          { label: "About Us", destination: "about-us", destination_type: "page", destination_page_uuid: "page-uuid-about", presentation: "link" },
          { label: "Contact Us", destination: "", destination_type: "url", presentation: "button" },
        ],
      },
    }, RAW_THEME_SETTINGS, "publish", null, null);

    assert.match(html, /--arch-header-navigation-font-family: var\(--typography-heading_font-family, inherit\)/);
    assert.match(html, /--arch-header-navigation-font-size: 22px/);
    assert.match(html, /--arch-header-navigation-font-weight: 600/);
    assert.match(html, /--arch-header-navigation-text-color: #aa2233/);
    assert.match(html, /--arch-header-navigation-letter-spacing: 1\.2px/);
    assert.match(html, /--arch-header-navigation-text-transform: uppercase/);
    assert.match(html, /--arch-header-navigation-hover-color: #006644/);
    assert.match(html, /--arch-header-navigation-hover-decoration: underline/);
    assert.match(html, /font-family: var\(--arch-header-navigation-font-family\)/);
    assert.match(html, /font-size: var\(--arch-header-navigation-font-size\)/);
    assert.match(html, /font-weight: var\(--arch-header-navigation-font-weight\)/);
    assert.match(html, /<a href="about-us\.html" class="nav-link">About Us<\/a>/);
    assert.match(html, /<span class="nav-link nav-link--button[^>]*>Contact Us<\/span>/);
    assert.match(html, /--arch-header-logo-font-family: var\(--typography-body_font-family, inherit\)/);
    assert.match(html, /--arch-header-logo-font-size: 30px/);
    assert.match(html, /--arch-header-logo-font-weight: 800/);
    assert.match(html, /--arch-header-logo-text-color: #123456/);
    assert.match(html, /--arch-header-logo-letter-spacing: 0\.5px/);
    assert.match(html, /--arch-header-logo-text-transform: capitalize/);
    assert.match(html, /\.header-v1 \.header-v1-logo-text \{[\s\S]*?font-family: var\(--arch-header-logo-font-family\)/);
    assert.match(html, /<span class="header-v1-logo-text">My Brand<\/span>/, "text transform is presentation-only");
  });

  it("vertically centers Logo Text beside the logo image in the three-region Header", async () => {
    const html = await renderWidget(PROJECT_ID, "header-v1-aligned-logo-pair", {
      type: "header",
      settings: {
        three_region_enabled: true,
        logoImage: "/uploads/images/hero.jpg",
        logoText: "Aligned Brand",
        show_logo_image: true,
        show_logo_text: true,
        logo_region: "left",
        navigation_region: "center",
        social_region: "right",
      },
    }, RAW_THEME_SETTINGS, "preview", null, null);

    assert.match(html, /\.widget-site-header\.header-v1 \.header-v1-logo \{\s*display: inline-flex;\s*align-items: center;\s*gap: var\(--space-sm\);\s*line-height: normal;/);
    assert.match(html, /<a[^>]*class="header-logo header-v1-logo"[^>]*>[\s\S]*header-logo-image[\s\S]*<span class="header-v1-logo-text">Aligned Brand<\/span>[\s\S]*<\/a>/);
  });

  it("resolves a stored Header page UUID to the current page slug", async () => {
    const html = await renderWidget(PROJECT_ID, "header-v1-page-reference", {
      type: "header",
      settings: {
        three_region_enabled: true,
        logo_region: "left", navigation_region: "center", social_region: "right",
        header_links: [{ label: "About", destination: "old-about", destination_type: "page", destination_page_uuid: "page-uuid-about", presentation: "link" }],
      },
    }, RAW_THEME_SETTINGS, "preview", null, null);
    assert.ok(html.includes('href="about-us.html"'));
  });

  it("shows a logo image without its retained text when text visibility is off", async () => {
    const html = await renderWidget(PROJECT_ID, "header-v1-image-only", {
      type: "header",
      settings: {
        three_region_enabled: true,
        logoImage: "/uploads/images/hero.jpg",
        logoText: "Retained but hidden",
        show_logo_image: true,
        show_logo_text: false,
        logo_region: "left",
        navigation_region: "center",
        social_region: "right",
      },
    }, RAW_THEME_SETTINGS, "preview", null, null);

    assert.match(html, /<img[^>]*src="[^"]*hero-medium\.jpg"[^>]*header-logo-image/);
    assert.ok(!html.includes("Retained but hidden"));
  });

  it("honours legacy logo image visibility without discarding image or text settings", async () => {
    const settings = {
      three_region_enabled: false,
      logoImage: "/uploads/images/hero.jpg",
      logoText: "Retained legacy brand",
      show_logo_image: false,
      show_logo_text: true,
    };
    const hidden = await renderWidget(PROJECT_ID, "header-legacy-logo-hidden", {
      type: "header", settings,
    }, RAW_THEME_SETTINGS, "preview", null, null);
    assert.doesNotMatch(hidden, /<img[^>]*header-logo-image/);
    assert.match(hidden, /Retained legacy brand/);

    const shown = await renderWidget(PROJECT_ID, "header-legacy-logo-restored", {
      type: "header", settings: { ...settings, show_logo_image: true },
    }, RAW_THEME_SETTINGS, "preview", null, null);
    assert.match(shown, /<img[^>]*src="[^"]*hero-medium\.jpg"[^>]*header-logo-image/);
    assert.doesNotMatch(shown, /Retained legacy brand/);
    assert.equal(settings.logoImage, "/uploads/images/hero.jpg");
    assert.equal(settings.show_logo_image, false);
  });

  it("retains both logo values while rendering neither when both visibility controls are off", async () => {
    const html = await renderWidget(PROJECT_ID, "header-v1-no-logo", {
      type: "header",
      settings: {
        three_region_enabled: true,
        logoImage: "/uploads/images/hero.jpg",
        logoText: "Stored Brand Text",
        show_logo_image: false,
        show_logo_text: false,
        logo_region: "left",
        navigation_region: "center",
        social_region: "right",
      },
    }, RAW_THEME_SETTINGS, "preview", null, null);

    assert.doesNotMatch(html, /<a[^>]*class="header-logo header-v1-logo"/);
    assert.ok(!html.includes("Stored Brand Text"));
    assert.doesNotMatch(html, /<img[^>]*header-logo-image/);
  });

  it("keeps multiple assigned groups together in a predictable logo-navigation-social order", async () => {
    const html = await renderWidget(PROJECT_ID, "header-v1-stacked-groups", {
      type: "header",
      settings: {
        three_region_enabled: true,
        logoText: "Brand",
        show_logo_image: false,
        show_logo_text: true,
        logo_region: "center",
        navigation_region: "center",
        social_region: "center",
        header_links: [{ label: "Home", destination: "home", destination_type: "page", presentation: "link" }],
        header_social_links: [{ icon: "instagram", url: "https://example.com", accessible_label: "Instagram" }],
      },
    }, RAW_THEME_SETTINGS, "preview", null, null);

    const logoIndex = html.indexOf('class="header-logo header-v1-logo"');
    const navigationIndex = html.indexOf('class="header-nav header-three-region-nav"');
    const socialIndex = html.indexOf('class="header-three-region-social"');
    assert.ok(logoIndex >= 0 && logoIndex < navigationIndex && navigationIndex < socialIndex);
    assert.match(html, /header-region--center[\s\S]*header-v1-logo[\s\S]*header-three-region-nav[\s\S]*header-three-region-social/);
  });

  it("applies independent group spacing without changing social icon size", async () => {
    const html = await renderWidget(PROJECT_ID, "header-v1-group-spacing", {
      type: "header",
      settings: {
        three_region_enabled: true,
        navigation_item_spacing: 22,
        social_icon_size: 48,
        social_icon_spacing: 14,
        header_links: [{ label: "Home", destination: "home", destination_type: "page" }],
        header_social_links: [{ icon: "instagram", url: "https://example.com/social", accessible_label: "Instagram" }],
      },
    }, RAW_THEME_SETTINGS, "preview", null, null);

    assert.match(html, /--header-nav-item-spacing: 22px/);
    assert.match(html, /--header-social-icon-spacing: 14px/);
    assert.match(html, /--header-social-icon-size: 48px/);
    assert.match(html, /column-gap: var\(--header-nav-item-spacing, var\(--space-xs\)\)/);
    assert.match(html, /column-gap: var\(--header-social-icon-spacing, var\(--space-xs\)\)/);
  });

  it("emits all six published navigation and social target preferences", async () => {
    const html = await renderWidget(PROJECT_ID, "header-v1-published-targets", {
      type: "header",
      settings: {
        three_region_enabled: true,
        header_links: [
          { label: "Internal same", destination: "old-about", destination_type: "page", destination_page_uuid: "page-uuid-about", open_in_new_tab: "false" },
          { label: "Internal new", destination: "old-about", destination_type: "page", destination_page_uuid: "page-uuid-about", open_in_new_tab: "true" },
          { label: "External same", destination: "https://example.com/same", destination_type: "url", open_in_new_tab: "false" },
          { label: "External new", destination: "https://example.com/new", destination_type: "url", open_in_new_tab: "true" },
        ],
        header_social_links: [
          { icon: "instagram", accessible_label: "Social same", url: "https://social.example/same", open_in_new_tab: "false" },
          { icon: "facebook", accessible_label: "Social new", url: "https://social.example/new", open_in_new_tab: "true" },
        ],
      },
    }, RAW_THEME_SETTINGS, "publish", null, null);
    const openingAnchorFor = (label) => {
      const labelIndex = html.indexOf(label);
      assert.notEqual(labelIndex, -1, `${label} should render`);
      return html.slice(html.lastIndexOf("<a ", labelIndex), html.indexOf(">", labelIndex) + 1);
    };
    for (const label of ["Internal same", "External same", "Social same"]) {
      assert.doesNotMatch(openingAnchorFor(label), /\starget=/, `${label} should open in the same tab`);
    }
    for (const label of ["Internal new", "External new", "Social new"]) {
      assert.match(openingAnchorFor(label), /target="_blank" rel="noopener noreferrer"/, `${label} should open safely in a new tab`);
    }
    assert.ok(!html.includes("previewRuntime.js"), "published rendering does not load Preview link interception");
  });

  it("keeps navigation spacing effective on desktop and shares Header padding across render modes", async () => {
    const headerLinks = Array.from({ length: 5 }, (_, index) => ({
      label: `Section ${index + 1} with a long label`, destination: `section-${index + 1}`, destination_type: "url",
    }));
    for (const spacing of [0, 8, 34, 48]) {
      const html = await renderWidget(PROJECT_ID, `header-v1-nav-gap-${spacing}`, {
        type: "header", settings: {
          three_region_enabled: true, navigation_item_spacing: spacing, header_links: headerLinks,
          logoText: "Brand", logo_region: "left", navigation_region: "center", social_region: "right",
          header_social_links: [
            { icon: "instagram", url: "https://example.com/instagram", accessible_label: "Instagram" },
            { icon: "facebook", url: "https://example.com/facebook", accessible_label: "Facebook" },
          ],
        },
      }, RAW_THEME_SETTINGS, "preview", null, null);
      assert.ok(html.includes(`--header-nav-item-spacing: ${spacing}px`));
      assert.match(html, /grid-template-columns: repeat\(3, minmax\(max-content, 1fr\)\)/);
      assert.match(html, /header-three-region-nav \.nav-list \{ flex-wrap: nowrap; \}/);
      assert.match(html, /@media \(max-width: 989px\)[\s\S]*header-three-region-nav \.nav-list \{ flex-wrap: wrap; \}/);
      assert.match(html, /header-inner--three-region \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    }

    for (const padding of [0, 16, 96, 200]) {
      const preview = await renderWidget(PROJECT_ID, `header-padding-preview-${padding}`, {
        type: "header", settings: { horizontal_header_padding: padding },
      }, RAW_THEME_SETTINGS, "preview", null, null);
      const published = await renderWidget(PROJECT_ID, `header-padding-publish-${padding}`, {
        type: "header", settings: { horizontal_header_padding: padding },
      }, RAW_THEME_SETTINGS, "publish", null, null);
      const responsivePadding = `padding-inline: min(${padding}px, max(0px, calc(50% - 120px)))`;
      assert.ok(preview.includes(responsivePadding));
      assert.ok(published.includes(responsivePadding));
    }
  });
});

// ============================================================================
// renderWidget — link resolution (pageUuid -> current slug)
// ============================================================================

describe("Arch legacy Footer restoration", () => {
  it("renders the original block Footer and custom social links while ignoring retired structured settings", async () => {
    const html = await renderWidget(PROJECT_ID, "footer-restored-blocks", {
      type: "footer",
      settings: {
        structured_footer_enabled: true,
        footer_logo_text: "Retired value",
        footer_navigation_links: [{ label: "Retired link", destination: "https://example.com/retired" }],
        copyright: "<p>© Existing studio</p>",
        color_scheme: "highlight-primary",
      },
      blocks: {
        brand: { type: "logo_text", settings: { logo_text: "Existing Brand", text: "<p>Built with care</p>" } },
        social: { type: "social_block", settings: {
          title: "Follow us",
          footer_social_links: [
            { icon: "instagram", url: "https://example.com/social", accessible_label: "Instagram", open_in_new_tab: "true" },
            { icon: "github", url: "", accessible_label: "GitHub" },
          ],
        } },
      },
      blocksOrder: ["brand", "social"],
    }, RAW_THEME_SETTINGS, "publish", null, null);

    assert.match(html, /class="widget widget-footer[^"]*"/);
    assert.doesNotMatch(html, /arch-footer-v1|Retired value|Retired link/);
    assert.match(html, /Existing Brand/);
    assert.match(html, /Built with care/);
    assert.ok(html.includes('href="https://example.com/social"'));
    assert.ok(html.includes('target="_blank" rel="noopener noreferrer"'));
    assert.match(html, /role="img" aria-label="GitHub"/);
    assert.match(html, /© Existing studio/);
  });

  it("keeps the original Copyright field visible even when no Footer blocks remain", async () => {
    const html = await renderWidget(PROJECT_ID, "footer-restored-copyright", {
      type: "footer",
      settings: { copyright: "<p>Existing copy</p>", structured_footer_enabled: true },
      blocks: {},
      blocksOrder: [],
    }, RAW_THEME_SETTINGS, "publish", null, null);

    assert.match(html, /Existing copy/);
    assert.doesNotMatch(html, /arch-footer-v1|arch-footer-bottom/);
  });
});

describe("renderWidget — link resolution", () => {
  it("resolves pageUuid in link settings to current slug", async () => {
    const html = await renderWidget(
      PROJECT_ID,
      "hero-link",
      {
        type: "test-hero",
        settings: {
          heading: "Link Test",
          cta_link: {
            href: "/old-slug",
            text: "Go to About",
            target: "_self",
            pageUuid: "page-uuid-about",
          },
        },
      },
      RAW_THEME_SETTINGS,
      "preview",
      null,
      null,
    );

    // Should resolve to "about-us.html" (current slug of page-uuid-about)
    assert.ok(html.includes("about-us.html"), "link should resolve to current slug");
    assert.ok(html.includes("Go to About"));
  });

  it("clears link when pageUuid references a deleted page", async () => {
    const html = await renderWidget(
      PROJECT_ID,
      "hero-deleted",
      {
        type: "test-hero",
        settings: {
          heading: "Deleted Link",
          cta_link: {
            href: "/old-page",
            text: "Click Me",
            target: "_self",
            pageUuid: "page-uuid-nonexistent",
          },
        },
      },
      RAW_THEME_SETTINGS,
      "preview",
      null,
      null,
    );

    // Deleted page -> link cleared (href="", text="")
    assert.ok(!html.includes("/old-page"));
  });

  it("passes through custom URL links (no pageUuid)", async () => {
    const html = await renderWidget(
      PROJECT_ID,
      "hero-custom",
      {
        type: "test-hero",
        settings: {
          heading: "Custom Link",
          cta_link: {
            href: "https://external.com",
            text: "External",
            target: "_blank",
          },
        },
      },
      RAW_THEME_SETTINGS,
      "preview",
      null,
      null,
    );

    assert.ok(html.includes("https://external.com"));
    assert.ok(html.includes("External"));
  });
});

// ============================================================================
// renderWidget — menu resolution
// ============================================================================

describe("renderWidget — menu resolution", () => {
  it("loads menu data for menu-type settings", async () => {
    const html = await renderWidget(
      PROJECT_ID,
      "hero-menu",
      {
        type: "test-hero",
        settings: {
          heading: "Menu Test",
          nav_menu: "main-nav",
        },
      },
      RAW_THEME_SETTINGS,
      "preview",
      null,
      null,
    );

    // Should render without error
    assert.ok(html.includes("Menu Test"));
    assert.ok(!html.includes("widget-error"));
  });

  it("resolves menu by UUID", async () => {
    const html = await renderWidget(
      PROJECT_ID,
      "hero-menu-uuid",
      {
        type: "test-hero",
        settings: {
          heading: "UUID Menu Test",
          nav_menu: "menu-uuid-main-nav",
        },
      },
      RAW_THEME_SETTINGS,
      "preview",
      null,
      null,
    );

    // Should render without error — menu resolved via UUID
    assert.ok(html.includes("UUID Menu Test"));
    assert.ok(!html.includes("widget-error"));
  });

  it("falls back to slug-based lookup for menu references without uuids", async () => {
    const html = await renderWidget(
      PROJECT_ID,
      "hero-menu-slug",
      {
        type: "test-hero",
        settings: {
          heading: "Slug Menu Test",
          nav_menu: "main-nav",
        },
      },
      RAW_THEME_SETTINGS,
      "preview",
      null,
      null,
    );

    // Should also render without error — menu resolved via slug fallback
    assert.ok(html.includes("Slug Menu Test"));
    assert.ok(!html.includes("widget-error"));
  });

  it("handles non-existent menu gracefully", async () => {
    const html = await renderWidget(
      PROJECT_ID,
      "hero-nomenu",
      {
        type: "test-hero",
        settings: {
          heading: "No Menu",
          nav_menu: "ghost-menu",
        },
      },
      RAW_THEME_SETTINGS,
      "preview",
      null,
      null,
    );

    assert.ok(html.includes("No Menu"));
    assert.ok(!html.includes("widget-error"));
  });
});

// ============================================================================
// renderWidget — render modes
// ============================================================================

describe("renderWidget — render modes", () => {
  it("renders in preview mode by default", async () => {
    const html = await renderWidget(
      PROJECT_ID,
      "spacer-prev",
      {
        type: "core-spacer",
        settings: { height: 30 },
      },
      RAW_THEME_SETTINGS,
      "preview",
      null,
      null,
    );

    assert.ok(html.includes("height: 30px"));
  });

  it("renders in publish mode", async () => {
    const html = await renderWidget(
      PROJECT_ID,
      "spacer-pub",
      {
        type: "core-spacer",
        settings: { height: 60 },
      },
      RAW_THEME_SETTINGS,
      "publish",
      null,
      null,
    );

    assert.ok(html.includes("height: 60px"));
  });
});

// ============================================================================
// renderWidget — optional icon set
// ============================================================================

describe("renderWidget — optional icon set", () => {
  const iconsFile = () => path.join(getProjectDir(PROJECT_FOLDER), "assets", "icons.json");
  const renderIcon = () =>
    renderWidget(PROJECT_ID, "icon-1", { type: "test-icon", settings: {} }, RAW_THEME_SETTINGS, "preview", null, null);

  before(async () => {
    const widgetDir = path.join(getProjectDir(PROJECT_FOLDER), "widgets", "test-icon");
    await fs.ensureDir(widgetDir);
    await fs.writeFile(path.join(widgetDir, "widget.liquid"), `<i>{{ icons.star.body }}</i>`);
    await fs.writeFile(path.join(widgetDir, "schema.json"), JSON.stringify({ type: "test-icon", settings: [] }));
  });

  it("does not warn in preview when the project has no icons.json", async (t) => {
    const warn = t.mock.method(console, "warn", () => {});

    await renderIcon();
    await renderIcon();

    const iconWarnings = warn.mock.calls.filter((call) => String(call.arguments[0]).includes("icon"));
    assert.deepEqual(iconWarnings, []);
  });

  it("picks up an icons.json added, then removed, between preview renders", async () => {
    await fs.outputFile(iconsFile(), JSON.stringify({ icons: { star: { body: "STAR" } } }));
    assert.ok((await renderIcon()).includes("<i>STAR</i>"));

    await fs.remove(iconsFile());
    assert.ok((await renderIcon()).includes("<i></i>"));
  });
});

// ============================================================================
// renderWidget — shared globals
// ============================================================================

describe("renderWidget — shared globals", () => {
  it("shares enqueued assets across widget renders", async () => {
    const sharedGlobals = {
      projectId: PROJECT_ID,
      apiUrl: "",
      renderMode: "publish",
      themeSettingsRaw: RAW_THEME_SETTINGS,
      enqueuedStyles: new Map(),
      enqueuedScripts: new Map(),
    };

    // Render two widgets with the same shared globals
    await renderWidget(
      PROJECT_ID,
      "w1",
      {
        type: "core-spacer",
        settings: {},
      },
      RAW_THEME_SETTINGS,
      "publish",
      sharedGlobals,
      null,
    );

    await renderWidget(
      PROJECT_ID,
      "w2",
      {
        type: "core-spacer",
        settings: {},
      },
      RAW_THEME_SETTINGS,
      "publish",
      sharedGlobals,
      null,
    );

    // Shared globals should have pagesByUuid cached after first render
    assert.ok(sharedGlobals.pagesByUuid instanceof Map, "should cache pagesByUuid");
    assert.ok(sharedGlobals.pagesByUuid.has("page-uuid-home"));
    assert.ok(sharedGlobals.pagesByUuid.has("page-uuid-about"));
  });
});

describe("renderWidget — global widgets see page and project", () => {
  const FOOTER = { type: "footer", settings: {} };

  before(async () => {
    const footerDir = path.join(getProjectDir(PROJECT_FOLDER), "widgets", "global", "footer");
    await fs.outputFile(path.join(footerDir, "schema.json"), JSON.stringify({ type: "footer", settings: [] }));
    await fs.outputFile(
      path.join(footerDir, "widget.liquid"),
      `<footer data-slug="{{ page.slug }}" data-name="{{ page.name }}" data-site="{{ project.siteUrl }}" data-clean="{{ project.cleanUrls }}" data-identity="{{ project.identity.name }}" data-tel="{{ project.identity.telephoneHref }}"></footer>`,
    );
  });

  const globalsFor = (extra = {}) => ({
    projectId: PROJECT_ID,
    apiUrl: "",
    renderMode: "publish",
    themeSettingsRaw: RAW_THEME_SETTINGS,
    enqueuedStyles: new Map(),
    enqueuedScripts: new Map(),
    ...extra,
  });

  it("reads page.slug and project.siteUrl", async () => {
    const html = await renderWidget(
      PROJECT_ID,
      "footer",
      FOOTER,
      RAW_THEME_SETTINGS,
      "publish",
      globalsFor({ currentPageData: { slug: "about-us", name: "About Us" } }),
      null,
    );
    assert.ok(html.includes('data-slug="about-us"'), html);
    assert.ok(html.includes('data-name="About Us"'), html);
    assert.ok(html.includes('data-site="https://example.com"'), html);
  });

  it("gives project.cleanUrls the render's stamped flag, not the row", async () => {
    const html = await renderWidget(
      PROJECT_ID,
      "footer",
      FOOTER,
      RAW_THEME_SETTINGS,
      "publish",
      globalsFor({ cleanUrls: true, currentPageData: { slug: "about-us" } }),
      null,
    );
    assert.ok(html.includes('data-clean="true"'), html);
  });

  it("gives themes the business details as project.identity", async () => {
    projectRepo.updateProject(PROJECT_ID, {
      siteIdentity: { category: "bakery", telephone: "+30 210 123", text: { publicName: "Crumbly" } },
    });
    try {
      const html = await renderWidget(PROJECT_ID, "footer", FOOTER, RAW_THEME_SETTINGS, "publish", globalsFor(), null);
      assert.ok(html.includes('data-identity="Crumbly"'), html);
      assert.ok(html.includes('data-tel="tel:+30210123"'), html);
    } finally {
      projectRepo.updateProject(PROJECT_ID, { siteIdentity: {} });
    }
  });

  it("leaves page empty when the caller supplies none", async () => {
    const html = await renderWidget(PROJECT_ID, "footer", FOOTER, RAW_THEME_SETTINGS, "publish", globalsFor(), null);
    assert.ok(html.includes('data-slug=""'), html);
    assert.ok(html.includes('data-site="https://example.com"'), html);
  });
});

// ============================================================================
// renderPageLayout
// ============================================================================

describe("renderPageLayout", () => {
  it("renders a complete HTML document", async () => {
    const html = await renderPageLayout(
      PROJECT_ID,
      {
        headerContent: "<header>Header</header>",
        mainContent: "<p>Content</p>",
        footerContent: "<footer>Footer</footer>",
      },
      { name: "Test Page", slug: "test-page" },
      RAW_THEME_SETTINGS,
      "preview",
      null,
    );

    assert.ok(html.includes("<!DOCTYPE html>") || html.includes("<!doctype html>"));
    assert.ok(html.includes("<title>Test Page</title>"));
  });

  it("injects runtime site icon links into the layout", async () => {
    const html = await renderPageLayout(
      PROJECT_ID,
      {
        headerContent: "",
        mainContent: "<p>Content</p>",
        footerContent: "",
      },
      { name: "Icon Page", slug: "icon-page" },
      RAW_THEME_SETTINGS,
      "preview",
      null,
    );

    assert.ok(
      html.includes(`rel="icon" href="/api/media/projects/${PROJECT_ID}/uploads/images/site-icon.svg"`),
    );
    assert.ok(
      html.includes(`rel="apple-touch-icon" href="/api/media/projects/${PROJECT_ID}/uploads/images/site-icon.svg"`),
    );
    // Derived sizes (icon-192 etc.) exist only in exports — runtime must not link them.
    assert.ok(!html.includes('sizes="192x192"'));
  });

  it("finds the site icon in whichever group the theme files it", async () => {
    const html = await renderPageLayout(
      PROJECT_ID,
      { headerContent: "", mainContent: "<p>Content</p>", footerContent: "" },
      { name: "Icon Page", slug: "icon-page" },
      { settings: { global: { branding: RAW_THEME_SETTINGS.settings.global.general } } },
      "preview",
      null,
    );

    assert.ok(html.includes(`rel="icon" href="/api/media/projects/${PROJECT_ID}/uploads/images/site-icon.svg"`));
  });

  it("injects header, main content, and footer", async () => {
    const html = await renderPageLayout(
      PROJECT_ID,
      {
        headerContent: '<nav class="main-nav">Nav</nav>',
        mainContent: "<article>Main article</article>",
        footerContent: '<footer class="site-footer">Foot</footer>',
      },
      { name: "Injected Page", slug: "injected" },
      RAW_THEME_SETTINGS,
      "preview",
      null,
    );

    assert.ok(html.includes("main-nav"));
    assert.ok(html.includes("Main article"));
    assert.ok(html.includes("site-footer"));
  });

  it("sets body class from page slug", async () => {
    const html = await renderPageLayout(
      PROJECT_ID,
      { headerContent: "", mainContent: "", footerContent: "" },
      { name: "About", slug: "about-us" },
      RAW_THEME_SETTINGS,
      "preview",
      null,
    );

    assert.ok(html.includes('class="page-about-us"'));
  });

  it("overrides the page-slug body class when contentSections.bodyClass is set", async () => {
    // Collection item pages pass an explicit bodyClass to REPLACE the page-{slug}
    // default — otherwise a `.page-{slug}` index CSS rule leaks onto item pages,
    // and the nested item slug ("news/alpha") even yields a malformed `/` token.
    const html = await renderPageLayout(
      PROJECT_ID,
      { headerContent: "", mainContent: "", footerContent: "", bodyClass: "collection-news item-alpha" },
      { name: "Alpha", slug: "news/alpha" },
      RAW_THEME_SETTINGS,
      "preview",
      null,
    );

    const bodyClass = html.match(/<body class="([^"]*)"/)?.[1];
    assert.equal(bodyClass, "collection-news item-alpha");
    assert.ok(!html.includes("page-news"), "the page-{slug} default must not leak onto an override");
  });

  it("appends extraBodyClasses after the page-slug default (transparent-header channel)", async () => {
    const html = await renderPageLayout(
      PROJECT_ID,
      { headerContent: "", mainContent: "", footerContent: "", extraBodyClasses: "transparent-header" },
      { name: "About", slug: "about-us" },
      RAW_THEME_SETTINGS,
      "preview",
      null,
    );

    const bodyClass = html.match(/<body class="([^"]*)"/)?.[1];
    assert.equal(bodyClass, "page-about-us transparent-header");
  });

  it("renders SEO tags via {% seo %} in layout", async () => {
    const html = await renderPageLayout(
      PROJECT_ID,
      { headerContent: "", mainContent: "", footerContent: "" },
      {
        name: "SEO Page",
        slug: "seo-page",
        seo: { description: "A page with SEO", og_title: "SEO Title" },
      },
      RAW_THEME_SETTINGS,
      "preview",
      null,
    );

    assert.ok(html.includes("<title>SEO Page</title>"));
    assert.ok(html.includes("<title>SEO Page - Render Test Site</title>"));
    assert.ok(html.includes("og:title"));
    assert.ok(html.includes("SEO Title"));
    assert.ok(html.includes("A page with SEO"));
  });

  it("emits explicit canonical URL when set on the page", async () => {
    const html = await renderPageLayout(
      PROJECT_ID,
      { headerContent: "", mainContent: "", footerContent: "" },
      {
        name: "Canonical Page",
        slug: "canonical-page",
        seo: { canonical_url: "https://other.example.com/preferred" },
      },
      RAW_THEME_SETTINGS,
      "preview",
      null,
    );

    assert.ok(html.includes('<link rel="canonical" href="https://other.example.com/preferred">'));
  });

  it("auto-generates canonical from siteUrl + slug when page canonical is empty", async () => {
    const html = await renderPageLayout(
      PROJECT_ID,
      { headerContent: "", mainContent: "", footerContent: "" },
      { name: "About", slug: "about" },
      RAW_THEME_SETTINGS,
      "preview",
      null,
    );

    assert.ok(html.includes('<link rel="canonical" href="https://example.com/about.html">'));
  });

  it("canonicalizes the homepage to the bare site root", async () => {
    const indexHtml = await renderPageLayout(
      PROJECT_ID,
      { headerContent: "", mainContent: "", footerContent: "" },
      { name: "Home", slug: "index" },
      RAW_THEME_SETTINGS,
      "preview",
      null,
    );
    assert.ok(indexHtml.includes('<link rel="canonical" href="https://example.com/">'));
    assert.ok(!indexHtml.includes("index.html"));

    const homeHtml = await renderPageLayout(
      PROJECT_ID,
      { headerContent: "", mainContent: "", footerContent: "" },
      { name: "Home", slug: "home" },
      RAW_THEME_SETTINGS,
      "preview",
      null,
    );
    assert.ok(homeHtml.includes('<link rel="canonical" href="https://example.com/">'));
  });

  it("emits no canonical link when neither page nor project URL is set", async () => {
    // Temporarily blank the project's siteUrl
    const projectsData = await projectRepo.readProjectsData();
    const original = projectsData.projects[0].siteUrl;
    projectsData.projects[0].siteUrl = "";
    await projectRepo.writeProjectsData(projectsData);

    try {
      const html = await renderPageLayout(
        PROJECT_ID,
        { headerContent: "", mainContent: "", footerContent: "" },
        { name: "Orphan", slug: "orphan" },
        RAW_THEME_SETTINGS,
        "preview",
        null,
      );
      assert.ok(!html.includes('rel="canonical"'));
    } finally {
      projectsData.projects[0].siteUrl = original;
      await projectRepo.writeProjectsData(projectsData);
    }
  });

  it("normalizes a trailing slash on siteUrl", async () => {
    const projectsData = await projectRepo.readProjectsData();
    const original = projectsData.projects[0].siteUrl;
    projectsData.projects[0].siteUrl = "https://example.com/";
    await projectRepo.writeProjectsData(projectsData);

    try {
      const html = await renderPageLayout(
        PROJECT_ID,
        { headerContent: "", mainContent: "", footerContent: "" },
        { name: "About", slug: "about" },
        RAW_THEME_SETTINGS,
        "preview",
        null,
      );
      assert.ok(html.includes('<link rel="canonical" href="https://example.com/about.html">'));
      assert.ok(!html.includes("//about.html"));
    } finally {
      projectsData.projects[0].siteUrl = original;
      await projectRepo.writeProjectsData(projectsData);
    }
  });

  it("handles missing page data gracefully", async () => {
    const html = await renderPageLayout(
      PROJECT_ID,
      { headerContent: "", mainContent: "<p>Body</p>", footerContent: "" },
      null,
      RAW_THEME_SETTINGS,
      "preview",
      null,
    );

    // Should not crash — layout.liquid uses page.name which will be empty
    assert.ok(html.includes("<html") || html.includes("Error"));
  });

  it("returns error HTML when layout.liquid is missing", async () => {
    // Create a project without layout.liquid
    const noLayoutProject = {
      id: "no-layout-uuid",
      folderName: "no-layout-project",
      name: "No Layout",
      theme: "__no_layout__",
      created: new Date().toISOString(),
    };

    await projectRepo.writeProjectsData({
      projects: [noLayoutProject],
      activeProjectId: noLayoutProject.id,
    });
    const noLayoutDir = getProjectDir(noLayoutProject.folderName);
    await fs.ensureDir(noLayoutDir);
    // No layout.liquid created

    const html = await renderPageLayout(
      noLayoutProject.id,
      { headerContent: "", mainContent: "", footerContent: "" },
      { name: "Test", slug: "test" },
      RAW_THEME_SETTINGS,
      "preview",
      null,
    );

    assert.ok(html.includes("Error") || html.includes("not found"));

    // Restore original project
    await projectRepo.writeProjectsData({
      projects: [
        {
          id: PROJECT_ID,
          folderName: PROJECT_FOLDER,
          name: "Render Test Project",
          theme: "__render_test_theme__",
          siteUrl: "https://example.com",
          created: new Date().toISOString(),
        },
      ],
      activeProjectId: PROJECT_ID,
    });
    await fs.remove(noLayoutDir);
  });
});

describe("renderWidget — the theme's date format", () => {
  before(async () => {
    const widgetDir = path.join(getProjectDir(PROJECT_FOLDER), "widgets", "test-date");
    await fs.ensureDir(widgetDir);
    await fs.writeFile(path.join(widgetDir, "widget.liquid"), `<time>{{ '2026-01-05' | format_date }}</time>`);
    await fs.writeFile(path.join(widgetDir, "schema.json"), JSON.stringify({ type: "test-date", settings: [] }));
  });

  it("reads date_format from whichever group the theme files it", async () => {
    const theme = { settings: { global: { dates: [{ id: "date_format", type: "select", value: "YYYY-MM-DD" }] } } };
    const html = await renderWidget(PROJECT_ID, "date-1", { type: "test-date", settings: {} }, theme, "preview", null, null);
    assert.ok(html.includes("<time>2026-01-05</time>"), html);
  });
});

describe("renderWidget — the built-in words without a site-strings loader", () => {
  before(async () => {
    const widgetDir = path.join(getProjectDir(PROJECT_FOLDER), "widgets", "test-core-words");
    await fs.ensureDir(widgetDir);
    await fs.writeFile(
      path.join(widgetDir, "widget.liquid"),
      `<p>{{ 'site.breadcrumbs.label' | t }}|{{ 'site.breadcrumbs.page' | t }}</p>`,
    );
    await fs.writeFile(path.join(widgetDir, "schema.json"), JSON.stringify({ type: "test-core-words", settings: [] }));
  });

  it("still reads the app's English words when the host supplies no loader", async () => {
    const { loadSiteStrings, ...deps } = await buildRenderDeps(PROJECT_ID);
    assert.equal(typeof loadSiteStrings, "function");
    const html = await engineRenderWidget(deps, "words-1", { type: "test-core-words", settings: {} }, RAW_THEME_SETTINGS, "preview");
    assert.ok(html.includes("<p>Breadcrumb|Page</p>"), html);
  });
});
