(function () {
  "use strict";

  const QUIZ_COUNT = 10;
  const SMALL_DIVISORS = [2, 3, 5, 7, 11, 13];
  const CARD_SYMBOLS = ["T", "J", "Q", "K"];
  const SYMBOL_TO_DIGITS = { T: "10", J: "11", Q: "12", K: "13" };
  const STORAGE_KEY = "nibaimaker-new-settings";
  const DEFAULT_SETTINGS = {
    tapFill: "left",
    showHints: true,
    faceMode: "face"
  };
  const RAW_FACTOR_PAIRS = [
    ["0", "0"], ["0", "1"],
    ["1", "2"], ["1", "3"],
    ["2", "4"], ["2", "5"],
    ["3", "6"], ["3", "7"],
    ["4", "8"], ["4", "9"],
    ["5", "0"], ["5", "1"],
    ["6", "2"], ["6", "3"],
    ["7", "4"], ["7", "5"],
    ["8", "6"], ["8", "7"],
    ["9", "8"], ["9", "9"],
    ["05", "T"], ["05", "J"],
    ["06", "Q"], ["06", "K"],
    ["55", "T"], ["55", "J"],
    ["56", "Q"], ["56", "K"],
    ["T", "20"], ["T", "21"],
    ["J", "22"], ["J", "23"],
    ["Q", "24"], ["Q", "25"],
    ["K", "26"], ["K", "27"],
    ["T5", "2T"], ["T5", "2J"],
    ["T6", "2Q"], ["T6", "2K"]
  ];

  const FACTOR_PAIRS = RAW_FACTOR_PAIRS.map(makeFactorPattern);

  const state = {
    quizList: [],
    currentQuiz: 0,
    startTime: 0,
    timerId: 0,
    cardSeq: 0,
    topDigits: 0,
    bottomDigits: 0,
    cards: new Map(),
    slots: new Map(),
    groups: new Map(),
    pointerDrag: null,
    pointerWasDrag: false,
    suppressClickUntil: 0,
    finished: false,
    started: false,
    settings: loadSettings()
  };

  const els = {
    equation: document.getElementById("equation"),
    topRow: document.getElementById("top-row"),
    bottomRow: document.getElementById("bottom-row"),
    pool: document.getElementById("pool"),
    progress: document.getElementById("progress"),
    timer: document.getElementById("timer"),
    feedback: document.getElementById("feedback"),
    history: document.getElementById("history-list"),
    flash: document.getElementById("judge-flash"),
    reset: document.getElementById("reset-board"),
    tweet: document.getElementById("tweet-link"),
    playfield: document.querySelector(".playfield"),
    factorLayer: null
  };

  function loadSettings() {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
    } catch (_) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  }

  function generatePrimes(limit) {
    const primes = [2];
    const isPrime = new Array(limit + 1).fill(true);
    isPrime[0] = false;
    isPrime[1] = false;

    for (let num = 3; num <= Math.sqrt(limit); num += 2) {
      if (!isPrime[num]) continue;
      primes.push(num);
      for (let multiple = num * num; multiple <= limit; multiple += num * 2) {
        isPrime[multiple] = false;
      }
    }

    const start = Math.max(3, Math.ceil(Math.sqrt(limit)));
    for (let num = start + (1 - start % 2); num <= limit; num += 2) {
      if (isPrime[num]) primes.push(num);
    }

    return primes;
  }

  function toCard(index) {
    if (index === 10) return "T";
    if (index === 11) return "J";
    if (index === 12) return "Q";
    if (index === 13) return "K";
    return String(index);
  }

  function parseCards(cards) {
    return cards.split("").filter(Boolean);
  }

  function cardSpan(label) {
    return CARD_SYMBOLS.includes(label) ? 2 : 1;
  }

  function cardDigits(label) {
    return SYMBOL_TO_DIGITS[label] || label;
  }

  function cardValue(label) {
    return CARD_SYMBOLS.includes(label) ? CARD_SYMBOLS.indexOf(label) + 10 : Number(label);
  }

  function displayLabel(label) {
    return state.settings.faceMode === "number" ? cardDigits(label) : label;
  }

  function sequenceDigitWidth(cards) {
    return parseCards(cards).reduce((sum, label) => sum + cardSpan(label), 0);
  }

  function cardsToDetails(cards) {
    const cardCount = new Array(14).fill(0);
    for (const card of cards) {
      const index = CARD_SYMBOLS.includes(card) ? CARD_SYMBOLS.indexOf(card) + 10 : Number(card);
      if (Number.isInteger(index) && index > 0) cardCount[index] += 1;
    }
    return cardCount;
  }

  function detailsToCards(cardCount) {
    let formatCards = "";
    for (let i = 1; i < cardCount.length; i += 1) {
      formatCards += toCard(i).repeat(cardCount[i]);
    }
    return formatCards;
  }

  function numToCards(i, s, tmp, results) {
    if (i === s.length) {
      results.push(tmp);
      return;
    }

    if (s[i] !== "0") {
      numToCards(i + 1, s, tmp + s[i], results);
    }

    if (i + 1 < s.length && s[i] === "1" && s[i + 1] >= "0" && s[i + 1] <= "3") {
      numToCards(i + 2, s, tmp + toCard(Number(`1${s[i + 1]}`)), results);
    }
  }

  function cardsToNum(cards) {
    return cards.replace(/[TJQK]/g, (card) => SYMBOL_TO_DIGITS[card]);
  }

  function generateQuizzes(goodsizePrimeList) {
    const quizzes = [];

    goodsizePrimeList.forEach((prime) => {
      const factorCards = [];
      const doubleCards = [];
      numToCards(0, String(prime), "", factorCards);
      numToCards(0, String(prime * 2), "", doubleCards);

      factorCards.forEach((factor) => {
        doubleCards.forEach((double) => {
          if (factor.length !== 5 || double.length !== 5) return;

          const factorDetail = cardsToDetails(factor);
          const doubleDetail = cardsToDetails(double);
          const quiz = factorDetail.map((count, i) => count + doubleDetail[i]);
          quizzes.push(quiz);
        });
      });
    });

    return quizzes;
  }

  function buildQuizList() {
    const primeList = generatePrimes(1000000);
    const goodsizePrimeList = primeList.filter((prime) => prime >= 10000);
    const rawQuizzes = generateQuizzes(goodsizePrimeList);
    const unique = new Set();
    const quizList = [];

    rawQuizzes.forEach((rawQuiz) => {
      const quiz = rawQuiz.slice();
      if (quiz[0] !== 0) return;
      quiz[2] += 1;
      if (!quiz.every((value) => value <= 4)) return;

      const fullCards = detailsToCards(quiz);
      const cards = removeFixedTwo(fullCards);
      if (cards.length !== 10) return;
      const totalDigits = sequenceDigitWidth(cards);

      const key = JSON.stringify(quiz);
      if (unique.has(key)) return;
      unique.add(key);
      quizList.push({
        details: quiz,
        cards,
        topDigits: Math.ceil(totalDigits / 2),
        bottomDigits: Math.floor(totalDigits / 2)
      });
    });

    return getRandomSubarray(quizList, QUIZ_COUNT);
  }

  function removeFixedTwo(cards) {
    const index = cards.indexOf("2");
    return index === -1 ? cards : cards.slice(0, index) + cards.slice(index + 1);
  }

  function getRandomSubarray(arr, size) {
    const shuffled = arr.slice();
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const index = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[index]] = [shuffled[index], shuffled[i]];
    }
    return shuffled.slice(0, size);
  }

  function checkAnswer(guess, quiz) {
    const factorDetail = cardsToDetails(guess);
    const factorNum = Number(cardsToNum(guess));
    const doubleCandidates = [];
    numToCards(0, String(factorNum * 2), "", doubleCandidates);

    for (const doubleCards of doubleCandidates) {
      if (sequenceDigitWidth(doubleCards) !== quiz.topDigits) continue;
      const doubleDetail = cardsToDetails(doubleCards);
      const allDetail = factorDetail.map((detail, i) => detail + doubleDetail[i]);
      allDetail[2] += 1;
      if (JSON.stringify(allDetail) !== JSON.stringify(quiz.details)) continue;

      for (const divisor of SMALL_DIVISORS) {
        if (factorNum % divisor === 0) {
          return { result: "divisible", factorNum, divisor };
        }
      }

      return { result: "correct", factorNum };
    }

    return { result: "incorrect", factorNum };
  }

  function makeFactorPattern(pair) {
    const bottomTokens = makeAlignedTokens(pair[0]);
    const topTokens = makeAlignedTokens(pair[1]);
    const width = Math.max(bottomTokens.width, topTokens.width);
    const bottomDigits = expandSymbols(pair[0]);
    const topDigits = expandSymbols(pair[1]);
    const lowerValue = Number(bottomDigits);
    const topValue = Number(topDigits);
    const noCarry = lowerValue * 2;
    const withCarry = noCarry + 1;
    const carryIn = String(withCarry).endsWith(String(topValue)) && !String(noCarry).endsWith(String(topValue));
    const carryOut = (carryIn ? withCarry : noCarry) >= 10 ** bottomDigits.length;

    return {
      width,
      bottom: bottomTokens.tokens.map((token) => ({ ...token, start: token.start + width - bottomTokens.width })),
      top: topTokens.tokens.map((token) => ({ ...token, start: token.start + width - topTokens.width })),
      carryIn,
      carryOut
    };
  }

  function makeAlignedTokens(value) {
    let start = 0;
    const tokens = parseCards(value).map((label) => {
      const span = cardSpan(label);
      const token = { label, span, start };
      start += span;
      return token;
    });
    return { width: start, tokens };
  }

  function expandSymbols(value) {
    return value.replace(/[TJQK]/g, (symbol) => SYMBOL_TO_DIGITS[symbol]);
  }

  function initSlots(topDigits, bottomDigits) {
    els.topRow.innerHTML = "";
    els.bottomRow.innerHTML = "";
    state.slots.clear();
    els.equation.style.setProperty("--top-digits", String(topDigits));
    els.equation.style.setProperty("--bottom-digits", String(bottomDigits));
    ensureFactorLayer();
    els.factorLayer.innerHTML = "";

    for (let i = 0; i < topDigits; i += 1) {
      els.topRow.appendChild(makeSlot("top", i));
    }

    for (let i = 0; i < bottomDigits; i += 1) {
      els.bottomRow.appendChild(makeSlot("bottom", i));
    }
  }

  function makeSlot(row, index) {
    const slot = document.createElement("div");
    const key = slotKey(row, index);
    slot.className = "slot";
    slot.dataset.row = row;
    slot.dataset.index = String(index);
    slot.dataset.col = String(row === "top" ? state.topDigits - index : state.bottomDigits - index);
    state.slots.set(key, null);
    return slot;
  }

  function ensureFactorLayer() {
    if (els.factorLayer) return;
    els.factorLayer = document.createElement("div");
    els.factorLayer.className = "factor-layer";
    els.equation.appendChild(els.factorLayer);
  }

  function makeCard(label) {
    const id = `card-${state.cardSeq}`;
    const span = cardSpan(label);
    state.cardSeq += 1;

    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    card.draggable = false;
    card.dataset.cardId = id;
    card.dataset.label = label;
    card.dataset.span = String(span);
    card.style.setProperty("--span", String(span));
    card.setAttribute("aria-label", `${displayLabel(label)} のカード`);
    card.addEventListener("pointerdown", onPointerDown);
    card.addEventListener("click", onCardClick);

    state.cards.set(id, {
      id,
      label,
      span,
      element: card,
      location: { type: "pool" },
      groupId: null
    });

    renderCardFace(state.cards.get(id));
    return card;
  }

  function renderCardFace(card) {
    const topHints = factorHintLabels(card.label, "bottom").map(displayLabel).join(" ");
    const bottomHints = factorHintLabels(card.label, "top").map(displayLabel).join(" ");
    const showTop = state.settings.showHints && card.location.row !== "top";
    const showBottom = state.settings.showHints && card.location.row !== "bottom";
    card.element.innerHTML = `
      <span class="card-hints card-hints-top"${showTop ? "" : " hidden"}>${topHints}</span>
      <span class="card-main">${displayLabel(card.label)}</span>
      <span class="card-hints card-hints-bottom"${showBottom ? "" : " hidden"}>${bottomHints}</span>
    `;
    card.element.setAttribute("aria-label", `${displayLabel(card.label)} のカード`);
  }

  function refreshCardFaces() {
    state.cards.forEach((card) => renderCardFace(card));
  }

  function factorHintLabels(label, asRow) {
    const labels = new Set();
    FACTOR_PAIRS.forEach((pattern) => {
      const bottom = pattern.bottom.length === 1 ? pattern.bottom[0].label : null;
      const top = pattern.top.length === 1 ? pattern.top[0].label : null;
      if (!bottom || !top) return;
      if (bottom === "0" || top === "0") return;
      if (asRow === "bottom" && bottom === label) labels.add(top);
      if (asRow === "top" && top === label) labels.add(bottom);
    });
    return [...labels].sort((a, b) => cardValue(a) - cardValue(b));
  }

  function renderQuiz() {
    const quiz = state.quizList[state.currentQuiz];
    state.topDigits = quiz.topDigits;
    state.bottomDigits = quiz.bottomDigits;
    initSlots(state.topDigits, state.bottomDigits);
    state.cards.clear();
    state.groups.clear();
    state.cardSeq = 0;
    state.slots.forEach((_, key) => state.slots.set(key, null));

    els.pool.innerHTML = "";
    cleanupDrag();
    document.querySelectorAll(".slot").forEach((slot) => {
      slot.innerHTML = "";
      slot.classList.remove("drag-over", "covered");
    });

    shuffleString(quiz.cards).forEach((label) => {
      els.pool.appendChild(makeCard(label));
    });
    sortPoolCards();

    els.progress.textContent = `${state.currentQuiz + 1} / ${state.quizList.length}`;
    els.feedback.textContent = `下段${state.bottomDigits}桁が埋まると自動で判定します。カードをタップすると左の空き枠へ入ります。`;
    detectFactors();
    scrollBoardRight();
  }

  function showStartScreen() {
    state.started = false;
    state.finished = false;
    initSlots(5, 5);
    els.playfield.classList.add("menu-open");
    els.equation.classList.add("is-waiting");
    els.pool.innerHTML = "";
    els.history.innerHTML = "";
    els.progress.textContent = `0 / ${QUIZ_COUNT}`;
    els.timer.textContent = "0.00s";
    els.feedback.textContent = "設定を選んでスタートしてください。";
    ensureStartPanel();
    scrollBoardRight();
  }

  function ensureStartPanel() {
    els.playfield.querySelector(".start-panel")?.remove();
    const panel = document.createElement("div");
    panel.className = "start-panel";
    panel.innerHTML = `
      <div class="start-panel-inner">
        <div class="setting-list">
          ${settingToggle("tapFill", "タップ配置", [
            ["left", "左から"],
            ["right", "右から"]
          ])}
          ${settingToggle("showHints", "因子候補", [
            ["off", "オフ"],
            ["on", "オン"]
          ])}
          ${settingToggle("faceMode", "絵札表示", [
            ["face", "TJQK"],
            ["number", "10-13"]
          ])}
        </div>
        <button class="start-button" type="button">スタート</button>
      </div>
    `;
    panel.addEventListener("click", onStartPanelClick);
    els.playfield.appendChild(panel);
  }

  function settingToggle(key, label, options) {
    return `
      <div class="setting-toggle" data-setting="${key}" role="group" aria-label="${label}">
        <span class="setting-label">${label}</span>
        <div class="switch-control">
          ${options.map(([value, text]) => {
            const checked = settingValue(key) === value ? " checked" : "";
            return `<label><input type="radio" name="${key}" value="${value}"${checked}><span>${text}</span></label>`;
          }).join("")}
        </div>
      </div>
    `;
  }

  function settingValue(key) {
    if (key === "showHints") return state.settings.showHints ? "on" : "off";
    return state.settings[key];
  }

  function onStartPanelClick(event) {
    const input = event.target.closest("input[type='radio']");
    if (input) {
      const key = input.name;
      state.settings[key] = key === "showHints" ? input.value === "on" : input.value;
      saveSettings();
      return;
    }

    if (event.target.closest(".start-button")) {
      startGame();
    }
  }

  function startGame() {
    els.playfield.querySelector(".start-panel")?.remove();
    els.playfield.classList.remove("menu-open");
    els.equation.classList.remove("is-waiting");
    state.currentQuiz = 0;
    state.finished = false;
    state.started = true;
    els.tweet.hidden = true;
    renderQuiz();
    startTimer();
  }

  function shuffleString(value) {
    return getRandomSubarray(value.split(""), value.length);
  }

  function onCardClick(event) {
    if (state.pointerWasDrag) {
      state.pointerWasDrag = false;
      return;
    }
    if (Date.now() < state.suppressClickUntil) return;
    const cardId = event.currentTarget.dataset.cardId;
    const card = state.cards.get(cardId);
    if (!card || state.finished) return;
    if (card.groupId) {
      returnToPool(cardId);
      return;
    }

    tapPlaceCard(card);
  }

  function onPointerDown(event) {
    if (event.button !== 0 || state.finished) return;
    const cardId = event.currentTarget.dataset.cardId;
    const card = state.cards.get(cardId);
    if (!card) return;

    state.pointerDrag = {
      cardId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      startedInPool: card.location.type === "pool"
    };
    card.element.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerCancel, { once: true });
    window.addEventListener("blur", onPointerCancel, { once: true });
  }

  function onPointerMove(event) {
    const drag = state.pointerDrag;
    if (!drag) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.active) {
      const distance = Math.hypot(dx, dy);
      if (drag.startedInPool && !isPointInBoard(event.clientX, event.clientY)) {
        if (distance < 34) return;
      } else if (distance < 8) {
        return;
      }
    }

    event.preventDefault();
    if (!drag.active) startPointerDrag(drag, event);

    moveDraggingCard(drag, event.clientX, event.clientY);
    highlightNearestDrop(drag.cardId, event.clientX, event.clientY);
  }

  function onPointerUp(event) {
    const drag = state.pointerDrag;
    if (!drag || !drag.active) {
      if (drag?.startedInPool) {
        const card = state.cards.get(drag.cardId);
        if (card && !card.groupId) {
          tapPlaceCard(card);
          state.pointerWasDrag = true;
        }
      }
      cleanupDrag({ restore: true });
      return;
    }

    const cardId = drag.cardId;
    const target = findNearestDrop(cardId, event.clientX, event.clientY);
    cleanupDrag({ restore: !target });
    state.pointerWasDrag = true;
    state.suppressClickUntil = Date.now() + 250;

    if (!target) return;
    if (target.type === "pool") {
      returnToPool(cardId);
      return;
    }
    placeCardOrGroup(cardId, target);
  }

  function onPointerCancel() {
    cleanupDrag({ restore: true });
  }

  function tapPlaceCard(card) {
    const emptyIndex = findTapBottomFit(card);
    if (emptyIndex === -1) return;
    placeSingleCard(card.id, { type: "slot", row: "bottom", index: emptyIndex });
  }

  function startPointerDrag(drag, event) {
    const card = state.cards.get(drag.cardId);
    if (card.groupId) {
      startGroupPointerDrag(drag, card, event);
      return;
    }

    const rect = card.element.getBoundingClientRect();
    drag.offsetX = event.clientX - rect.left;
    drag.offsetY = event.clientY - rect.top;
    drag.active = true;
    drag.kind = "card";
    card.element.style.width = `${rect.width}px`;
    card.element.style.height = `${rect.height}px`;
    card.element.classList.add("dragging-card");
    document.body.appendChild(card.element);
    moveDraggingCard(drag, event.clientX, event.clientY);
  }

  function moveDraggingCard(drag, x, y) {
    if (drag.kind === "group") {
      drag.bundle.style.left = `${x - drag.offsetX}px`;
      drag.bundle.style.top = `${y - drag.offsetY}px`;
      return;
    }

    const card = state.cards.get(drag.cardId);
    card.element.style.left = `${x - drag.offsetX}px`;
    card.element.style.top = `${y - drag.offsetY}px`;
  }

  function cleanupDrag({ restore = false } = {}) {
    window.removeEventListener("pointermove", onPointerMove);
    const drag = state.pointerDrag;
    if (drag) {
      const card = state.cards.get(drag.cardId);
      if (drag.kind === "group") {
        drag.hiddenCards?.forEach((hiddenCard) => {
          hiddenCard.element.style.visibility = "";
        });
        drag.hiddenOutline?.style.removeProperty("visibility");
        drag.bundle?.remove();
      } else if (card) {
        card.element.classList.remove("dragging-card");
        card.element.style.left = "";
        card.element.style.top = "";
        card.element.style.width = "";
        card.element.style.height = "";
        if (restore) restoreCardDom(card);
      }
    }
    state.pointerDrag = null;
    document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
    hideInsertionIndicator();
  }

  function startGroupPointerDrag(drag, card, event) {
    const group = state.groups.get(card.groupId);
    if (!group) return;
    const members = group.cardIds.map((id) => state.cards.get(id)).filter(Boolean);
    const outline = els.factorLayer.querySelector(`.factor-outline[data-group-id="${group.id}"]`);
    const rects = members.map((member) => member.element.getBoundingClientRect());
    if (outline) rects.push(outline.getBoundingClientRect());
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));

    drag.kind = "group";
    drag.active = true;
    drag.offsetX = event.clientX - left;
    drag.offsetY = event.clientY - top;
    drag.hiddenCards = members;
    drag.hiddenOutline = outline;
    drag.bundle = document.createElement("div");
    drag.bundle.className = "dragging-factor";
    drag.bundle.style.width = `${right - left}px`;
    drag.bundle.style.height = `${bottom - top}px`;

    if (outline) {
      const outlineRect = outline.getBoundingClientRect();
      const outlineClone = outline.cloneNode(true);
      outlineClone.classList.add("dragging-factor-outline");
      outlineClone.style.left = `${outlineRect.left - left}px`;
      outlineClone.style.top = `${outlineRect.top - top}px`;
      outlineClone.style.width = `${outlineRect.width}px`;
      outlineClone.style.height = `${outlineRect.height}px`;
      drag.bundle.appendChild(outlineClone);
      outline.style.visibility = "hidden";
    }

    members.forEach((member) => {
      const rect = member.element.getBoundingClientRect();
      const clone = member.element.cloneNode(true);
      clone.classList.add("dragging-factor-card");
      clone.style.left = `${rect.left - left}px`;
      clone.style.top = `${rect.top - top}px`;
      clone.style.width = `${rect.width}px`;
      clone.style.height = `${rect.height}px`;
      drag.bundle.appendChild(clone);
      member.element.style.visibility = "hidden";
    });

    document.body.appendChild(drag.bundle);
    moveDraggingCard(drag, event.clientX, event.clientY);
  }

  function restoreCardDom(card) {
    if (card.location.type === "pool") {
      els.pool.appendChild(card.element);
      return;
    }
    getSlotElement(card.location.row, card.location.index)?.appendChild(card.element);
  }

  function highlightNearestDrop(cardId, x, y) {
    document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
    hideInsertionIndicator();
    const target = findNearestDrop(cardId, x, y);
    if (!target) return;
    if (target.type === "pool") {
      els.pool.classList.add("drag-over");
      return;
    }
    if (target.insertion) {
      showInsertionIndicator(target.insertion);
      return;
    }
    const card = state.cards.get(cardId);
    if (card?.groupId && target.restoreOriginal) {
      const group = state.groups.get(card.groupId);
      if (!group) return;
      groupTargetCells(group, 0).forEach((cell) => {
        getSlotElement(cell.row, cell.index)?.classList.add("drag-over");
      });
      return;
    }
    getCoveredIndices(target.row, target.index, card.span).forEach((index) => {
      getSlotElement(target.row, index)?.classList.add("drag-over");
    });
  }

  function findNearestDrop(cardId, x, y) {
    const poolRect = els.pool.getBoundingClientRect();
    if (pointInRect(x, y, poolRect)) return { type: "pool" };

    const card = state.cards.get(cardId);
    if (!card) return null;

    if (card.groupId) {
      return findNearestGroupTarget(card, x, y);
    }

    return findNearestSingleTarget(card, x, y);
  }

  function findNearestSingleTarget(card, x, y) {
    const candidates = [];
    ["top", "bottom"].forEach((row) => {
      const limit = row === "top" ? state.topDigits : state.bottomDigits;
      for (let index = 0; index <= limit - card.span; index += 1) {
        if (!canPlaceCells(card.id, row, index, card.span)) continue;
        candidates.push({
          type: "slot",
          row,
          index,
          distance: distanceToSlotRun(row, index, card.span, x, y)
        });
      }
    });

    bottomInsertionCandidates(card, x, y).forEach((candidate) => candidates.push(candidate));

    return nearestCandidate(candidates);
  }

  function findNearestGroupTarget(card, x, y) {
    if (card.location.type !== "slot") return null;
    const group = state.groups.get(card.groupId);
    if (!group) return null;
    const row = card.location.row;
    const limit = row === "top" ? state.topDigits : state.bottomDigits;
    const candidates = [];

    for (let index = 0; index <= limit - card.span; index += 1) {
      const delta = index - card.location.index;
      if (delta !== 0 && !planGroupMove(group, delta)) continue;
      candidates.push({
        type: "slot",
        row,
        index,
        insertion: groupInsertionHint(group, delta),
        restoreOriginal: delta === 0,
        distance: distanceToSlotRun(row, index, card.span, x, y)
      });
    }

    return nearestCandidate(candidates);
  }

  function nearestCandidate(candidates) {
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0];
  }

  function distanceToSlotRun(row, index, span, x, y) {
    const first = getSlotElement(row, index).getBoundingClientRect();
    const last = getSlotElement(row, index + span - 1).getBoundingClientRect();
    const centerX = (first.left + last.right) / 2;
    const centerY = (first.top + first.bottom) / 2;
    return Math.hypot(centerX - x, centerY - y);
  }

  function pointInRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function isPointInBoard(x, y) {
    return pointInRect(x, y, els.playfield.getBoundingClientRect());
  }

  function placeCardOrGroup(cardId, target) {
    const card = state.cards.get(cardId);
    if (!card || state.finished) return;

    if (card.groupId) {
      moveGroup(card, target);
      return;
    }

    placeSingleCard(cardId, target);
  }

  function bottomInsertionCandidates(card, x, y) {
    if (card.location.type !== "slot" || card.location.row !== "bottom") return [];
    const candidates = [];

    for (let index = 0; index < state.bottomDigits; index += 1) {
      const occupantId = state.slots.get(slotKey("bottom", index));
      if (!occupantId || occupantId === card.id) continue;
      const occupant = state.cards.get(occupantId);
      if (!occupant || occupant.location.index !== index) continue;

      const plan = planSingleBottomInsertion(card, occupant);
      if (!plan) continue;
      candidates.push({
        type: "slot",
        row: "bottom",
        index: plan.cardIndex,
        singlePlan: plan.moves,
        movePlan: plan.movePlan,
        insertion: { boundary: plan.boundary + bottomOffset() },
        distance: distanceToSlotBoundary("bottom", plan.boundary, x, y)
      });
    }

    return candidates;
  }

  function planSingleBottomInsertion(card, targetCard) {
    if (card.id === targetCard.id) return null;
    if (card.groupId) return null;
    if (card.location.type !== "slot" || targetCard.location.type !== "slot") return null;
    if (card.location.row !== "bottom" || targetCard.location.row !== "bottom") return null;
    if (targetCard.groupId) return planSingleBottomIntoGroup(card, targetCard);

    const sourceStart = card.location.index;
    const targetStart = targetCard.location.index;
    const targetEnd = targetStart + targetCard.span;
    if (targetStart === sourceStart) return null;

    const moves = new Map();
    let cardIndex;
    let boundary;

    if (targetStart < sourceStart) {
      cardIndex = targetStart;
      boundary = targetStart;
      bottomStartCards().forEach((other) => {
        if (other.id === card.id) return;
        if (other.groupId) return;
        if (other.location.index >= targetStart && other.location.index < sourceStart) {
          moves.set(other.id, other.location.index + card.span);
        }
      });
    } else {
      cardIndex = targetEnd - card.span;
      boundary = targetEnd;
      bottomStartCards().forEach((other) => {
        if (other.id === card.id) return;
        if (other.groupId) return;
        if (other.location.index > sourceStart && other.location.index < targetEnd) {
          moves.set(other.id, other.location.index - card.span);
        }
      });
    }

    moves.set(card.id, cardIndex);
    if (!validateSingleBottomPlan(moves)) return null;
    return { moves, cardIndex, boundary };
  }

  function planSingleBottomIntoGroup(card, targetCard) {
    const group = state.groups.get(targetCard.groupId);
    if (!group || group.immovable) return null;

    const sourceStart = card.location.index;
    const bounds = groupBottomBounds(group);
    if (!Number.isFinite(bounds.min) || bounds.min <= sourceStart && sourceStart < bounds.max) return null;

    let cardIndex;
    let boundary;
    let groupDelta;

    if (bounds.min < sourceStart) {
      cardIndex = bounds.min;
      boundary = bounds.min;
      groupDelta = card.span;
    } else {
      cardIndex = bounds.max - card.span;
      boundary = bounds.max;
      groupDelta = -card.span;
    }

    const movePlan = {
      groups: new Map([[group.id, groupDelta]]),
      singles: new Map([[card.id, cardIndex]])
    };
    if (!validateGroupMovePlan(movePlan)) return null;
    return { movePlan, cardIndex, boundary };
  }

  function bottomStartCards() {
    return Array.from(state.cards.values())
      .filter((card) => card.location.type === "slot" && card.location.row === "bottom")
      .filter((card) => state.slots.get(slotKey("bottom", card.location.index)) === card.id)
      .sort((a, b) => a.location.index - b.location.index);
  }

  function validateSingleBottomPlan(plan) {
    const occupied = new Map();
    for (const card of bottomStartCards()) {
      const index = plan.has(card.id) ? plan.get(card.id) : card.location.index;
      if (card.groupId && plan.has(card.id)) return false;
      if (index < 0 || index + card.span > state.bottomDigits) return false;
      for (const coveredIndex of getCoveredIndices("bottom", index, card.span)) {
        if (occupied.has(coveredIndex)) return false;
        occupied.set(coveredIndex, card.id);
      }
    }
    return true;
  }

  function applySingleBottomPlan(plan) {
    const moves = [...plan.entries()].map(([cardId, index]) => ({
      card: state.cards.get(cardId),
      location: { type: "slot", row: "bottom", index }
    })).filter(({ card }) => Boolean(card));

    moves.filter(({ card }) => Boolean(card)).forEach(({ card }) => clearCardLocation(card));
    moves.forEach(({ card, location }) => {
      if (!card) return;
      occupyCells(card.id, location.row, location.index, card.span);
      card.location = location;
      getSlotElement(location.row, location.index).appendChild(card.element);
      renderCardFace(card);
    });
    sortPoolCards();
  }

  function normalizeMovePlan(plan) {
    if (plan?.groups && plan?.singles) return plan;
    return { groups: plan || new Map(), singles: new Map() };
  }

  function isPlannedOccupant(occupant, plan) {
    if (!occupant) return false;
    if (occupant.groupId) return plan.groups.has(occupant.groupId);
    return plan.singles.has(occupant.id);
  }

  function distanceToSlotBoundary(row, boundary, x, y) {
    const limit = row === "top" ? state.topDigits : state.bottomDigits;
    const clamped = Math.max(0, Math.min(boundary, limit));
    let edgeX;

    if (clamped <= 0) {
      edgeX = getSlotElement(row, 0).getBoundingClientRect().left;
    } else if (clamped >= limit) {
      edgeX = getSlotElement(row, limit - 1).getBoundingClientRect().right;
    } else {
      edgeX = getSlotElement(row, clamped).getBoundingClientRect().left;
    }

    const rowRect = row === "top" ? els.topRow.getBoundingClientRect() : els.bottomRow.getBoundingClientRect();
    return Math.hypot(edgeX - x, (rowRect.top + rowRect.bottom) / 2 - y);
  }

  function groupInsertionHint(group, delta) {
    if (delta === 0) return null;
    const blockers = [];

    groupTargetCells(group, delta).forEach((cell) => {
      const occupantId = state.slots.get(slotKey(cell.row, cell.index));
      if (!occupantId || group.cardIds.includes(occupantId)) return;
      const occupant = state.cards.get(occupantId);
      if (occupant?.groupId) {
        const blockingGroup = state.groups.get(occupant.groupId);
        if (blockingGroup) blockers.push({ bounds: groupGlobalBounds(blockingGroup) });
      } else if (cell.row === "bottom" && occupant?.location.type === "slot") {
        const offset = bottomOffset();
        blockers.push({
          bounds: {
            min: occupant.location.index + offset,
            max: occupant.location.index + offset + occupant.span
          }
        });
      }
    });

    const validBlockers = blockers.filter((item) => Number.isFinite(item.bounds.min));
    if (!validBlockers.length) return null;
    if (delta < 0) {
      validBlockers.sort((a, b) => a.bounds.min - b.bounds.min);
      return { boundary: validBlockers[0].bounds.min };
    }

    validBlockers.sort((a, b) => b.bounds.max - a.bounds.max);
    return { boundary: validBlockers[0].bounds.max };
  }

  function showInsertionIndicator(insertion) {
    const rect = insertionIndicatorRect(insertion.boundary);
    if (!rect) return;
    ensureFactorLayer();
    const indicator = document.createElement("div");
    indicator.className = "insert-indicator";
    indicator.style.left = `${rect.left}px`;
    indicator.style.top = `${rect.top}px`;
    indicator.style.height = `${rect.height}px`;
    els.factorLayer.appendChild(indicator);
  }

  function hideInsertionIndicator() {
    els.factorLayer?.querySelectorAll(".insert-indicator").forEach((indicator) => indicator.remove());
  }

  function insertionIndicatorRect(boundary) {
    const root = els.equation.getBoundingClientRect();
    const topRow = els.topRow.getBoundingClientRect();
    const bottomRow = els.bottomRow.getBoundingClientRect();
    let x = null;

    if (boundary <= 0) {
      x = getSlotElement("top", 0)?.getBoundingClientRect().left;
    } else if (boundary >= state.topDigits) {
      x = getSlotElement("top", state.topDigits - 1)?.getBoundingClientRect().right;
    } else {
      x = getSlotElement("top", boundary)?.getBoundingClientRect().left;
    }

    if (x === null || x === undefined) return null;
    return {
      left: x - root.left - 2,
      top: Math.min(topRow.top, bottomRow.top) - root.top - 4,
      height: Math.max(topRow.bottom, bottomRow.bottom) - Math.min(topRow.top, bottomRow.top) + 8
    };
  }

  function placeSingleCard(cardId, target) {
    const card = state.cards.get(cardId);
    if (!card || target.type !== "slot") return false;
    if (target.movePlan) {
      applyGroupMovePlan(target.movePlan);
      afterBoardChange();
      return true;
    }
    if (target.singlePlan) {
      applySingleBottomPlan(target.singlePlan);
      afterBoardChange();
      return true;
    }
    if (!canPlaceCells(cardId, target.row, target.index, card.span)) return false;

    clearCardLocation(card);
    occupyCells(cardId, target.row, target.index, card.span);
    card.location = target;
    getSlotElement(target.row, target.index).appendChild(card.element);
    renderCardFace(card);
    sortPoolCards();
    afterBoardChange();
    return true;
  }

  function moveGroup(card, target) {
    const group = state.groups.get(card.groupId);
    if (!group) return;

    if (target.type !== "slot") {
      returnGroupToPool(group);
      return;
    }

    if (group.immovable) return;

    if (card.location.type !== "slot") return;
    const delta = target.index - card.location.index;
    if (delta === 0 || target.restoreOriginal) return;
    const plan = planGroupMove(group, delta);
    if (!plan) return;

    applyGroupMovePlan(plan);
    afterBoardChange();
  }

  function planGroupMove(group, delta) {
    if (delta === 0) return null;

    const pushDelta = -Math.sign(delta) * groupSpan(group);
    const plan = {
      groups: new Map([[group.id, delta]]),
      singles: new Map()
    };
    let changed = true;

    while (changed) {
      changed = false;
      for (const [groupId, plannedDelta] of Array.from(plan.groups.entries())) {
        const plannedGroup = state.groups.get(groupId);
        if (!plannedGroup) return null;
        const blockers = getGroupMoveBlockers(plannedGroup, plannedDelta, plan, pushDelta);
        if (blockers === null) return null;
        for (const blockerId of blockers.groups) {
          if (!plan.groups.has(blockerId)) {
            plan.groups.set(blockerId, pushDelta);
            changed = true;
          }
        }
        blockers.singles.forEach((targetIndex, cardId) => {
          if (!plan.singles.has(cardId)) plan.singles.set(cardId, targetIndex);
        });
      }
    }

    return validateGroupMovePlan(plan) ? plan : null;
  }

  function getGroupMoveBlockers(group, delta, plan, pushDelta) {
    const blockers = {
      groups: new Set(),
      singles: new Map()
    };

    for (const cell of groupTargetCells(group, delta)) {
      if (!isCellInBounds(cell.row, cell.index)) return null;
      const occupantId = state.slots.get(slotKey(cell.row, cell.index));
      if (!occupantId || group.cardIds.includes(occupantId)) continue;
      const occupant = state.cards.get(occupantId);
      if (occupant?.groupId) {
        if (!plan.groups.has(occupant.groupId)) blockers.groups.add(occupant.groupId);
      } else if (cell.row === "bottom" && occupant.location.type === "slot") {
        if (!plan.singles.has(occupant.id)) blockers.singles.set(occupant.id, occupant.location.index + pushDelta);
      } else {
        return null;
      }
    }

    return blockers;
  }

  function validateGroupMovePlan(plan) {
    const normalizedPlan = normalizeMovePlan(plan);
    const targetCells = new Map();

    for (const [groupId, delta] of normalizedPlan.groups.entries()) {
      const group = state.groups.get(groupId);
      if (!group) return false;
      for (const cell of groupTargetCells(group, delta)) {
        if (!isCellInBounds(cell.row, cell.index)) return false;
        const key = slotKey(cell.row, cell.index);
        const existing = targetCells.get(key);
        if (existing && existing !== groupId) return false;
        targetCells.set(key, groupId);

        const occupantId = state.slots.get(key);
        if (!occupantId) continue;
        const occupant = state.cards.get(occupantId);
        if (!isPlannedOccupant(occupant, normalizedPlan)) return false;
      }
    }

    for (const [cardId, index] of normalizedPlan.singles.entries()) {
      const card = state.cards.get(cardId);
      if (!card || card.groupId) return false;
      for (const coveredIndex of getCoveredIndices("bottom", index, card.span)) {
        if (!isCellInBounds("bottom", coveredIndex)) return false;
        const key = slotKey("bottom", coveredIndex);
        const existing = targetCells.get(key);
        if (existing && existing !== cardId) return false;
        targetCells.set(key, cardId);

        const occupantId = state.slots.get(key);
        if (!occupantId) continue;
        const occupant = state.cards.get(occupantId);
        if (!isPlannedOccupant(occupant, normalizedPlan)) return false;
      }
    }

    return true;
  }

  function applyGroupMovePlan(plan) {
    const normalizedPlan = normalizeMovePlan(plan);
    const moves = [];
    for (const [groupId, delta] of normalizedPlan.groups.entries()) {
      const group = state.groups.get(groupId);
      group.cardIds.forEach((id) => {
        const card = state.cards.get(id);
        moves.push({
          card,
          location: {
            type: "slot",
            row: card.location.row,
            index: card.location.index + delta
          }
        });
      });
    }
    for (const [cardId, index] of normalizedPlan.singles.entries()) {
      const card = state.cards.get(cardId);
      moves.push({
        card,
        location: { type: "slot", row: "bottom", index }
      });
    }

    moves.forEach(({ card }) => clearCardLocation(card));
    moves.forEach(({ card, location }) => {
      occupyCells(card.id, location.row, location.index, card.span);
      card.location = location;
      getSlotElement(location.row, location.index).appendChild(card.element);
      renderCardFace(card);
    });
    sortPoolCards();
  }

  function groupTargetCells(group, delta) {
    return group.cardIds.flatMap((id) => {
      const card = state.cards.get(id);
      if (!card || card.location.type !== "slot") return [];
      return getCoveredIndices(card.location.row, card.location.index + delta, card.span).map((index) => ({
        row: card.location.row,
        index
      }));
    });
  }

  function groupSpan(group) {
    const bounds = groupGlobalBounds(group);
    return Math.max(1, bounds.max - bounds.min);
  }

  function groupBounds(group) {
    let min = Infinity;
    let max = -Infinity;
    group.cardIds.forEach((id) => {
      const card = state.cards.get(id);
      if (!card || card.location.type !== "slot") return;
      min = Math.min(min, card.location.index);
      max = Math.max(max, card.location.index + card.span);
    });
    return { min, max };
  }

  function groupGlobalBounds(group) {
    let min = Infinity;
    let max = -Infinity;
    group.cardIds.forEach((id) => {
      const card = state.cards.get(id);
      if (!card || card.location.type !== "slot") return;
      const offset = card.location.row === "bottom" ? bottomOffset() : 0;
      min = Math.min(min, card.location.index + offset);
      max = Math.max(max, card.location.index + offset + card.span);
    });
    return { min, max };
  }

  function groupBottomBounds(group) {
    let min = Infinity;
    let max = -Infinity;
    group.cardIds.forEach((id) => {
      const card = state.cards.get(id);
      if (!card || card.location.type !== "slot" || card.location.row !== "bottom") return;
      min = Math.min(min, card.location.index);
      max = Math.max(max, card.location.index + card.span);
    });
    return { min, max };
  }

  function isCellInBounds(row, index) {
    const limit = row === "top" ? state.topDigits : state.bottomDigits;
    return index >= 0 && index < limit;
  }

  function returnToPool(cardId) {
    const card = state.cards.get(cardId);
    if (!card) return;
    if (card.groupId) {
      const group = state.groups.get(card.groupId);
      if (group) returnGroupToPool(group);
      return;
    }
    clearCardLocation(card);
    card.location = { type: "pool" };
    els.pool.appendChild(card.element);
    renderCardFace(card);
    sortPoolCards();
    afterBoardChange();
  }

  function returnGroupToPool(group) {
    group.cardIds.forEach((id) => {
      const card = state.cards.get(id);
      clearCardLocation(card);
      card.location = { type: "pool" };
      els.pool.appendChild(card.element);
      renderCardFace(card);
    });
    sortPoolCards();
    afterBoardChange();
  }

  function clearCardLocation(card) {
    if (!card) return;
    if (card.location.type === "slot") {
      getCoveredIndices(card.location.row, card.location.index, card.span).forEach((index) => {
        state.slots.set(slotKey(card.location.row, index), null);
      });
    }
    card.element.remove();
  }

  function canPlaceCells(cardId, row, index, span, allowedOccupants = [cardId]) {
    const limit = row === "top" ? state.topDigits : state.bottomDigits;
    if (index < 0 || index + span > limit) return false;
    return getCoveredIndices(row, index, span).every((coveredIndex) => {
      const occupant = state.slots.get(slotKey(row, coveredIndex));
      return !occupant || allowedOccupants.includes(occupant);
    });
  }

  function occupyCells(cardId, row, index, span) {
    getCoveredIndices(row, index, span).forEach((coveredIndex) => {
      state.slots.set(slotKey(row, coveredIndex), cardId);
    });
  }

  function getCoveredIndices(row, index, span) {
    return Array.from({ length: span }, (_, offset) => index + offset);
  }

  function afterBoardChange() {
    refreshCardFaces();
    detectFactors();
    const answer = getBottomAnswer();
    if (answer) judge(answer);
  }

  function getBottomAnswer() {
    let answer = "";
    let index = 0;
    while (index < state.bottomDigits) {
      const cardId = state.slots.get(slotKey("bottom", index));
      if (!cardId) return "";
      const card = state.cards.get(cardId);
      if (!card || card.location.type !== "slot" || card.location.index !== index) return "";
      answer += card.label;
      index += card.span;
    }
    return cardsToNum(answer).length === state.bottomDigits ? answer : "";
  }

  function judge(answer) {
    const quiz = state.quizList[state.currentQuiz];
    const result = checkAnswer(answer, quiz);
    if (result.result === "incorrect") return;

    if (result.result === "divisible") {
      flash("divisible");
      els.feedback.textContent = `${cardsToNum(answer)} は ${result.divisor} の倍数です。別の因子を探してください。`;
      addHistory(`${cardsToNum(answer)} : ${result.divisor} の倍数`);
      return;
    }

    flash("correct");
    els.feedback.textContent = `${cardsToNum(answer)} で成立しました。`;
    addHistory(`${cardsToNum(answer)} : 正解`);
    window.setTimeout(nextQuiz, 620);
  }

  function nextQuiz() {
    if (state.finished) return;
    state.currentQuiz += 1;
    if (state.currentQuiz >= state.quizList.length) {
      finishGame();
      return;
    }
    renderQuiz();
  }

  function finishGame() {
    state.finished = true;
    window.clearInterval(state.timerId);
    const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(2);
    els.progress.textContent = `${state.quizList.length} / ${state.quizList.length}`;
    els.feedback.textContent = `クリア。記録は ${elapsed} 秒です。`;
    els.pool.innerHTML = "";
    const tweetText = `#にばいめーかー new 10問を${elapsed}秒でクリアしました！\nhttps://greenplus.github.io/nibaimaker/new/`;
    els.tweet.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    els.tweet.hidden = false;
  }

  function flash(kind) {
    els.flash.className = `judge-flash ${kind}`;
    window.setTimeout(() => {
      els.flash.className = "judge-flash";
    }, 580);
  }

  function addHistory(text) {
    const entry = document.createElement("div");
    entry.className = "history-entry";
    entry.textContent = `Q${state.currentQuiz + 1} 問題: ${quizProblemLabel(state.quizList[state.currentQuiz])} / ${text}`;
    els.history.prepend(entry);
  }

  function quizProblemLabel(quiz) {
    return parseCards(detailsToCards(quiz.details))
      .sort((a, b) => cardValue(a) - cardValue(b))
      .join(" ");
  }

  function detectFactors() {
    state.groups.clear();
    ensureFactorLayer();
    els.factorLayer.innerHTML = "";
    state.cards.forEach((card) => {
      card.groupId = null;
      card.element.classList.remove("factor", "in-group");
    });

    const usedCards = new Set();
    const matches = [];

    FACTOR_PAIRS.forEach((pattern) => {
      for (let start = 0; start <= state.topDigits - pattern.width; start += 1) {
        const match = matchPattern(pattern, start);
        if (match) matches.push(match);
      }
    });

    const acceptedMatches = [];

    matches
      .sort((a, b) => b.width - a.width)
      .forEach((match, index) => {
        if (match.cardIds.length < 1) return;
        if (match.cardIds.some((id) => usedCards.has(id))) return;
        const groupId = `group-${index}`;
        state.groups.set(groupId, {
          id: groupId,
          cardIds: match.cardIds,
          match,
          immovable: match.usesVirtualZero || match.cardIds.length < 2
        });
        acceptedMatches.push({ ...match, groupId });
        match.cardIds.forEach((id) => {
          usedCards.add(id);
          const card = state.cards.get(id);
          card.groupId = groupId;
          card.element.classList.add("factor", "in-group");
        });
      });

    renderFactorOutlines(acceptedMatches);
  }

  function matchPattern(pattern, topStart) {
    const cardIds = [];
    const virtualCells = [];

    for (const token of pattern.top) {
      if (!matchToken("top", topStart + token.start, token, cardIds, virtualCells)) return null;
    }

    for (const token of pattern.bottom) {
      if (!matchToken("bottom", topStart + token.start - bottomOffset(), token, cardIds, virtualCells)) return null;
    }

    return {
      width: pattern.width,
      cardIds: [...new Set(cardIds)],
      topRun: tokenRun(pattern.top, topStart),
      bottomRun: tokenRun(pattern.bottom, topStart - bottomOffset()),
      virtualCells,
      usesVirtualZero: virtualCells.length > 0,
      carryIn: pattern.carryIn,
      carryOut: pattern.carryOut
    };
  }

  function tokenRun(tokens, base) {
    const start = Math.min(...tokens.map((token) => token.start));
    const end = Math.max(...tokens.map((token) => token.start + token.span));
    return { start: base + start, end: base + end };
  }

  function renderFactorOutlines(matches) {
    ensureFactorLayer();
    els.factorLayer.innerHTML = "";
    matches.forEach(renderFactorOutline);
  }

  function renderFactorOutline(match) {
    if (!match.topRun || !match.bottomRun) return;
    const topFirst = getSlotElement("top", match.topRun.start);
    const topLast = getSlotElement("top", match.topRun.end - 1);
    const bottomFirst = getSlotElement("bottom", Math.max(0, match.bottomRun.start));
    const bottomLast = getSlotElement("bottom", Math.min(state.bottomDigits - 1, match.bottomRun.end - 1));
    if (!topFirst || !topLast) return;

    const root = els.equation.getBoundingClientRect();
    const rects = [topFirst, topLast].map((el) => el.getBoundingClientRect());
    if (bottomFirst && bottomLast) rects.push(bottomFirst.getBoundingClientRect(), bottomLast.getBoundingClientRect());
    match.virtualCells.forEach((cell) => {
      const virtualRect = virtualCellRect(cell);
      if (virtualRect) rects.push(virtualRect);
    });
    const left = Math.min(...rects.map((rect) => rect.left));
    const right = Math.max(...rects.map((rect) => rect.right));
    const top = Math.min(...rects.map((rect) => rect.top));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    const topBottom = topFirst.getBoundingClientRect().bottom;
    const firstVirtual = match.virtualCells.map(virtualCellRect).find(Boolean);
    const bottomTop = bottomFirst
      ? bottomFirst.getBoundingClientRect().top
      : (firstVirtual ? firstVirtual.top : topFirst.getBoundingClientRect().top);
    const outline = document.createElement("div");
    outline.className = "factor-outline";
    outline.dataset.groupId = match.groupId;
    if (match.carryIn) outline.classList.add("carry-in");
    if (match.carryOut) outline.classList.add("carry-out");
    outline.style.left = `${left - root.left - 5}px`;
    outline.style.top = `${top - root.top - 5}px`;
    outline.style.width = `${right - left + 10}px`;
    outline.style.height = `${bottom - top + 10}px`;
    outline.style.setProperty("--factor-joint-y", `${(topBottom + bottomTop) / 2 - top + 5}px`);

    const start = Math.min(match.topRun.start, match.bottomRun.start + bottomOffset());
    const end = Math.max(match.topRun.end, match.bottomRun.end + bottomOffset());
    for (let index = start + 1; index < end; index += 1) {
      const dividerSlot = getSlotElement("top", index) || getSlotElement("bottom", index - bottomOffset());
      if (!dividerSlot) continue;
      const dividerRect = dividerSlot.getBoundingClientRect();
      const divider = document.createElement("span");
      divider.className = "factor-divider";
      divider.style.left = `${dividerRect.left - left + 5}px`;
      outline.appendChild(divider);
    }

    els.factorLayer.appendChild(outline);
  }

  function virtualCellRect(cell) {
    if (cell.row !== "bottom" || cell.index !== -1) return null;
    const first = getSlotElement("bottom", 0);
    if (!first) return null;
    const rect = first.getBoundingClientRect();
    const slotStep = rect.width + slotGapPixels();
    return {
      left: rect.left - slotStep,
      right: rect.right - slotStep,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    };
  }

  function slotGapPixels() {
    const gap = getComputedStyle(els.equation).getPropertyValue("--slot-gap").trim();
    return Number.parseFloat(gap) || 0;
  }

  function matchToken(row, index, token, cardIds, virtualCells) {
    const limit = row === "top" ? state.topDigits : state.bottomDigits;
    if (token.label === "0" && row === "bottom" && index === -1 && bottomOffset() === 1) {
      virtualCells.push({ row, index, span: token.span });
      return true;
    }
    if (index < 0 || index + token.span > limit) return false;
    const cardId = state.slots.get(slotKey(row, index));
    if (!cardId) return false;
    const card = state.cards.get(cardId);
    if (!card || card.label !== token.label) return false;
    if (card.location.type !== "slot" || card.location.row !== row || card.location.index !== index) return false;
    cardIds.push(cardId);
    return true;
  }

  function findTapBottomFit(card) {
    if (state.settings.tapFill === "right") {
      for (let i = state.bottomDigits - card.span; i >= 0; i -= 1) {
        if (canPlaceCells(card.id, "bottom", i, card.span)) return i;
      }
      return -1;
    }

    for (let i = 0; i <= state.bottomDigits - card.span; i += 1) {
      if (canPlaceCells(card.id, "bottom", i, card.span)) return i;
    }
    return -1;
  }

  function sortPoolCards() {
    const poolCards = Array.from(els.pool.querySelectorAll(".card"))
      .map((element) => state.cards.get(element.dataset.cardId))
      .filter(Boolean)
      .sort((a, b) => cardValue(a.label) - cardValue(b.label) || a.id.localeCompare(b.id));
    poolCards.forEach((card) => els.pool.appendChild(card.element));
  }

  function slotKey(row, index) {
    return `${row}:${index}`;
  }

  function bottomOffset() {
    return state.topDigits - state.bottomDigits;
  }

  function getSlotElement(row, index) {
    return document.querySelector(`.slot[data-row="${row}"][data-index="${index}"]`);
  }

  function resetBoard() {
    Array.from(state.cards.values()).forEach((card) => {
      clearCardLocation(card);
      card.location = { type: "pool" };
      els.pool.appendChild(card.element);
      renderCardFace(card);
    });
    sortPoolCards();
    afterBoardChange();
  }

  function startTimer() {
    window.clearInterval(state.timerId);
    state.startTime = Date.now();
    state.timerId = window.setInterval(() => {
      if (state.finished) return;
      els.timer.textContent = `${((Date.now() - state.startTime) / 1000).toFixed(2)}s`;
    }, 10);
  }

  function scrollBoardRight() {
    window.requestAnimationFrame(() => {
      els.playfield.scrollLeft = els.playfield.scrollWidth;
    });
  }

  function init() {
    state.quizList = buildQuizList();
    els.reset.addEventListener("click", resetBoard);
    showStartScreen();
  }

  init();
})();
