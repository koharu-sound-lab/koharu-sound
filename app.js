/**
 * こはるサウンド — メインアプリケーション
 *
 * CSV列名（スプレッドシート1行目）の想定:
 *   id, title, genre, tags, mp3, wav, youtube
 * 日本語列名にも対応: 管理番号, 曲名, ジャンル, タグ, MP3, WAV, Youtube
 *
 * サムネイル: assets/thumbnails/{管理番号}.png を自動参照
 */

// サムネイル画像の配置先（ファイル名 = 管理番号.png）
const THUMBNAIL_DIR = "assets/thumbnails";

// 後ほど差し替えるためのダミーURL
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTBqDvrRG67VKArIirsVZ99hznQ8GyFMqm0om3nsh2zxTKLr4Cp2YttOPPiPd9qBxRckusgFk1hdxpV/pub?gid=0&single=true&output=csv";

const COLUMN_MAP = {
  id: ["id", "管理番号", "song_id", "songid"],
  title: ["title", "曲名", "name", "song_name"],
  genre: ["genre", "ジャンル"],
  tags: ["tags", "tag", "タグ"],
  mp3: ["mp3", "mp3_url", "mp3url"],
  wav: ["wav", "wav_url", "wavurl"],
  youtube: ["youtube", "Youtube", "YouTube", "youtube_url", "youtubeurl", "youtube_link"],
};

/* ---- CSV Parser ---- */

function parseCSV(text) {
  const rows = [];
  let current = "";
  let inQuotes = false;
  const row = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(current.trim());
      if (row.some((cell) => cell !== "")) rows.push([...row]);
      row.length = 0;
      current = "";
    } else {
      current += char;
    }
  }

  if (current !== "" || row.length > 0) {
    row.push(current.trim());
    if (row.some((cell) => cell !== "")) rows.push(row);
  }

  return rows;
}

