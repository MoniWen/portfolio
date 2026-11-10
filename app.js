/* ==========================================================
   Moni Portfolio — white minimal edition
   数据来自 assets/data.js（由桌面「个人作品集」文件夹生成）
   ========================================================== */

const DATA = window.PORTFOLIO_DATA || { categories: [], projects: [] };
const categories = DATA.categories;
const projects = DATA.projects;
const TOTAL = projects.length;

/* 视频地址在 data.js 里做了轻量编码，避免页面源码里出现可直接复制的下载地址。
   注意：静态托管无法从物理上阻止下载，这里只是移除随手可得的入口。 */
const VIDEO_XOR = 0x5a;
const decodeVideoPath = (value) => {
  if (!value || value.startsWith("./")) return value;
  try {
    const raw = atob(value);
    let out = "";
    for (let i = 0; i < raw.length; i += 1) {
      out += String.fromCharCode(raw.charCodeAt(i) ^ VIDEO_XOR);
    }
    return out;
  } catch (e) {
    return value;
  }
};
projects.forEach((p) => {
  p.video = decodeVideoPath(p.video);
  p.videoLite = decodeVideoPath(p.videoLite);
});

/* ---------------------------------------------------------
   0. 自选封面：读取本机浏览器里保存的自定义封面
   --------------------------------------------------------- */
const COVER_STORE = "moni-portfolio-covers-v1";
const coverStore = (() => {
  try {
    return JSON.parse(localStorage.getItem(COVER_STORE) || "{}") || {};
  } catch (e) {
    return {};
  }
})();
/* 首页封面走内联缩略图（data URI），避免 22 张图被 <img> 与光盘背景各下载一遍。
   本地 serve.py 编辑场景仍回退到磁盘原图，保证改封面后刷新可见。 */
const diskThumb = (p) => `./assets/thumbs/${p.id}.jpg`;
const defaultThumb = (p) =>
  (window.PORTFOLIO_THUMBS && window.PORTFOLIO_THUMBS[p.id]) || diskThumb(p);
// file:// 下给路径加 ?v= 会让本地文件找不到，用 #v= 更安全
const thumbWithVersion = (p, v) =>
  `${diskThumb(p)}${location.protocol === "file:" ? "#v=" : "?v="}${v}`;

projects.forEach((p) => {
  const rec = coverStore[p.id];
  p.thumb = rec && rec.dataUrl ? rec.dataUrl : defaultThumb(p);
});

const CAT_EN = {
  人物采访: "INTERVIEW",
  婚礼: "WEDDING FILM",
  "纪录/宣传片": "BRAND FILM",
  微电影: "MICRO FILM",
  活动: "EVENT FILM",
  短视频: "SHORT FORM",
};

const $ = (id) => document.getElementById(id);
const pad2 = (n) => String(n).padStart(2, "0");
const catOf = (p) => CAT_EN[p.category] || p.category;

// 展示顺序由 data.js 的 order 字段决定（未设置时按原始数组顺序）；
// data-index 始终是作品在数组里的固定索引，调顺序不会让播放对应错片。
const sortedPairs = () =>
  projects
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.order ?? a.i) - (b.p.order ?? b.i));

/* ---------------------------------------------------------
   1. Works and Project — 按桌面文件夹名分类
   --------------------------------------------------------- */
function renderWorks() {
  $("works-sub").textContent = `${categories.length} CATEGORIES / ${TOTAL} FILMS`;

  $("works-categories").innerHTML = categories
    .map((cat) => {
      const list = sortedPairs().filter(({ p }) => p.category === cat);
      return `
        <section class="works-category">
          <div class="works-category-head">
            <h3 class="works-category-name">${cat}</h3>
            <span class="works-category-en">${CAT_EN[cat] || ""}</span>
            <span class="works-category-count">${pad2(list.length)} FILMS</span>
          </div>
          <div class="works-grid">
            ${list
              .map(
                ({ p, i }) => `
              <a class="work-card" href="#film" data-index="${i}" aria-label="播放 ${p.title}，完整时长 ${p.durationText}">
                <img src="${p.thumb}" alt="${p.title}" loading="lazy" data-cover-id="${p.id}" />
                <span class="work-card-title">${p.title}</span>
                <span class="work-card-meta">
                  <span>${p.category}</span>
                  <span>${p.durationText}</span>
                </span>
              </a>`,
              )
              .join("")}
          </div>
        </section>`;
    })
    .join("");

  $("works-categories").addEventListener("click", (event) => {
    const card = event.target.closest("[data-index]");
    if (!card) return;
    event.preventDefault();
    openVideo(Number(card.dataset.index));
  });
}

