// 作品展示站主逻辑
// 数据来源：data/works.json（视频 + 名称 + 简介）
// 奇数卡片视频在左，偶数卡片视频在右（左右交替）
// 卡片进入视口时：内容向视频方向滑入浮现，视频自动播放；离开视口时暂停

const WORKS_JSON_PATH = "data/works.json";

async function loadWorks() {
  try {
    const res = await fetch(WORKS_JSON_PATH);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let works;
    try {
      works = await res.json();
    } catch (parseErr) {
      // JSON 语法错误（如字符串里直接回车换行）——页面上给出提示而不是空白
      showDataError(
        "works.json 解析失败：" + parseErr.message +
        "<br>常见原因：字符串里直接按了回车。请在 JSON 里用 \\n 表示换行，浏览器会自动显示为换行。"
      );
      return;
    }
    renderWorks(works);
  } catch (err) {
    // 本地 file:// 协议下 fetch 可能被浏览器拦截，属预期行为
    console.info("[Works] 未加载作品数据（本地直开或暂无数据）：", err.message);
  }
}

// 数据出错时的页面提示（替代整页空白）
function showDataError(msg) {
  const list = document.getElementById("worksGrid");
  if (!list) return;
  list.innerHTML = `<div class="data-error">${msg}</div>`;
}

// HTML 转义：防止简介里的 < > & " 破坏页面结构
function escapeHTML(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 文本转安全 HTML：
//  - \n               → 换行显示
//  - <B>文字</B>      → 文字加粗显示（大小写均可，如 <b>…</b>）
//    标记解析在转义之前做，内容本身仍会转义（标记内写 < > 也安全）
//    未配对的 <b> 会被当普通文字原样显示，不会静默吞掉
function textToHTML(str) {
  // 1. 先提取加粗标记，换成占位符（\x00 正常文本中不会出现）
  const boldParts = [];
  const marked = String(str ?? "").replace(
    /<([bB])>([\s\S]*?)<\/\1>/g,
    (_, tag, inner) => {
      boldParts.push(`<strong>${escapeHTML(inner)}</strong>`);
      return `\x00${boldParts.length - 1}\x00`;
    }
  );

  // 2. 转义剩余文本，再把占位符换回加粗片段
  return escapeHTML(marked)
    .replace(/\x00(\d+)\x00/g, (_, i) => boldParts[+i])
    .replace(/\n/g, "<br>");
}

function renderWorks(works) {
  const list = document.getElementById("worksGrid");
  if (!list || !Array.isArray(works)) return;

  list.innerHTML = works
    .map((w, i) => {
      const reverse = i % 2 === 1 ? " reverse" : ""; // 第 2、4…张左右交换
      return `
      <article class="work-card${reverse}">
        <div class="work-video">
          <video src="${escapeHTML(w.video)}" controls muted loop playsinline preload="metadata"></video>
        </div>
        <div class="work-info">
          <h3>${escapeHTML(w.name)}</h3>
          <p>${textToHTML(w.description)}</p>
        </div>
      </article>`;
    })
    .join("");

  setupReveal(list.querySelectorAll(".work-card"));
}

// 进入视口：加 in-view 触发滑入动画 + 视频自动播放
// 离开视口（即将消失）：移除 in-view，过渡自动反向播放退场动画，并暂停视频
function setupReveal(cards) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target.querySelector("video");
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          video?.play().catch(() => {}); // 静音自动播放被拒绝时静默降级
        } else {
          entry.target.classList.remove("in-view"); // 退场动画（登场的逆过程）
          video?.pause();
        }
      });
    },
    { threshold: 0.4 } // 卡片露出 40% 触发登场；缩到 40% 以下开始退场
  );

  cards.forEach((card) => observer.observe(card));
}

document.addEventListener("DOMContentLoaded", loadWorks);