function normalizeHeader(header) {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function normalizeCellUrl(value) {
  if (!value) return "";

  const trimmed = value.trim();
  const hyperlinkMatch = trimmed.match(/HYPERLINK\s*\(\s*"([^"]+)"\s*[,;]/i);
  if (hyperlinkMatch) return hyperlinkMatch[1].trim();

  const urlMatch = trimmed.match(/https?:\/\/[^\s"<>]+/i);
  if (urlMatch) return urlMatch[0].trim();

  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return `https://www.youtube.com/watch?v=${trimmed}`;
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : "";
}

function findColumnIndex(headers, aliases, partialMatch) {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normalized.indexOf(normalizeHeader(alias));
    if (idx !== -1) return idx;
  }
  if (partialMatch) {
    const key = normalizeHeader(partialMatch);
    const idx = normalized.findIndex((header) => header.includes(key));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseListField(value) {
  if (!value) return [];
  return value
    .split(/[,、|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapRowsToSongs(rows) {
  if (rows.length < 2) return [];

  const headers = rows[0];
  const indices = {};

  for (const [key, aliases] of Object.entries(COLUMN_MAP)) {
    const partial = key === "youtube" ? "youtube" : undefined;
    indices[key] = findColumnIndex(headers, aliases, partial);
  }

  return rows.slice(1).reduce((songs, row) => {
    const get = (key) => {
      const idx = indices[key];
      return idx >= 0 ? (row[idx] || "").trim() : "";
    };

    const id = get("id");
    const title = get("title");

    if (!id && !title) return songs;

    songs.push({
      id: id || `song-${String(songs.length + 1).padStart(3, "0")}`,
      title: title || "Untitled",
      genre: parseListField(get("genre")),
      tags: parseListField(get("tags")),
      mp3: normalizeCellUrl(get("mp3")),
      wav: normalizeCellUrl(get("wav")),
      youtube: normalizeCellUrl(get("youtube")),
    });

    return songs;
  }, []);
}

/* ---- Download URL ---- */

function extractDriveFileId(url) {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/uc\?(?:export=download&)?(?:confirm=[^&]+&)?id=([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function toDownloadUrl(url) {
  if (!url) return "";
  const fileId = extractDriveFileId(url);
  if (fileId) {
    return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
  }
  return url;
}

function createLinkButton(label, url, className) {
  const link = document.createElement("a");
  link.className = className;
  link.textContent = label;

  if (!url) {
    link.classList.add("btn--disabled");
    link.title = "スプレッドシートの Youtube 列に URL を入力してください";
    link.addEventListener("click", (e) => e.preventDefault());
    return link;
  }

  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function createDownloadButton(label, url, isPrimary) {
  const link = document.createElement("a");
  link.className = isPrimary ? "btn btn--primary" : "btn";
  link.textContent = label;

  if (!url) {
    link.href = "#";
    link.setAttribute("aria-disabled", "true");
    return link;
  }

  link.href = toDownloadUrl(url);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function createYoutubeButton(url) {
  return createLinkButton("Youtubeで試聴", url, "btn btn--youtube");
}

/* ---- DOM Rendering ---- */

function getThumbnailPath(id) {
  return `${THUMBNAIL_DIR}/${id}.png`;
}

function createSongCard(song) {
  const card = document.createElement("article");
  card.className = "song-card";
  card.id = song.id;

  const thumbWrap = document.createElement("div");
  thumbWrap.className = "song-card__thumb";

  const img = document.createElement("img");
  img.src = getThumbnailPath(song.id);
  img.alt = song.title;
  img.loading = "lazy";
  img.addEventListener("error", () => {
    img.replaceWith(createThumbPlaceholder());
  });
  thumbWrap.appendChild(img);

  const genreHtml = song.genre
    .map((genre) => `<span class="tag tag--genre">${escapeHtml(genre)}</span>`)
    .join("");

  const tagsHtml = song.tags
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join("");

  const actions = document.createElement("div");
  actions.className = "song-card__actions";

  const youtubeWrap = document.createElement("div");
  youtubeWrap.className = "song-card__youtube";
  youtubeWrap.appendChild(createYoutubeButton(song.youtube));
  actions.appendChild(youtubeWrap);

  const downloadLabel = document.createElement("p");
  downloadLabel.className = "song-card__download-label";
  downloadLabel.textContent = "━ダウンロード━";
  actions.appendChild(downloadLabel);

  const downloads = document.createElement("div");
  downloads.className = "song-card__downloads";
  downloads.appendChild(createDownloadButton("MP3", song.mp3, true));
  downloads.appendChild(createDownloadButton("WAV", song.wav, true));
  actions.appendChild(downloads);

  card.innerHTML = `
    <div class="song-card__body">
      <p class="song-card__id">${escapeHtml(song.id)}</p>
      <h2 class="song-card__title">${escapeHtml(song.title)}</h2>
      ${genreHtml ? `<div class="song-card__genres">${genreHtml}</div>` : ""}
      ${tagsHtml ? `<div class="song-card__tags">${tagsHtml}</div>` : ""}
    </div>
  `;

  card.querySelector(".song-card__body").appendChild(actions);

  card.prepend(thumbWrap);
  return card;
}

function createThumbPlaceholder() {
  const el = document.createElement("div");
  el.className = "song-card__thumb-placeholder";
  el.textContent = "NO IMAGE";
  return el;
}

function escapeHtml(str) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(str).replace(/[&<>"']/g, (c) => map[c]);
}

function renderSongs(songs, container) {
  container.innerHTML = "";
  const fragment = document.createDocumentFragment();

  songs.forEach((song) => {
    fragment.appendChild(createSongCard(song));
  });

  container.appendChild(fragment);
}

/* ---- Hash Navigation (YouTube連動) ---- */

function scrollToSongFromHash() {
  const hash = window.location.hash;
  if (!hash || hash.length <= 1) return;

  const targetId = decodeURIComponent(hash.slice(1));
  const target = document.getElementById(targetId);

  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.classList.add("highlight");
    setTimeout(() => target.classList.remove("highlight"), 2400);
  }
}

/* ---- Init ---- */

async function init() {
  const grid = document.getElementById("song-grid");
  const status = document.getElementById("status-message");

  if (!grid) return;

  try {
    const response = await fetch(CSV_URL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    const rows = parseCSV(text);
    const songs = mapRowsToSongs(rows);

    if (songs.length === 0) {
      status.textContent = "楽曲データが見つかりませんでした。";
      status.classList.add("error");
      return;
    }

    status.remove();
    renderSongs(songs, grid);
    scrollToSongFromHash();
  } catch (err) {
    console.error("CSV fetch error:", err);
    status.innerHTML =
      '楽曲データの取得に失敗しました。<span class="pulse">CSV URL を確認してください。</span>';
    status.classList.add("error");
  }
}

window.addEventListener("hashchange", scrollToSongFromHash);
document.addEventListener("DOMContentLoaded", init);