/* ---------------------------------------------------------
   2. Film strip — 全部影片，点击可看完整视频与时长
   --------------------------------------------------------- */
let filmFilter = "全部";

function renderFilmCats() {
  const counts = categories.map((cat) => ({
    cat,
    count: projects.filter((p) => p.category === cat).length,
  }));

  $("film-cats").innerHTML = [{ cat: "全部", count: TOTAL }, ...counts]
    .map(
      ({ cat, count }) => `
      <button class="film-cat${cat === filmFilter ? " is-active" : ""}" type="button" data-cat="${cat}">
        ${cat}<span>${pad2(count)}</span>
      </button>`,
    )
    .join("");

  $("film-cats").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-cat]");
    if (!btn) return;
    filmFilter = btn.dataset.cat;
    $("film-cats")
      .querySelectorAll(".film-cat")
      .forEach((el) => el.classList.toggle("is-active", el.dataset.cat === filmFilter));
    $("film-strip-scroll").scrollTop = 0;
    applyFilmFilter();
    updateFilmReadout(0);
  });
}

function renderFilmStrip() {
  $("film-strip").innerHTML = sortedPairs()
    .map(
      ({ p, i }, pos) => `
      <button class="film-frame" type="button" data-index="${i}" data-cat="${p.category}"
        aria-label="播放 ${p.title}，完整时长 ${p.durationText}">
        <img src="${diskThumb(p)}" alt="${p.title} 画面" loading="lazy" decoding="async" data-film-id="${p.id}" />
        <span class="film-frame-label">
          <span>${pad2(pos + 1)} / ${p.title}</span>
          <span>${p.durationText}</span>
        </span>
      </button>`,
    )
    .join("");

  const strip = $("film-strip");

  strip.addEventListener("click", (event) => {
    const frame = event.target.closest("[data-index]");
    if (!frame) return;
    openVideo(Number(frame.dataset.index));
  });

  strip.addEventListener("pointerover", (event) => {
    const frame = event.target.closest("[data-index]");
    if (frame) updateFilmReadout(Number(frame.dataset.index));
  });

  strip.addEventListener("focusin", (event) => {
    const frame = event.target.closest("[data-index]");
    if (frame) updateFilmReadout(Number(frame.dataset.index));
  });
}

function applyFilmFilter() {
  const frames = $("film-strip").querySelectorAll(".film-frame");
  frames.forEach((frame) => {
    frame.hidden = filmFilter !== "全部" && frame.dataset.cat !== filmFilter;
  });
}

function visibleFilmFrames() {
  return [...$("film-strip").querySelectorAll(".film-frame")].filter((f) => !f.hidden);
}

function updateFilmReadout(index) {
  const p = projects[index];
  if (!p) return;
  $("film-kicker").textContent = `${catOf(p)} / ${p.category}`;
  $("film-title").textContent = p.title;
  $("film-time").textContent = p.durationText;

  $("film-strip")
    .querySelectorAll(".film-frame")
    .forEach((frame) =>
      frame.classList.toggle("is-active", Number(frame.dataset.index) === index),
    );
}

/* ---------------------------------------------------------
   3. Discs — A24 弧形逼真光盘
   --------------------------------------------------------- */
const DISC_CATS = ["纪录/宣传片", "人物采访", "微电影", "婚礼", "活动", "短视频"];
let discCat = DISC_CATS[0];
let discList = [];   // 当前分类下的全局项目索引
let discCursor = 0;  // 当前选中的光盘在 discList 中的位置
let discEls = [];

function renderDiscCats() {
  $("disc-cats").innerHTML = DISC_CATS
    .map((cat) => {
      const count = projects.filter((p) => p.category === cat).length;
      return `
      <button class="disc-cat${cat === discCat ? " is-active" : ""}" type="button" data-disc-cat="${cat}">
        ${cat}<span>${pad2(count)}</span>
      </button>`;
    })
    .join("");

  $("disc-cats").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-disc-cat]");
    if (!btn) return;
    setDiscCat(btn.dataset.discCat);
  });
}

function setDiscCat(cat) {
  discCat = cat;
  discList = sortedPairs()
    .filter(({ p }) => p.category === cat)
    .map(({ i }) => i);
  discCursor = 0;
  $("disc-cats")
    .querySelectorAll(".disc-cat")
    .forEach((el) => el.classList.toggle("is-active", el.dataset.discCat === cat));
  applyDisc();
}

