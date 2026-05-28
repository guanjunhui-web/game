const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = process.cwd();
const version = "vn119";
const outDir = path.join(root, "dist", `embedded-${version}`);
const zipPath = path.join(root, "dist", `angel-game-embedded-${version}.zip`);

function findFfmpeg() {
  const candidates = [
    process.env.FFMPEG_PATH,
    path.join(root, "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    path.join(root, ".codex-temp", "ffmpeg", "node_modules", "ffmpeg-static", "ffmpeg.exe")
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
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

function dataUri(file) {
  return `data:${mimeFor(file)};base64,${fs.readFileSync(file).toString("base64")}`;
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

function collectAssets() {
  const assets = {};
  for (const folder of ["assets/images", "assets/sprites", "assets/fonts"]) {
    if (!fs.existsSync(path.join(root, folder))) continue;
    for (const file of walk(path.join(root, folder))) {
      if (!/\.(svg|jpg|jpeg|png|webp|ttf|woff|woff2)$/i.test(file)) continue;
      const key = path.relative(path.join(root, "assets"), file).replace(/\\/g, "/");
      assets[key] = dataUri(file);
    }
  }
  return assets;
}

function compressedMusicUri() {
  const ffmpeg = findFfmpeg();
  const source = path.join(root, "assets", "audio", "bgm.mp3");
  if (!ffmpeg) {
    const previousCompressed = fs.readdirSync(path.join(root, "dist"))
      .filter((name) => /^bgm-embedded-vn\d+\.mp3$/.test(name))
      .sort()
      .pop();
    if (previousCompressed) return dataUri(path.join(root, "dist", previousCompressed));
    throw new Error("Missing ffmpeg. Set FFMPEG_PATH or install ffmpeg-static before building the embedded release.");
  }
  const target = path.join(root, "dist", `bgm-embedded-${version}.mp3`);
  remove(target);
  execFileSync(ffmpeg, ["-y", "-i", source, "-vn", "-ac", "2", "-b:a", "64k", target], {
    stdio: "ignore"
  });
  return dataUri(target);
}

function buildApp(data, assets, musicUri) {
  let app = readText("app.js");
  app = app.replace(/const ASSET_VERSION = "[^"]+";/, `const ASSET_VERSION = "${version}-embedded";`);
  app = app.replace(
    /const BGM_FILES = \[[\s\S]*?\];/,
    `const BGM_FILES = [\n  ${JSON.stringify(musicUri)}\n];`
  );
  app = app.replace(
    /const els = \{/,
    `const EMBEDDED_GAME_DATA = ${JSON.stringify(data)};\nconst EMBEDDED_ASSETS = ${JSON.stringify(assets)};\n\nconst els = {`
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
    const key = rel.replace(/\\/g, "/");
    return assets[key] ? `url("${assets[key]}")` : match;
  });
}

function buildHtml() {
  let html = readText("index.html");
  html = html.replace(/styles\.css\?v=[^"]+/, `styles.css?v=${version}-embedded`);
  html = html.replace(/app\.js\?v=[^"]+/, `app.js?v=${version}-embedded`);
  html = html.replace(/<link rel="manifest" href="\.\/manifest\.webmanifest" \/>\s*/, "");
  return html;
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
const assets = collectAssets();
const musicUri = compressedMusicUri();

writeText("index.html", buildHtml());
writeText("styles.css", buildCss(assets));
writeText("app.js", buildApp(data, assets, musicUri));
writeText("manifest.webmanifest", JSON.stringify({
  name: data["data/story.json"].nodes.title.title,
  short_name: data["data/story.json"].nodes.title.title,
  start_url: "./index.html",
  display: "standalone",
  background_color: "#fff4dc",
  theme_color: "#fff4dc",
  orientation: "portrait",
  icons: []
}, null, 2));

compressZip();

console.log(JSON.stringify({
  outDir,
  zipPath,
  jsonFiles: Object.keys(data).length,
  embeddedAssets: Object.keys(assets).length,
  zipBytes: fs.statSync(zipPath).size
}, null, 2));
