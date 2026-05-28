const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = process.cwd();
const version = process.env.RELEASE_VERSION || "vn132";
const releaseName = process.env.RELEASE_NAME || `embedded-${version}`;
const inlinePhotos = process.env.INLINE_PHOTOS === "1";
const outDir = path.join(root, "dist", releaseName);
const zipPath = path.join(root, "dist", `angel-game-${releaseName}.zip`);

function findFfmpeg() {
  const candidates = [
    process.env.FFMPEG_PATH,
    path.join(root, "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    path.join(root, ".codex-temp", "ffmpeg", "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    path.join(process.env.USERPROFILE || "", "AppData", "Local", "kzip_sogou", "ffmpeg.exe")
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function findPython() {
  const candidates = [
    process.env.PYTHON,
    path.join(process.env.USERPROFILE || "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe"),
    "python"
  ].filter(Boolean);
  return candidates.find((candidate) => {
    try {
      execFileSync(candidate, ["-c", "import fontTools.subset"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  });
}

function remove(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function writeText(relativePath, content) {
  fs.mkdirSync(path.dirname(path.join(outDir, relativePath)), { recursive: true });
  fs.writeFileSync(path.join(outDir, relativePath), content, "utf8");
}

function writeBinary(relativePath, content) {
  fs.mkdirSync(path.dirname(path.join(outDir, relativePath)), { recursive: true });
  fs.writeFileSync(path.join(outDir, relativePath), content);
}

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    ".svg": "image/svg+xml",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".ttf": "font/ttf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".mp3": "audio/mpeg"
  }[ext] || "application/octet-stream";
}

function collectJsonData() {
  return {
    "data/story.json": JSON.parse(readText("data/story.json")),
    "data/characters.json": JSON.parse(readText("data/characters.json")),
    "data/resources.json": JSON.parse(readText("data/resources.json")),
    "data/gacha.json": JSON.parse(readText("data/gacha.json")),
    "data/minigames.json": JSON.parse(readText("data/minigames.json"))
  };
}

function collectInlineAssets() {
  const assets = {};
  if (!inlinePhotos) return assets;
  const imageDir = path.join(root, "assets", "images");
  if (!fs.existsSync(imageDir)) return assets;
  for (const file of walk(imageDir)) {
    const name = path.basename(file);
    if (!/^photo-.*\.(jpg|jpeg|png|webp)$/i.test(name)) continue;
    const key = path.relative(path.join(root, "assets"), file).replace(/\\/g, "/");
    const data = fs.readFileSync(file).toString("base64");
    assets[key] = `data:${mimeFor(file)};base64,${data}`;
  }
  return assets;
}

function prepareMusicFile() {
  const ffmpeg = findFfmpeg();
  const outputName = `bgm-embedded-${version}.mp3`;
  const outputRelative = path.join("assets", "audio", outputName);
  const outputPath = path.join(outDir, outputRelative);
  const source = [
    path.join(root, "assets", "audio", "kikujiro-summer-piano.mp3"),
    path.join(root, "assets", "audio", "bgm.mp3")
  ].find((candidate) => fs.existsSync(candidate));
  if (!source) throw new Error("Missing background music file in assets/audio.");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  if (!ffmpeg) {
    fs.copyFileSync(source, outputPath);
    return path.relative(path.join(outDir, "assets"), outputPath).replace(/\\/g, "/");
  }
  remove(outputPath);
  execFileSync(ffmpeg, ["-y", "-i", source, "-vn", "-ac", "2", "-b:a", "96k", outputPath], {
    stdio: "ignore"
  });
  return path.relative(path.join(outDir, "assets"), outputPath).replace(/\\/g, "/");
}

function buildApp(data, assets, musicFile) {
  let app = readText("app.js");
  app = app.replace(/const ASSET_VERSION = "[^"]+";/, `const ASSET_VERSION = "${version}-embedded";`);
  app = app.replace(
    /const BGM_FILES = \[[\s\S]*?\];/,
    `const BGM_FILES = [\n  ${JSON.stringify(musicFile)}\n];`
  );
  app = app.replace(
    /const els = \{/,
    `const EMBEDDED_GAME_DATA = ${JSON.stringify(data)};\nconst EMBEDDED_ASSETS = ${JSON.stringify(assets)};\n\nconst els = {`
  );
  app = app.replace(
    "  applyStoryAdditions();\n  applyTextOverrides();\n  normalizeChapterTitles();",
    "  // Public embedded builds use only the baked project files, not browser editor cache.\n  normalizeChapterTitles();"
  );
  app = app.replace(
    /function asset\(path\) \{\n  return `\$\{ASSET_ROOT\}\/\$\{path\}\?v=\$\{ASSET_VERSION\}`;\n\}/,
    [
      "function asset(path) {",
      '  const key = String(path).replace(/^\\.\\//, "").replace(/^assets\\//, "");',
      '  return EMBEDDED_ASSETS[key] || ASSET_ROOT + "/" + path + "?v=" + ASSET_VERSION;',
      "}"
    ].join("\n")
  );
  app = app.replace(
    /async function loadJson\(path\) \{\n  const response = await fetch\(path, \{ cache: "no-store" \}\);\n  if \(!response\.ok\) throw new Error\(`Cannot load \$\{path\}`\);\n  return response\.json\(\);\n\}/,
    [
      "async function loadJson(path) {",
      '  const key = String(path).replace(/^\\.\\//, "");',
      "  if (EMBEDDED_GAME_DATA[key]) return JSON.parse(JSON.stringify(EMBEDDED_GAME_DATA[key]));",
      '  const response = await fetch(path, { cache: "no-store" });',
      "  if (!response.ok) throw new Error(`Cannot load ${path}`);",
      "  return response.json();",
      "}"
    ].join("\n")
  );
  if (!app.includes("EMBEDDED_GAME_DATA") || !app.includes("EMBEDDED_ASSETS")) {
    throw new Error("Failed to embed game data or assets into app.js");
  }
  return app;
}

function buildCss(assets) {
  let css = readText("styles.css");
  return css.replace(/url\((['"]?)\.\/assets\/([^)'"\?#]+)(?:\?[^)'"]*)?\1\)/g, (match, quote, rel) => {
    const cleanRel = rel.replace(/\\/g, "/");
    return `url("./assets/${cleanRel}?v=${version}-embedded")`;
  });
}

function buildHtml() {
  let html = readText("index.html");
  html = html.replace(/styles\.css\?v=[^"]+/, `styles.css?v=${version}-embedded`);
  html = html.replace(/app\.js\?v=[^"]+/, `app.js?v=${version}-embedded`);
  return html;
}

function buildServiceWorker() {
  let worker = readText("service-worker.js");
  worker = worker.replace(/angel-game-pwa-vn\d+/, `angel-game-pwa-${version}-embedded`);
  worker = worker.replace(/styles\.css\?v=vn\d+/, `styles.css?v=${version}-embedded`);
  worker = worker.replace(/app\.js\?v=vn\d+/, `app.js?v=${version}-embedded`);
  return worker;
}

function copyPwaIcons() {
  const iconDir = path.join(root, "assets", "icons");
  if (!fs.existsSync(iconDir)) return;
  for (const name of fs.readdirSync(iconDir)) {
    if (!/\.png$/i.test(name)) continue;
    writeBinary(path.join("assets", "icons", name), fs.readFileSync(path.join(iconDir, name)));
  }
}

function copyReleaseAssets() {
  const folders = [
    ["assets/images", /\.(svg|jpg|jpeg|png|webp)$/i],
    ["assets/sprites", /\.(svg|png|webp)$/i],
    ["assets/fonts", /\.(woff2|woff|ttf)$/i]
  ];
  for (const [folder, pattern] of folders) {
    const sourceDir = path.join(root, folder);
    if (!fs.existsSync(sourceDir)) continue;
    for (const file of walk(sourceDir)) {
      if (!pattern.test(file)) continue;
      if (inlinePhotos && /^photo-.*\.(jpg|jpeg|png|webp)$/i.test(path.basename(file))) continue;
      const relative = path.relative(root, file);
      writeBinary(relative, fs.readFileSync(file));
    }
  }
  const audioDir = path.join(root, "assets", "audio");
  if (fs.existsSync(audioDir)) {
    for (const file of walk(audioDir)) {
      if (!/\.mp3$/i.test(file)) continue;
      const name = path.basename(file).toLowerCase();
      if (name === "bgm.mp3" || name === "kikujiro-summer-piano.mp3") continue;
      const relative = path.relative(root, file);
      writeBinary(relative, fs.readFileSync(file));
    }
  }
}

function subsetReleaseFonts(data) {
  const python = findPython();
  if (!python) return false;
  const textParts = [
    JSON.stringify(data),
    readText("index.html"),
    readText("app.js"),
    readText("styles.css"),
    readText("manifest.webmanifest"),
    " 0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "\uFF0C\u3002\uFF1F\uFF01\uFF1B\uFF1A\u3001\uFF08\uFF09\u300A\u300B\u201C\u201D\u2018\u2019\u2026\u00B7/\\\\+*=<>[]{}#.%&@~|_",
    "\u2601\u2726\u2661\u2727\u2606\u271E\u2729\u263D\u2605"
  ];
  const textFile = path.join(outDir, ".font-subset-text.txt");
  fs.writeFileSync(textFile, textParts.join("\n"), "utf8");
  for (const relative of [
    path.join("assets", "fonts", "MaShanZheng-GameSubset.woff2"),
    path.join("assets", "fonts", "ZCOOLKuaiLe-GameSubset.woff2")
  ]) {
    const fontPath = path.join(outDir, relative);
    if (!fs.existsSync(fontPath)) continue;
    const tempPath = `${fontPath}.tmp.woff2`;
    execFileSync(python, [
      "-m",
      "fontTools.subset",
      fontPath,
      `--text-file=${textFile}`,
      `--output-file=${tempPath}`,
      "--flavor=woff2",
      "--layout-features=*",
      "--no-hinting"
    ], { stdio: "ignore" });
    fs.renameSync(tempPath, fontPath);
  }
  fs.unlinkSync(textFile);
  return true;
}

function compressZip() {
  remove(zipPath);
  const command = [
    "Compress-Archive",
    "-Path",
    `"${path.join(outDir, "*")}"`,
    "-DestinationPath",
    `"${zipPath}"`,
    "-Force"
  ].join(" ");
  execFileSync("powershell", ["-NoProfile", "-Command", command], { stdio: "inherit" });
}

remove(outDir);
fs.mkdirSync(outDir, { recursive: true });

const data = collectJsonData();
const inlineAssets = collectInlineAssets();
copyReleaseAssets();
copyPwaIcons();
const fontsSubset = subsetReleaseFonts(data);
const musicFile = prepareMusicFile();

writeText("index.html", buildHtml());
writeText("styles.css", buildCss());
writeText("app.js", buildApp(data, inlineAssets, musicFile));
writeText("service-worker.js", buildServiceWorker());
writeText("manifest.webmanifest", JSON.stringify({
  name: data["data/story.json"].nodes.title.title,
  short_name: "\u5C0F\u5929\u4F7F",
  description: "\u4E00\u4E2A\u5C0F\u5929\u4F7F\u9009\u62E9\u51FA\u751F\u5BB6\u5EAD\u7684\u6E29\u67D4\u7ED8\u672C\u6E38\u620F\u3002",
  start_url: "./index.html",
  scope: "./",
  display: "standalone",
  display_override: ["standalone", "fullscreen", "browser"],
  background_color: "#fff4dc",
  theme_color: "#fff4dc",
  orientation: "portrait",
  lang: "zh-CN",
  categories: ["games", "entertainment"],
  icons: [
    {
      src: "./assets/icons/pwa-icon-192.png",
      sizes: "192x192",
      type: "image/png"
    },
    {
      src: "./assets/icons/pwa-icon-512.png",
      sizes: "512x512",
      type: "image/png"
    },
    {
      src: "./assets/icons/pwa-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable"
    }
  ]
}, null, 2));
writeText("_headers", [
  "/*.html",
  "  Cache-Control: no-cache",
  "",
  "/service-worker.js",
  "  Cache-Control: no-cache",
  "",
  "/app.js",
  "  Cache-Control: public, max-age=31536000, immutable",
  "",
  "/styles.css",
  "  Cache-Control: public, max-age=31536000, immutable",
  "",
  "/assets/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "",
  "/manifest.webmanifest",
  "  Cache-Control: public, max-age=3600"
].join("\n"));
writeText("vercel.json", JSON.stringify({
  headers: [
    {
      source: "/(.*).html",
      headers: [{ key: "Cache-Control", value: "no-cache" }]
    },
    {
      source: "/service-worker.js",
      headers: [{ key: "Cache-Control", value: "no-cache" }]
    },
    {
      source: "/app.js",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
    },
    {
      source: "/styles.css",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
    },
    {
      source: "/assets/(.*)",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
    },
    {
      source: "/manifest.webmanifest",
      headers: [{ key: "Cache-Control", value: "public, max-age=3600" }]
    }
  ]
}, null, 2));

compressZip();

console.log(JSON.stringify({
  outDir,
  zipPath,
  jsonFiles: Object.keys(data).length,
  inlinePhotos,
  inlineAssetFiles: Object.keys(inlineAssets).length,
  fontsSubset,
  releaseFiles: walk(outDir).length,
  audioFiles: fs.existsSync(path.join(outDir, "assets", "audio"))
    ? fs.readdirSync(path.join(outDir, "assets", "audio")).length
    : 0,
  zipBytes: fs.statSync(zipPath).size
}, null, 2));