function renderDiscs() {
  $("disc-stage").innerHTML = sortedPairs()
    .map(
      ({ p, i }) => `
      <div class="disc" data-index="${i}" data-cover-id="${p.id}" data-pos="" data-hidden="true"
        style="--disc-art: url('${p.thumb}')" role="button" tabindex="-1"
        aria-label="${p.title}，${catOf(p)}，${p.durationText}">
        <div class="disc-hub"></div>
        <div class="disc-hole"></div>
        <span class="disc-label">${p.title}</span>
        <span class="disc-play"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l14 8-14 8z"/></svg></span></span>
      </div>`,
    )
    .join("");

  discEls = [...$("disc-stage").querySelectorAll(".disc")];

  const stageEl = $("disc-stage");
  let dragX0 = 0, dragging = false, justSwiped = false;

  /* 点击光盘：先播放波浪涟漪，再打开影片 */
  stageEl.addEventListener("click", (event) => {
    const disc = event.target.closest(".disc");
    if (!disc) return;
    if (justSwiped) { justSwiped = false; return; }
    spawnRippleAt(event.clientX, event.clientY);
    const idx = Number(disc.dataset.index);
    setTimeout(() => playDisc(idx), 240);
  });

  /* 键盘：回车/空格播放，并给出涟漪反馈 */
  stageEl.addEventListener("keydown", (event) => {
    const disc = event.target.closest(".disc");
    if (!disc || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    const r = disc.getBoundingClientRect();
    spawnRippleAt(r.left + r.width / 2, r.top + r.height / 2);
    playDisc(Number(disc.dataset.index));
  });

  /* 左右拖拽滑动切换光盘 */
  stageEl.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragging = true;
    justSwiped = false;
    dragX0 = event.clientX;
    stageEl.classList.add("is-dragging", "is-grabbing");
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
  });
  function onDragMove(event) {
    if (!dragging) return;
    stageEl.style.setProperty("--drag-x", (event.clientX - dragX0) + "px");
  }
  function onDragEnd(event) {
    if (!dragging) return;
    dragging = false;
    stageEl.classList.remove("is-dragging", "is-grabbing");
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    const dx = event.clientX - dragX0;
    stageEl.style.setProperty("--drag-x", "0px");
    if (Math.abs(dx) > 40) {
      justSwiped = true;
      stepDisc(dx < 0 ? 1 : -1);
    }
  }

  document.querySelector("[data-prev]").addEventListener("click", () => stepDisc(-1));
  document.querySelector("[data-next]").addEventListener("click", () => stepDisc(1));

  renderDiscCats();
  setDiscCat(discCat);
}

function playDisc(globalIndex) {
  const pos = discList.indexOf(globalIndex);
  if (pos < 0) return;
  discCursor = pos;
  applyDisc();
  openVideo(globalIndex);
}

function applyDisc() {
  const n = discList.length;
  if (!n) return;
  discCursor = (discCursor + n) % n;

  // 当前选中的光盘固定在正中（slot 0），其余按分类内顺序对称排在两侧
  const slots = new Map();
  if (n <= 5) {
    discList.forEach((gi, j) => {
      let d = j - discCursor;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      slots.set(gi, d);
    });
  } else {
    for (let d = -2; d <= 2; d++) {
      slots.set(discList[((discCursor + d) % n + n) % n], d);
    }
  }

  const currentGi = discList[discCursor];
  discEls.forEach((el) => {
    const i = Number(el.dataset.index);
    const slot = slots.get(i);
    const show = slot !== undefined;
    el.dataset.hidden = show ? "false" : "true";
    el.dataset.pos = show && i === currentGi ? "0" : "";
    el.style.setProperty("--slot", show ? String(slot) : "0");
    el.tabIndex = show ? 0 : -1;
    el.setAttribute("aria-hidden", show ? "false" : "true");
  });

  const p = projects[currentGi];
  $("disc-current").textContent = pad2(discCursor + 1);
  $("disc-total").textContent = pad2(n);

  $("disc-meta").innerHTML = `
    <p class="disc-meta-title">${p.title}</p>
    <dl class="disc-meta-list">
      <dt>Category</dt><dd>${p.category} / ${catOf(p)}</dd>
      <dt>Duration</dt><dd>${p.durationText} 完整影片</dd>
      <dt>Editor</dt><dd>Moni</dd>
      <dt>Source</dt><dd title="${p.file}">${p.file}</dd>
    </dl>`;

  $("disc-quote-text").innerHTML =
    `&ldquo;在未知的快门中加了时间的印记&rdquo;` +
    `<small>${catOf(p)} / ${p.durationText} / MONI PORTFOLIO</small>`;
}

function stepDisc(direction) {
  discCursor += direction;
  applyDisc();
}

