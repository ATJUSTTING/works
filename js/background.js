/* ============================================================
 * 动态星空背景（独立模块，与项目其他代码零耦合）
 * ------------------------------------------------------------
 * 接入方式：index.html 引入本文件即可，移除时删掉 script 标签。
 * 不依赖任何外部库 / DOM 结构 / CSS 变量。
 *
 * 效果：
 *  - 多层深度的星星（视差：近大亮快，远小暗慢）→ 空间感
 *  - 星空铺满整个文档高度，跟随页面滚动
 *  - 星星缓慢漂移 + 呼吸式闪烁
 *  - 鼠标交互：视差跟随（各层不同幅度）+ 光标附近星星被轻推
 * ============================================================ */
(() => {
  "use strict";

  // ---------- 可调参数 ----------
  const CFG = {
    starDensity: 0.4,   // 星星密度（颗 / 千像素视口高度，按文档总高缩放）
    maxStars: 900,       // 星星数上限（防超长页面爆量）
    depthMin: 0.15,      // 最远层（视差幅度/尺寸/速度的系数）
    depthMax: 1,         // 最近层
    drift: { x: -0.2, y: 0.02 }, // 全局漂移速度（单位：px/帧@depth=1）
    parallax: 34,        // 鼠标视差最大偏移（px，depth=1 层）
    repelRadius: 100,    // 光标推开的半径
    repelForce: 0.9,     // 推开力度
    twinkle: 0.5,        // 闪烁幅度
    hueVariety: true,    // 星星带一点冷暖色差
  };
  // ------------------------------

  // 尊重系统"减少动效"偏好：只画一帧静态星空
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 创建独立画布：铺满整个文档高度、随页面滚动、置于最底层、不拦截鼠标事件
  const canvas = document.createElement("canvas");
  canvas.id = "bg-starfield";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    zIndex: "-1",
    pointerEvents: "none",
    display: "block",
  });
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  let W = 0;            // 视口宽
  let docH = 0;         // 文档总高（星空覆盖范围）
  let dpr = 1;

  // ---------- 星星 ----------
  const stars = [];

  function makeStar() {
    const depth = CFG.depthMin + Math.random() * (CFG.depthMax - CFG.depthMin);
    let r, g, b;
    if (CFG.hueVariety && Math.random() < 0.3) {
      // 三成星星带一点冷蓝或暖橙色，其余纯白
      const warm = Math.random() < 0.4;
      r = warm ? 255 : 170 + (Math.random() * 40 | 0);
      g = warm ? 200 + (Math.random() * 30 | 0) : 200 + (Math.random() * 40 | 0);
      b = warm ? 150 + (Math.random() * 40 | 0) : 255;
    } else {
      r = g = b = 235 + (Math.random() * 20 | 0);
    }
    return {
      x: Math.random() * W,
      y: Math.random() * docH,
      depth,
      size: depth * (0.8 + Math.random() * 1.6),
      baseAlpha: 0.35 + depth * 0.55,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.4 + Math.random() * 1.2,
      color: `${r},${g},${b}`,
      vx: 0,
      vy: 0,
    };
  }

  function targetStarCount() {
    const byDensity = Math.round((docH / 1000) * CFG.starDensity * 1000);
    return Math.max(60, Math.min(CFG.maxStars, byDensity));
  }

  function syncStars() {
    const want = targetStarCount();
    while (stars.length < want) stars.push(makeStar());
    if (stars.length > want) stars.length = want;
  }

  // ---------- 尺寸同步（画布高度 = 文档总高，内容变化时自动跟随） ----------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    docH = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      window.innerHeight
    );
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(docH * dpr);
    canvas.style.height = docH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    syncStars();
  }

  // ---------- 鼠标状态（含平滑插值，坐标统一用页面坐标系） ----------
  const mouse = {
    px: 0, py: 0,        // 页面坐标系位置（用于推开星星）
    vx: 0, vy: 0,        // 视口坐标系位置（用于视差）
    sx: 0, sy: 0,        // 平滑后视口位置
    active: false,       // 指针是否在页面上
  };

  window.addEventListener("pointermove", (e) => {
    mouse.vx = e.clientX;
    mouse.vy = e.clientY;
    mouse.px = e.clientX + window.scrollX;
    mouse.py = e.clientY + window.scrollY;
    mouse.active = true;
  });
  window.addEventListener("pointerleave", () => { mouse.active = false; });

  // ---------- 绘制 ----------
  function drawFrame(t) {
    // 平滑追踪鼠标（视口坐标系），让视差移动有惯性感
    mouse.sx += (mouse.vx - mouse.sx) * 0.06;
    mouse.sy += (mouse.vy - mouse.sy) * 0.06;

    // 视差原点：视口中心 → 鼠标方向的偏移量（-1 ~ 1）
    const nx = mouse.active ? (mouse.sx / W - 0.5) * 2 : 0;
    const ny = mouse.active ? (mouse.sy / window.innerHeight - 0.5) * 2 : 0;

    ctx.clearRect(0, 0, W, docH);

    for (const s of stars) {
      // 漂移（速度与深度成正比）
      s.x += CFG.drift.x * s.depth;
      s.y += CFG.drift.y * s.depth;

      // 光标推开（页面坐标系，滚动后依然精准）
      if (mouse.active) {
        const dx = s.x - mouse.px;
        const dy = s.y - mouse.py;
        const dist = Math.hypot(dx, dy);
        if (dist < CFG.repelRadius && dist > 0.01) {
          const f = (1 - dist / CFG.repelRadius) * CFG.repelForce;
          s.vx += (dx / dist) * f;
          s.vy += (dy / dist) * f;
        }
      }
      // 回弹（弹簧感）
      s.vx *= 0.9;
      s.vy *= 0.9;
      s.x += s.vx;
      s.y += s.vy;

      // 环绕：飘出文档边界从另一侧回来
      if (s.x < -4) s.x += W + 8;
      else if (s.x > W + 4) s.x -= W + 8;
      if (s.y < -4) s.y += docH + 8;
      else if (s.y > docH + 4) s.y -= docH + 8;

      // 闪烁
      const tw = 1 + Math.sin(t * 0.001 * s.twinkleSpeed + s.twinklePhase) * CFG.twinkle * 0.5;
      const alpha = Math.max(0, Math.min(1, s.baseAlpha * tw));

      // 视差偏移（近层动得多）+ 绘制
      const px = s.x - nx * CFG.parallax * s.depth;
      const py = s.y - ny * CFG.parallax * s.depth;

      ctx.beginPath();
      ctx.arc(px, py, s.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${s.color},${alpha})`;
      ctx.fill();

      // 近处的大星星加一圈柔和光晕
      if (s.depth > 0.75 && s.size > 1.6) {
        ctx.beginPath();
        ctx.arc(px, py, s.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.color},${alpha * 0.08})`;
        ctx.fill();
      }
    }
  }

  // ---------- 启动 ----------
  let rafId = null;

  function startLoop() {
    if (rafId !== null) return;
    const loop = (t) => {
      drawFrame(t);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function boot() {
    resize();

    if (reduceMotion) {
      drawFrame(0); // 静态一帧
      return;
    }
    startLoop();
  }

  window.addEventListener("resize", () => {
    resize();
    if (reduceMotion) drawFrame(0);
  });

  // 内容增删导致文档高度变化时（如作品卡片异步渲染），自动扩展星空
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => {
      const prevH = docH;
      resize();
      if (docH !== prevH && reduceMotion) drawFrame(0);
    }).observe(document.documentElement);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
