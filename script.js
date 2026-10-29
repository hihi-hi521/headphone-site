(() => {
  "use strict";

  // Hold frames are zero-based and visually matched to the submitted film.
  // Larger transitionScale values make chapter playback slower.
  const CONFIG = Object.freeze({
    frames: 362,
    fps: 24,
    transitionScale: 1,
    wheelIdle: 350,
    preloadWorkers: 6,
    imagePattern: "assets/frames/frame_",
    stations: Object.freeze([
      Object.freeze({ id: "arrival", name: "初见", hold: 63, material: "石墨黑 / 琥珀光", detail: "OVER-EAR WIRELESS HEADPHONES" }),
      Object.freeze({ id: "silence", name: "静界", hold: 168, material: "细腻触感 / 精密细节", detail: "A QUIETER STATE OF MIND" }),
      Object.freeze({ id: "resonance", name: "共振", hold: 240, material: "声场展开 / 置身其中", detail: "SOUND IN EVERY DIMENSION" }),
      Object.freeze({ id: "essence", name: "纯粹", hold: 358, material: "ARC ONE / 归于纯粹", detail: "DESIGNED FOR YOUR EVERYDAY" }),
    ]),
  });

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const body = document.body;
  const canvas = $("#sequence-canvas");
  const context = canvas.getContext("2d", { alpha: false });
  const poster = $("#stage-poster");
  const preloader = $("#preloader");
  const narrative = $("#narrative");
  const nextButton = $("#next-chapter");
  const previousButton = $("#previous-chapter");
  const replayButton = $("#replay");
  const soundButton = $("#sound-toggle");
  const audio = $("#sequence-audio");
  const filmDialog = $("#film-dialog");
  const film = $("#full-film");
  const filmButton = $("#film-open");
  const detailsDialog = $("#details-dialog");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const images = new Array(CONFIG.frames);
  const dimensions = { width: 0, height: 0, ratio: 1 };
  const state = {
    phase: "loading",
    station: 0,
    frame: CONFIG.stations[0].hold,
    sound: false,
    loaded: 0,
    staticMode: false,
    generation: 0,
    direction: 1,
    audioBlocked: false,
  };
  let wheelLocked = false;
  let wheelTimer = 0;
  let wheelDelta = 0;
  let touchStart = null;
  let animationId = 0;
  let lastFocus = null;
  let loadGeneration = 0;
  let loadTimeout = 0;
  let initialIntroFinished = false;

  window.ARCExperience = Object.freeze({
    get state() {
      return Object.freeze({
        phase: state.phase,
        station: state.station,
        frame: state.frame,
        sound: state.sound,
        loaded: state.loaded,
        staticMode: state.staticMode,
      });
    },
    config: CONFIG,
  });

  if (window.lucide) {
    window.lucide.createIcons({ attrs: { "stroke-width": 1.5, "aria-hidden": "true" } });
  }

  function imageURL(index) {
    return `${CONFIG.imagePattern}${String(index + 1).padStart(4, "0")}.jpg`;
  }

  function isModalOpen() {
    return filmDialog.open || detailsDialog.open;
  }

  function setPhase(phase) {
    state.phase = phase;
    body.dataset.state = phase;
    const disabled = phase !== "idle";
    previousButton.disabled = disabled || state.station === 0;
    nextButton.disabled = disabled || state.station === CONFIG.stations.length - 1;
    replayButton.disabled = disabled;
    filmButton.disabled = phase === "loading" || phase === "error";
    $$("[data-station-nav], [data-go-next], #details-open").forEach((button) => {
      if (button instanceof HTMLButtonElement) button.disabled = disabled;
      button.setAttribute("aria-disabled", String(disabled));
    });
  }

  function resize() {
    dimensions.width = window.innerWidth;
    dimensions.height = window.innerHeight;
    dimensions.ratio = Math.min(window.devicePixelRatio || 1, dimensions.width < 768 ? 1.5 : 2);
    canvas.width = Math.round(dimensions.width * dimensions.ratio);
    canvas.height = Math.round(dimensions.height * dimensions.ratio);
    context.setTransform(dimensions.ratio, 0, 0, dimensions.ratio, 0, 0);
    draw(state.frame);
  }

  function draw(index) {
    const frame = Math.max(0, Math.min(CONFIG.frames - 1, Math.round(index)));
    const image = images[frame];
    state.frame = frame;
    if (!image || !image.complete || !image.naturalWidth) return;
    const { width, height } = dimensions;
    context.fillStyle = "#0b0b0b";
    context.fillRect(0, 0, width, height);

    let drawWidth;
    let drawHeight;
    let x;
    let y;
    if (width <= 1024 && height > width) {
      // Keep the complete subject between copy and navigation on portrait screens.
      const tablet = width > 760;
      const top = tablet ? Math.max(368, height * 0.36) : height < 740 ? 230 : 292;
      const availableHeight = Math.max(150, height - top - (tablet ? 155 : 134));
      const scale = Math.min((width * 1.52) / image.naturalWidth, availableHeight / image.naturalHeight);
      drawWidth = image.naturalWidth * scale;
      drawHeight = image.naturalHeight * scale;
      x = width * 0.5 - drawWidth * 0.55;
      y = top + (availableHeight - drawHeight) * 0.5;
      body.style.setProperty("--visual-top", `${y}px`);
      body.style.setProperty("--visual-bottom", `${y + drawHeight}px`);
    } else {
      const compact = height < 520;
      const usableHeight = height * (compact ? 0.88 : 0.91);
      const scale = Math.max((width * 0.94) / image.naturalWidth, usableHeight / image.naturalHeight);
      drawWidth = image.naturalWidth * scale;
      drawHeight = image.naturalHeight * scale;
      x = width * 0.72 - drawWidth * 0.55;
      y = (height - drawHeight) * 0.47 - (compact ? 0 : 15);
    }
    context.drawImage(image, x, y, drawWidth, drawHeight);
    canvas.classList.add("is-ready");
    poster.classList.add("is-hidden");
    $("#scene-time").textContent = `00:${String(Math.round(frame / CONFIG.fps)).padStart(2, "0")}`;
    updateTimeline(frame);
  }

  function updateTimeline(frame) {
    $$(".timeline-item").forEach((item, index) => {
      const start = index === 0 ? 0 : CONFIG.stations[index - 1].hold;
      const end = CONFIG.stations[index].hold;
      const progress = Math.max(0, Math.min(1, (frame - start) / (end - start)));
      item.style.setProperty("--chapter-progress", progress);
    });
  }

  function settle(index) {
    state.station = index;
    body.dataset.station = String(index);
    const station = CONFIG.stations[index];
    $$(".chapter-copy").forEach((copy, copyIndex) => {
      copy.hidden = copyIndex !== index;
      copy.classList.toggle("is-active", copyIndex === index);
    });
    $$("[data-station-nav]").forEach((button) => {
      const target = Number(button.dataset.target);
      button.classList.toggle("is-current", target === index);
      button.classList.toggle("is-complete", target < index);
      if (target === index) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    $("#chapter-side-number").textContent = String(index + 1).padStart(2, "0");
    $("#chapter-status").textContent = station.name;
    $("#material-caption").textContent = station.material;
    $("#technical-caption").textContent = station.detail;
    $("#experience-announcement").textContent = `第 ${index + 1} 章，共四章：${station.name}`;
    narrative.classList.remove("is-transitioning");
    audio.pause();
    audio.volume = 0.55;
    setPhase("idle");
    try {
      history.replaceState(null, "", `#${station.id}`);
    } catch {
      // Sandboxed file viewers may restrict history; navigation still works.
    }
  }

  function playAudioAt(frame) {
    if (!state.sound || state.direction < 0 || state.staticMode || isModalOpen() || document.hidden) return;
    try {
      audio.currentTime = frame / CONFIG.fps;
      audio.volume = 0.55;
      audio.playbackRate = 1 / CONFIG.transitionScale;
      audio.play().then(() => {
        state.audioBlocked = false;
      }).catch(() => {
        state.audioBlocked = true;
      });
    } catch {
      state.audioBlocked = true;
    }
  }

  function animateFrames(from, to, duration, token) {
    return new Promise((resolve) => {
      if (reduceMotion.matches || state.staticMode || from === to) {
        draw(to);
        resolve(token === state.generation);
        return;
      }
      let elapsed = 0;
      let previousTime = 0;
      let lastFrame = -1;
      const tick = (now) => {
        if (token !== state.generation) {
          resolve(false);
          return;
        }
        const delta = previousTime ? Math.min(now - previousTime, 100) : 0;
        previousTime = now;
        if (document.hidden || isModalOpen()) {
          animationId = requestAnimationFrame(tick);
          return;
        }
        elapsed += delta;
        const progress = Math.min(elapsed / duration, 1);
        const frame = Math.round(from + (to - from) * progress);
        if (frame !== lastFrame) {
          draw(frame);
          lastFrame = frame;
        }
        if (!audio.paused) audio.volume = 0.55 * Math.min(1, progress * 14, (1 - progress) * 14);
        if (progress < 1) animationId = requestAnimationFrame(tick);
        else {
          draw(to);
          audio.pause();
          resolve(true);
        }
      };
      animationId = requestAnimationFrame(tick);
    });
  }

  async function goTo(target) {
    target = Math.max(0, Math.min(CONFIG.stations.length - 1, Number(target)));
    if (state.phase !== "idle" || isModalOpen() || target === state.station || !Number.isInteger(target)) return;
    const token = ++state.generation;
    const direction = Math.sign(target - state.station);
    state.direction = direction;
    setPhase("playing");
    narrative.classList.add("is-transitioning");

    while (state.station !== target && token === state.generation) {
      const next = state.station + direction;
      const from = state.frame;
      const to = CONFIG.stations[next].hold;
      const duration = Math.abs(to - from) / CONFIG.fps * 1000 * CONFIG.transitionScale;
      playAudioAt(from);
      const completed = await animateFrames(from, to, duration, token);
      if (!completed) return;
      state.station = next;
    }
    settle(target);
  }

  async function replay() {
    if (state.phase !== "idle" || isModalOpen()) return;
    const token = ++state.generation;
    state.direction = 1;
    state.station = 0;
    setPhase("playing");
    narrative.classList.add("is-transitioning");
    draw(0);
    playAudioAt(0);
    const completed = await animateFrames(0, CONFIG.stations[0].hold, CONFIG.stations[0].hold / CONFIG.fps * 1000, token);
    if (completed) settle(0);
  }

  function showExperience() {
    clearTimeout(loadTimeout);
    body.classList.add("is-ready");
    preloader.classList.add("is-dismissed");
    preloader.setAttribute("aria-hidden", "true");
    preloader.inert = true;
  }

  function loadImage(index, token) {
    return new Promise((resolve, reject) => {
      if (images[index]?.complete && images[index].naturalWidth) {
        resolve(images[index]);
        return;
      }
      const image = new Image();
      image.decoding = "async";
      const timeout = setTimeout(() => {
        image.onload = null;
        image.onerror = null;
        reject(new Error(`Frame ${index + 1} timed out`));
      }, 20000);
      image.onload = () => {
        clearTimeout(timeout);
        if (token !== loadGeneration) {
          resolve(null);
          return;
        }
        // Keep encoded Image resources; the browser can reclaim decoded pixels.
        // Avoid retaining 362 full-resolution ImageBitmaps on mobile.
        images[index] = image;
        resolve(image);
      };
      image.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`Frame ${index + 1} unavailable`));
      };
      image.src = imageURL(index);
    });
  }

  function showLoadError() {
    if (initialIntroFinished || state.staticMode) return;
    setPhase("error");
    $("#load-message").textContent = "部分影像暂未就绪";
    $("#load-recovery").hidden = false;
  }

  async function loadSequence() {
    const token = ++loadGeneration;
    state.loaded = 0;
    state.staticMode = false;
    setPhase("loading");
    $("#load-recovery").hidden = true;
    $("#load-message").textContent = "影像准备中";
    preloader.classList.remove("is-dismissed");
    preloader.inert = false;
    preloader.removeAttribute("aria-hidden");
    clearTimeout(loadTimeout);
    loadTimeout = setTimeout(showLoadError, 25000);
    let cursor = 0;
    let failed = false;
    async function worker() {
      while (cursor < CONFIG.frames && token === loadGeneration && !failed) {
        const index = cursor++;
        await loadImage(index, token);
        if (token !== loadGeneration) return;
        state.loaded += 1;
        const percent = Math.round(state.loaded / CONFIG.frames * 100);
        $("#load-percent").textContent = String(percent);
        $("#load-bar").style.transform = `scaleX(${percent / 100})`;
      }
    }
    try {
      await Promise.all(Array.from({ length: CONFIG.preloadWorkers }, worker));
      if (token !== loadGeneration) return;
      clearTimeout(loadTimeout);
      showExperience();
      const hashIndex = CONFIG.stations.findIndex((station) => `#${station.id}` === location.hash);
      if (hashIndex > 0 || reduceMotion.matches) {
        const index = hashIndex > 0 ? hashIndex : 0;
        draw(CONFIG.stations[index].hold);
        settle(index);
      } else {
        state.direction = 1;
        state.station = 0;
        setPhase("playing");
        const introToken = ++state.generation;
        draw(0);
        await animateFrames(0, CONFIG.stations[0].hold, CONFIG.stations[0].hold / CONFIG.fps * 1000, introToken);
        settle(0);
      }
      initialIntroFinished = true;
    } catch {
      failed = true;
      if (token === loadGeneration) showLoadError();
    }
  }

  async function useStaticMode() {
    ++loadGeneration;
    ++state.generation;
    clearTimeout(loadTimeout);
    state.staticMode = true;
    audio.pause();
    const token = loadGeneration;
    const holdResults = await Promise.allSettled(CONFIG.stations.map((station) => loadImage(station.hold, token)));
    if (holdResults.every((result) => result.status === "rejected")) {
      $("#load-message").textContent = "未找到素材，请完整解压后打开网页";
      return;
    }
    showExperience();
    draw(CONFIG.stations[0].hold);
    settle(0);
    initialIntroFinished = true;
  }

  function openDialog(dialog) {
    if (state.phase === "loading" || state.phase === "error" || isModalOpen()) return false;
    lastFocus = document.activeElement;
    audio.pause();
    dialog.showModal();
    body.classList.add("has-dialog");
    return true;
  }

  function afterDialogClose() {
    body.classList.remove("has-dialog");
    if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
    if (state.phase === "playing") playAudioAt(state.frame);
  }

  function openFilm() {
    if (!openDialog(filmDialog)) return;
    film.muted = !state.sound;
    film.currentTime = 0;
    film.play().catch(() => {
      // Native video controls remain usable if autoplay is restricted.
    });
  }

  $$("[data-station-nav]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      goTo(button.dataset.target);
    });
  });
  $$("[data-go-next]").forEach((button) => button.addEventListener("click", () => goTo(state.station + 1)));
  nextButton.addEventListener("click", () => goTo(state.station + 1));
  previousButton.addEventListener("click", () => goTo(state.station - 1));
  replayButton.addEventListener("click", replay);
  $("#load-retry").addEventListener("click", loadSequence);
  $("#load-static").addEventListener("click", useStaticMode);
  $("#film-open").addEventListener("click", openFilm);
  $("#film-close").addEventListener("click", () => filmDialog.close());
  $("#details-open").addEventListener("click", () => openDialog(detailsDialog));
  $("#details-close").addEventListener("click", () => detailsDialog.close());
  $("#details-replay").addEventListener("click", () => {
    detailsDialog.close();
    replay();
  });
  filmDialog.addEventListener("close", () => {
    film.pause();
    afterDialogClose();
  });
  detailsDialog.addEventListener("close", afterDialogClose);
  [filmDialog, detailsDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  });
  soundButton.addEventListener("click", () => {
    state.sound = !state.sound;
    soundButton.setAttribute("aria-pressed", String(state.sound));
    soundButton.setAttribute("aria-label", state.sound ? "关闭声音" : "开启声音");
    soundButton.title = state.sound ? "关闭声音" : "开启声音";
    body.classList.toggle("is-sound-on", state.sound);
    film.muted = !state.sound;
    if (!state.sound) audio.pause();
    else if (state.phase === "playing") playAudioAt(state.frame);
  });

  function keepWheelLocked() {
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      wheelLocked = false;
      wheelDelta = 0;
    }, CONFIG.wheelIdle);
  }

  window.addEventListener("wheel", (event) => {
    if (isModalOpen() || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    event.preventDefault();
    if (wheelLocked || state.phase !== "idle") {
      wheelLocked = true;
      keepWheelLocked();
      return;
    }
    wheelDelta += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? dimensions.height : 1);
    keepWheelLocked();
    if (Math.abs(wheelDelta) < 30) return;
    wheelLocked = true;
    goTo(state.station + Math.sign(wheelDelta));
  }, { passive: false });

  window.addEventListener("keydown", (event) => {
    if (isModalOpen() || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest("input, textarea, select, [contenteditable='true']")) return;
    if (["Enter", " "].includes(event.key) && event.target.closest("button, a")) return;
    if (["ArrowDown", "PageDown", " ", "Enter"].includes(event.key)) {
      event.preventDefault();
      goTo(state.station + 1);
    } else if (["ArrowUp", "PageUp"].includes(event.key)) {
      event.preventDefault();
      goTo(state.station - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      goTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      goTo(CONFIG.stations.length - 1);
    }
  });

  window.addEventListener("touchstart", (event) => {
    touchStart = null;
    if (isModalOpen() || event.touches.length !== 1 || event.target.closest("button, a, dialog")) return;
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  window.addEventListener("touchmove", (event) => {
    if (!touchStart || isModalOpen() || event.touches.length !== 1) return;
    if (Math.abs(event.touches[0].clientY - touchStart.y) > 10) event.preventDefault();
  }, { passive: false });
  window.addEventListener("touchend", (event) => {
    if (!touchStart || !event.changedTouches.length || isModalOpen()) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx) * 1.2) goTo(state.station + (dy < 0 ? 1 : -1));
  }, { passive: true });
  window.addEventListener("touchcancel", () => { touchStart = null; }, { passive: true });
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) audio.pause();
    else if (state.phase === "playing") playAudioAt(state.frame);
  });
  window.addEventListener("pagehide", () => {
    audio.pause();
    film.pause();
  });
  window.addEventListener("hashchange", () => {
    const index = CONFIG.stations.findIndex((station) => `#${station.id}` === location.hash);
    if (index >= 0) goTo(index);
  });

  resize();
  setPhase("loading");
  loadSequence();
})();