/* 在 (x, y) 处生成波浪圆环涟漪（围绕被点击的光盘震动扩散） */
function spawnRippleAt(x, y) {
  const NS = "http://www.w3.org/2000/svg";
  const wrap = document.createElement("div");
  wrap.className = "disc-ripple";
  wrap.style.left = x + "px";
  wrap.style.top = y + "px";

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "disc-ripple-svg");
  svg.setAttribute("viewBox", "-100 -100 200 200");

  [
    { r: 34, d: "0s" },
    { r: 58, d: "0.12s" },
    { r: 82, d: "0.24s" },
  ].forEach(({ r, d }) => {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("class", "rw");
    path.setAttribute("d", wavyCircle(0, 0, r, 9, 3.4));
    path.style.setProperty("--d", d);
    svg.appendChild(path);
  });

  wrap.appendChild(svg);
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 1000);
}

/* 生成带正弦扰动的圆形路径，营造波浪线条质感 */
function wavyCircle(cx, cy, r, waves, amp) {
  const steps = 140;
  let d = "";
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * Math.PI * 2;
    const rr = r + amp * Math.sin(waves * a);
    const px = cx + rr * Math.cos(a);
    const py = cy + rr * Math.sin(a);
    d += (k === 0 ? "M" : "L") + px.toFixed(1) + " " + py.toFixed(1);
  }
  return d + "Z";
}

/* ---------------------------------------------------------
   4. Video dialog — 完整视频 + 真实完整时长
   --------------------------------------------------------- */
const dialog = $("video-dialog");
const player = $("video-player");

/* 播放器保护：禁用右键另存、拖拽保存、画中画与原生下载按钮 */
["video-player", "cover-video"].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.setAttribute("controlsList", "nodownload noremoteplayback noplaybackrate");
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  el.addEventListener("dragstart", (e) => e.preventDefault());
  try { el.disablePictureInPicture = true; } catch (e) {}
});

/* 全局兜底：文档级禁右键/拖拽，覆盖动态创建的播放器元素 */
document.addEventListener("contextmenu", (e) => {
  if (e.target && e.target.tagName === "VIDEO") e.preventDefault();
});
document.addEventListener("dragstart", (e) => {
  if (e.target && e.target.tagName === "VIDEO") e.preventDefault();
});


/* 默认播放流畅版（体积小、加载快）；只有点「高清」才去拉 R2 上的原片。
   选封面用的 cover-video 仍走 p.video，保证导出封面是原片画质。 */
let currentVideoIndex = -1;
let usingHD = false;
const qualityBtn = $("video-quality");

function syncQualityButton() {
  const p = projects[currentVideoIndex];
  if (!qualityBtn) return;
  const available = !!(p && p.videoLite && p.videoLite !== p.video);
  qualityBtn.hidden = !available;
  qualityBtn.textContent = usingHD ? "切回流畅" : "高清画质";
  qualityBtn.setAttribute("aria-pressed", usingHD ? "true" : "false");
  qualityBtn.title = usingHD
    ? "当前：原片高清；点击切回快速加载的流畅版"
    : "当前：流畅版（加载快）；点击切换为原片高清";
}

if (qualityBtn) {
  qualityBtn.addEventListener("click", () => {
    const p = projects[currentVideoIndex];
    if (!p || !p.videoLite) return;
    const at = player.currentTime || 0;
    const wasPlaying = !player.paused;
    usingHD = !usingHD;
    player.pause();
    player.src = usingHD ? p.video : p.videoLite;
    player.load();
    player.addEventListener("loadedmetadata", () => {
      try {
        const max = (player.duration || at) - 0.25;
        player.currentTime = Math.max(0, Math.min(at, max));
      } catch (e) {}
      if (wasPlaying) player.play().catch(() => {});
    }, { once: true });
    syncQualityButton();
  });
}

function openVideo(index) {
  const p = projects[index];
  if (!p) return;

  currentVideoIndex = index;
  usingHD = false;

  $("video-kicker").textContent = `${catOf(p)} / ${p.category}`;
  $("video-title").textContent = p.title;
  $("video-duration").textContent = p.durationText;
  $("video-file").textContent = p.file;

  syncQualityButton();
  player.pause();
  player.poster = p.thumb;
  player.dataset.fallback = "";
  player.src = p.videoLite || p.video;
  player.load();

  if (!dialog.open) dialog.showModal();
  document.body.classList.add("is-video-open");
  player.play().catch(() => {});
}

function closeVideo() {
  if (dialog.open) dialog.close();
}

document.querySelector("[data-video-close]").addEventListener("click", closeVideo);
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) closeVideo();
});
dialog.addEventListener("close", () => {
  player.pause();
  player.removeAttribute("src");
  player.load();
  document.body.classList.remove("is-video-open");
});

/* ---------------------------------------------------------
   5. Header / 键盘 / 滚动读数
   --------------------------------------------------------- */
const header = document.querySelector("[data-header]");
function updateHeader() {
  header.classList.toggle("is-scrolled", window.scrollY > 20);
}
window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();

const navLinks = [...document.querySelectorAll(".primary-nav a")];
const sections = ["about", "film", "works", "disc", "contact"]
  .map((id) => $(id))
  .filter(Boolean);

const navObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((a) =>
        a.classList.toggle("is-active", a.getAttribute("href") === `#${entry.target.id}`),
      );
    });
  },
  { rootMargin: "-30% 0px -60% 0px" },
);
sections.forEach((section) => navObserver.observe(section));

// 胶卷滚动时，把最靠近视口中心的画面写入右侧读数
const stripScroll = $("film-strip-scroll");
let filmScrollFrame = 0;
stripScroll.addEventListener(
  "scroll",
  () => {
    if (filmScrollFrame) return;
    filmScrollFrame = requestAnimationFrame(() => {
      filmScrollFrame = 0;
      const center = stripScroll.scrollTop + stripScroll.clientHeight / 2;
      let best = null;
      let bestDist = Infinity;
      visibleFilmFrames().forEach((frame) => {
        const middle = frame.offsetTop + frame.offsetHeight / 2;
        const dist = Math.abs(middle - center);
        if (dist < bestDist) {
          bestDist = dist;
          best = frame;
        }
      });
      if (best) updateFilmReadout(Number(best.dataset.index));
    });
  },
  { passive: true },
);

// 光盘区域在视口内时，左右方向键可切换
window.addEventListener("keydown", (event) => {
  if (dialog.open || $("cover-dialog").open || $("order-dialog").open) return;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const rect = $("disc").getBoundingClientRect();
  const inView = rect.top < window.innerHeight * 0.7 && rect.bottom > window.innerHeight * 0.3;
  if (!inView) return;
  stepDisc(event.key === "ArrowLeft" ? -1 : 1);
});

/* ---------------------------------------------------------
   Init
   --------------------------------------------------------- */
renderWorks();
renderFilmCats();
renderFilmStrip();
applyFilmFilter();
updateFilmReadout(0);
renderDiscs();

/* ---------------------------------------------------------
   6. Cover picker — 自己挑视频里的任意一帧当封面
   --------------------------------------------------------- */
const coverDialog = $("cover-dialog");
const coverVideo = $("cover-video");
const coverRange = $("cover-range");
const coverTime = $("cover-time");
const coverStatus = $("cover-status");
const coverDownload = $("cover-download");
const coverToggle = $("cover-tool-toggle");
let coverMode = false;
let coverIndex = -1;
let coverReady = false;
let coverDataUrl = null;
let coverSeeking = false;
let coverBanner = null;
let coverApi = null;
let coverVersionsApplied = false;

// 本地保存服务（serve.py）探测：连上后封面可直接写进 assets/thumbs/
async function detectCoverApi() {
  // 只连自己的本地保存服务；不要用相对 /api/cover，
  // 否则在内置预览里会打到预览宿主并被文件策略拦截。
  const endpoints = ["http://localhost:8765/api/cover", "http://127.0.0.1:8765/api/cover"];
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ probe: true }),
        signal: AbortSignal.timeout(1800),
      });
      const info = await res.json();
      const looksLikeOurService =
        info && info.ok === true && info.persist === true &&
        info.versions && Object.keys(info.versions).length >= 20;
      if (looksLikeOurService) {
        coverApi = endpoint;
        if (!coverVersionsApplied && info.versions) {
          coverVersionsApplied = true;
          projects.forEach((p) => {
            if (info.versions[p.id] && !coverStore[p.id]) {
              p.thumb = thumbWithVersion(p, info.versions[p.id]);
              applyCoverToDom(p.id);
            }
          });
        }
        return true;
      }
    } catch (e) {
      // 服务未启动，继续尝试下一个地址
    }
  }
  coverApi = null;
  return false;
}

function postCover(payload) {
  return fetch(coverApi, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(payload),
  }).then((r) => r.json());
}

function updateCoverBadge(live) {
  const badge = $("cover-api-badge");
  if (!badge) return;
  badge.textContent = live ? "可永久保存 · 已连接本地服务" : "临时模式 · 仅本机预览";
  badge.className = `cover-api-badge ${live ? "is-live" : "is-temp"}`;
}

function saveCoverStore() {
  try {
    localStorage.setItem(COVER_STORE, JSON.stringify(coverStore));
    return true;
  } catch (e) {
    return false;
  }
}

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${pad2(m)}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}

function setCoverStatus(msg, kind) {
  coverStatus.textContent = msg;
  coverStatus.className = "cover-status" + (kind ? ` is-${kind}` : "");
}

function applyCoverToDom(id) {
  const p = projects.find((x) => x.id === id);
  if (!p) return;
  document.querySelectorAll(`img[data-cover-id="${id}"]`).forEach((img) => {
    img.src = p.thumb;
  });
  document.querySelectorAll(`.disc[data-cover-id="${id}"]`).forEach((el) => {
    el.style.setProperty("--disc-art", `url("${p.thumb}")`);
  });
}

function setCoverMode(on) {
  coverMode = on;
  document.body.classList.toggle("is-cover-mode", on);
  coverToggle.classList.toggle("is-on", on);
  coverToggle.setAttribute("aria-pressed", String(on));
  coverToggle.textContent = on ? "退出自选封面" : "自选封面";
  if (on && !coverBanner) {
    coverBanner = document.createElement("div");
    coverBanner.className = "cover-mode-banner";
    coverBanner.innerHTML =
      `<span>自选封面模式：点击任意作品，从视频里挑一帧</span><button type="button" data-cover-exit>退出</button>`;
    coverBanner.addEventListener("click", (event) => {
      if (event.target.closest("[data-cover-exit]")) setCoverMode(false);
    });
    document.body.appendChild(coverBanner);
  }
  if (coverBanner) coverBanner.hidden = !on;
  if (!on && coverDialog.open) coverDialog.close();
}

coverToggle.addEventListener("click", () => setCoverMode(!coverMode));

// 捕获阶段拦截：封面模式下点击作品不播放视频，而是打开选帧面板
document.addEventListener(
  "click",
  (event) => {
    if (!coverMode) return;
    if (
      event.target.closest("#cover-dialog") ||
      event.target.closest("#cover-tool-toggle") ||
      event.target.closest("#order-dialog") ||
      event.target.closest("#order-tool-toggle") ||
      event.target.closest(".cover-mode-banner")
    )
      return;
    const el = event.target.closest("[data-index]");
    if (!el || !event.target.closest("#film, #works, #disc")) return;
    event.preventDefault();
    event.stopPropagation();
    openCoverEditor(Number(el.dataset.index));
  },
  true,
);

function openCoverEditor(index) {
  const p = projects[index];
  if (!p) return;
  coverIndex = index;
  coverReady = false;
  coverDataUrl = null;
  coverDownload.disabled = true;
  $("cover-title").textContent = p.title;
  $("cover-sub").textContent = `${p.category} / ${catOf(p)} · 完整时长 ${p.durationText} · ${p.id}`;
  coverRange.value = "0";
  coverRange.max = String(p.duration || 100);
  coverTime.textContent = "00:00.0";
  setCoverStatus("正在载入视频…", "");
  coverVideo.pause();
  coverVideo.removeAttribute("src");
  coverVideo.load();
  coverVideo.src = p.video;
  coverVideo.load();
  if (!coverDialog.open) coverDialog.showModal();
  detectCoverApi().then(updateCoverBadge);

  const rec = coverStore[p.id];
  if (rec && rec.time) {
    coverVideo.addEventListener(
      "loadedmetadata",
      () => {
        coverVideo.currentTime = Math.min(rec.time, (coverVideo.duration || rec.time) - 0.1);
        syncCoverTime();
      },
      { once: true },
    );
  }
}

function syncCoverTime() {
  const t = coverVideo.currentTime || 0;
  if (!coverSeeking) coverRange.value = String(t);
  coverTime.textContent = fmtTime(t);
}

coverVideo.addEventListener("loadedmetadata", () => {
  coverReady = true;
  if (Number.isFinite(coverVideo.duration) && coverVideo.duration > 0) {
    coverRange.max = String(coverVideo.duration);
  }
  syncCoverTime();
  setCoverStatus("拖动进度条或点 ±1s 找到想要的画面，然后点「用这一帧作为封面」。", "");
});
coverVideo.addEventListener("timeupdate", syncCoverTime);
coverVideo.addEventListener("seeked", () => {
  coverSeeking = false;
  syncCoverTime();
});

coverRange.addEventListener("input", () => {
  coverSeeking = true;
  const t = Number(coverRange.value);
  coverVideo.currentTime = t;
  coverTime.textContent = fmtTime(t);
});

document.querySelectorAll("[data-cover-step]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!coverReady) return;
    const max = Number(coverRange.max) || 100;
    coverVideo.currentTime = Math.max(0, Math.min(max - 0.05, coverVideo.currentTime + Number(btn.dataset.coverStep)));
  });
});

function captureCoverFrame() {
  const vw = coverVideo.videoWidth;
  const vh = coverVideo.videoHeight;
  if (!vw || !vh) return { error: "视频画面还没准备好" };
  const scale = Math.min(1, 900 / vw);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  canvas.getContext("2d").drawImage(coverVideo, 0, 0, canvas.width, canvas.height);
  try {
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.86) };
  } catch (e) {
    return { error: "当前浏览器禁止导出视频画面" };
  }
}

$("cover-apply").addEventListener("click", async () => {
  const p = projects[coverIndex];
  if (!p) return;
  const t = Number((coverVideo.currentTime || 0).toFixed(2));
  setCoverStatus("正在保存…", "");
  const live = await detectCoverApi();
  updateCoverBadge(live);

  // 连上本地服务：直接把画面写进 assets/thumbs/wXX.jpg，永久生效
  if (live) {
    const result = captureCoverFrame();
    const payload = { id: p.id, time: t };
    if (result.dataUrl) payload.dataUrl = result.dataUrl;
    try {
      const res = await postCover(payload);
      if (!res.ok) throw new Error(res.error || "服务返回失败");
      delete coverStore[p.id];
      saveCoverStore();
      p.thumb = thumbWithVersion(p, Date.now());
      applyCoverToDom(p.id);
      coverDataUrl = result.dataUrl || null;
      coverDownload.disabled = !coverDataUrl;
      setCoverStatus(
        `已保存到 assets/thumbs/${p.id}.jpg（${fmtTime(t)}）。刷新页面、换浏览器都会显示这张封面。`,
        "ok",
      );
    } catch (e) {
      if (result.dataUrl) {
        coverDataUrl = result.dataUrl;
        coverDownload.disabled = false;
      }
      setCoverStatus(
        `保存失败：${e.message}。可点「下载封面 JPG」手动覆盖 assets/thumbs/${p.id}.jpg，或把时间点 ${fmtTime(t)} 发给我；也可双击「启动选封面.command」重启保存服务。`,
        "warn",
      );
    }
    return;
  }

  // 未连上服务：只能临时保存在本机浏览器
  const result = captureCoverFrame();
  if (result.error) {
    setCoverStatus(
      `保存不了：${result.error}，且本地保存服务未启动。请双击「启动选封面.command」重新打开页面，或把时间点 ${fmtTime(t)} 发给我。`,
      "warn",
    );
    return;
  }
  coverDataUrl = result.dataUrl;
  coverStore[p.id] = { dataUrl: result.dataUrl, time: t, file: `${p.id}.jpg` };
  const saved = saveCoverStore();
  p.thumb = result.dataUrl;
  applyCoverToDom(p.id);
  coverDownload.disabled = false;
  setCoverStatus(
    saved
      ? `仅临时保存在本机浏览器（${fmtTime(t)}），不会写进网站文件。请双击「启动选封面.command」重新打开后保存，或点「下载封面 JPG」。`
      : `本机存储不可用，请点「下载封面 JPG」，或双击「启动选封面.command」重新打开。`,
    "warn",
  );
});

coverDownload.addEventListener("click", () => {
  const p = projects[coverIndex];
  if (!p) return;
  const url = coverDataUrl || (coverStore[p.id] && coverStore[p.id].dataUrl);
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = `${p.id}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setCoverStatus(`已下载 ${p.id}.jpg，覆盖 assets/thumbs/ 里的同名文件即可永久生效。`, "ok");
});

$("cover-reset").addEventListener("click", async () => {
  const p = projects[coverIndex];
  if (!p) return;
  delete coverStore[p.id];
  saveCoverStore();
  coverDataUrl = null;
  coverDownload.disabled = true;
  const live = await detectCoverApi();
  updateCoverBadge(live);
  if (live) {
    try {
      const res = await postCover({ id: p.id, action: "reset" });
      if (!res.ok) throw new Error(res.error || "恢复失败");
      p.thumb = thumbWithVersion(p, Date.now());
      applyCoverToDom(p.id);
      setCoverStatus(`已把原始封面写回 assets/thumbs/${p.id}.jpg。`, "ok");
    } catch (e) {
      setCoverStatus(`恢复失败：${e.message}`, "warn");
    }
  } else {
    p.thumb = defaultThumb(p);
    applyCoverToDom(p.id);
    setCoverStatus("已恢复本机原始封面；若文件曾被覆盖，可用 assets/thumbs-before-custom/ 里的备份还原。", "ok");
  }
});

$("cover-export").addEventListener("click", () => {
  const keys = Object.keys(coverStore);
  if (!keys.length) {
    setCoverStatus("目前还没有自定义封面。", "");
    return;
  }
  const blob = new Blob([JSON.stringify(coverStore, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "moni-covers.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  setCoverStatus(`已导出 ${keys.length} 张自定义封面配置，把它发给我即可批量写回项目文件。`, "ok");
});

document.querySelector("[data-cover-close]").addEventListener("click", () => coverDialog.close());
coverDialog.addEventListener("click", (event) => {
  if (event.target === coverDialog) coverDialog.close();
});
coverDialog.addEventListener("close", () => {
  coverVideo.pause();
  coverVideo.removeAttribute("src");
  coverVideo.load();
});

// 页面打开时就探测一次，让状态徽标准确显示能否永久保存
detectCoverApi().then(updateCoverBadge);

/* ---------------------------------------------------------
   7. Reorder films — 自己调整视频的先后顺序
   --------------------------------------------------------- */
const orderDialog = $("order-dialog");
const orderList = $("order-list");
const orderStatus = $("order-status");
let orderDraft = [];

function setOrderStatus(msg, kind) {
  orderStatus.textContent = msg;
  orderStatus.className = "cover-status" + (kind ? ` is-${kind}` : "");
}

function renderOrderList() {
  const byId = new Map(projects.map((p) => [p.id, p]));
  orderList.innerHTML = orderDraft
    .map((id, pos) => {
      const p = byId.get(id);
      return `
        <li class="order-item" data-id="${id}">
          <span class="order-num">${pad2(pos + 1)}</span>
          <span class="order-title">${p.title}</span>
          <span class="order-cat">${p.category}</span>
          <button type="button" data-order-move="-1" aria-label="上移 ${p.title}" ${pos === 0 ? "disabled" : ""}>↑</button>
          <button type="button" data-order-move="1" aria-label="下移 ${p.title}" ${pos === orderDraft.length - 1 ? "disabled" : ""}>↓</button>
        </li>`;
    })
    .join("");
}

$("order-tool-toggle").addEventListener("click", () => {
  orderDraft = sortedPairs().map(({ p }) => p.id);
  renderOrderList();
  setOrderStatus("用 ↑ / ↓ 调整，改完点「保存顺序」；保存后页面会自动刷新。", "");
  if (!orderDialog.open) orderDialog.showModal();
});

orderList.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-order-move]");
  if (!btn) return;
  const item = btn.closest(".order-item");
  const pos = orderDraft.indexOf(item.dataset.id);
  const next = pos + Number(btn.dataset.orderMove);
  if (pos < 0 || next < 0 || next >= orderDraft.length) return;
  [orderDraft[pos], orderDraft[next]] = [orderDraft[next], orderDraft[pos]];
  renderOrderList();
});

async function saveOrder(list) {
  await detectCoverApi();
  const endpoint = coverApi
    ? coverApi.replace("/api/cover", "/api/order")
    : "http://localhost:8765/api/order";
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ order: list }),
    });
    const info = await res.json();
    if (!info.ok) throw new Error(info.error || "保存失败");
    setOrderStatus("顺序已写入网站文件，正在刷新页面…", "ok");
    setTimeout(() => location.reload(), 700);
  } catch (e) {
    setOrderStatus(
      `保存失败：${e.message}。请双击「启动选封面.command」启动本地服务后再试，或把想要的顺序告诉我。`,
      "warn",
    );
  }
}

$("order-save").addEventListener("click", () => saveOrder(orderDraft));
$("order-reset").addEventListener("click", () => {
  orderDraft = projects.map((p) => p.id).sort();
  renderOrderList();
  setOrderStatus("已恢复为默认顺序（尚未保存），点「保存顺序」才会生效。", "");
});
$("order-cancel").addEventListener("click", () => orderDialog.close());
document.querySelector("[data-order-close]").addEventListener("click", () => orderDialog.close());
orderDialog.addEventListener("click", (event) => {
  if (event.target === orderDialog) orderDialog.close();
});

/* R2 临时不可达时自动回退到同域 480p 极速版，保证作品始终能打开。
   只在「非高清、当前源是 R2、本次打开尚未回退过」时触发一次。 */
player.addEventListener("error", () => {
  const p = projects[currentVideoIndex];
  if (!p || usingHD || player.dataset.fallback === "1") return;
  if (!player.currentSrc || !player.currentSrc.includes("r2.dev")) return;
  player.dataset.fallback = "1";
  player.src = p.video;
  player.load();
  player.play().catch(() => {});
});
