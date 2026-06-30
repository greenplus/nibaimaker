(function () {
  "use strict";

  const QUIZ_COUNT = 10;
  const SMALL_DIVISORS = [2, 3, 5, 7, 11, 13];
  const CARD_SYMBOLS = ["T", "J", "Q", "K"];
  const SYMBOL_TO_DIGITS = { T: "10", J: "11", Q: "12", K: "13" };
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

  const FACTOR_PAIRS = RAW_FACTOR_PAIRS
    .filter(([bottom, top]) => !`${expandSymbols(bottom)}${expandSymbols(top)}`.includes("0"))
    .map(makeFactorPattern);

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
    suppressClickUntil: 0,
    finished: false
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
    tweet: document.getElementById("tweet-link")
  };

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
          if (cardsToNum(factor) !== String(prime)) return;
          if (cardsToNum(double) !== String(prime * 2)) return;
          if (sequenceDigitWidth(factor) !== String(prime).length) return;
          if (sequenceDigitWidth(double) !== String(prime * 2).length) return;

          const factorDetail = cardsToDetails(factor);
          const doubleDetail = cardsToDetails(double);
          const quiz = factorDetail.map((count, i) => count + doubleDetail[i]);
          quizzes.push({
            details: quiz,
            bottomDigits: String(prime).length,
            topDigits: String(prime * 2).length
          });
        });
      });
    });

    return quizzes;
  }

  function buildQuizList() {
    const primeList = generatePrimes(99999);
    const goodsizePrimeList = primeList.filter((prime) => prime >= 10000);
    const rawQuizzes = generateQuizzes(goodsizePrimeList);
    const unique = new Set();
    const quizList = [];

    rawQuizzes.forEach((rawQuiz) => {
      const quiz = rawQuiz.details.slice();
      if (quiz[0] !== 0) return;
      quiz[2] += 1;
      if (!quiz.every((value) => value <= 4)) return;

      const cards = removeFixedTwo(detailsToCards(quiz));
      if (sequenceDigitWidth(cards) !== rawQuiz.topDigits + rawQuiz.bottomDigits) return;

      const key = JSON.stringify([quiz, rawQuiz.topDigits, rawQuiz.bottomDigits]);
      if (unique.has(key)) return;
      unique.add(key);
      quizList.push({
        details: quiz,
        cards,
        topDigits: rawQuiz.topDigits,
        bottomDigits: rawQuiz.bottomDigits
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

  function makeCard(label) {
    const id = `card-${state.cardSeq}`;
    const span = cardSpan(label);
    state.cardSeq += 1;

    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    card.textContent = label;
    card.draggable = false;
    card.dataset.cardId = id;
    card.dataset.label = label;
    card.dataset.span = String(span);
    card.style.setProperty("--span", String(span));
    card.setAttribute("aria-label", `${label} のカード`);
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

    return card;
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

    els.progress.textContent = `${state.currentQuiz + 1} / ${state.quizList.length}`;
    els.feedback.textContent = "下段5桁が埋まると自動で判定します。カードをタップすると左の空き枠へ入ります。";
    detectFactors();
  }

  function shuffleString(value) {
    return getRandomSubarray(value.split(""), value.length);
  }

  function onCardClick(event) {
    if (Date.now() < state.suppressClickUntil) return;
    const cardId = event.currentTarget.dataset.cardId;
    const card = state.cards.get(cardId);
    if (!card || state.finished) return;
    if (card.groupId) {
      returnToPool(cardId);
      return;
    }

    const emptyIndex = findFirstBottomFit(card);
    if (emptyIndex === -1) return;
    placeSingleCard(cardId, { type: "slot", row: "bottom", index: emptyIndex });
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
      active: false
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
    if (!drag.active && Math.hypot(dx, dy) < 8) return;

    event.preventDefault();
    if (!drag.active) startPointerDrag(drag, event);

    moveDraggingCard(drag, event.clientX, event.clientY);
    highlightNearestDrop(drag.cardId, event.clientX, event.clientY);
  }

  function onPointerUp(event) {
    const drag = state.pointerDrag;
    if (!drag || !drag.active) {
      cleanupDrag({ restore: true });
      return;
    }

    const cardId = drag.cardId;
    const target = findNearestDrop(cardId, event.clientX, event.clientY);
    cleanupDrag({ restore: !target });
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

  function startPointerDrag(drag, event) {
    const card = state.cards.get(drag.cardId);
    const rect = card.element.getBoundingClientRect();
    drag.offsetX = event.clientX - rect.left;
    drag.offsetY = event.clientY - rect.top;
    drag.active = true;
    card.element.style.width = `${rect.width}px`;
    card.element.style.height = `${rect.height}px`;
    card.element.classList.add("dragging-card");
    document.body.appendChild(card.element);
    moveDraggingCard(drag, event.clientX, event.clientY);
  }

  function moveDraggingCard(drag, x, y) {
    const card = state.cards.get(drag.cardId);
    card.element.style.left = `${x - drag.offsetX}px`;
    card.element.style.top = `${y - drag.offsetY}px`;
  }

  function cleanupDrag({ restore = false } = {}) {
    window.removeEventListener("pointermove", onPointerMove);
    const drag = state.pointerDrag;
    if (drag) {
      const card = state.cards.get(drag.cardId);
      if (card) {
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
    const target = findNearestDrop(cardId, x, y);
    if (!target) return;
    if (target.type === "pool") {
      els.pool.classList.add("drag-over");
      return;
    }
    getCoveredIndices(target.row, target.index, state.cards.get(cardId).span).forEach((index) => {
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
      if (!canMoveGroup(group, delta)) continue;
      candidates.push({
        type: "slot",
        row,
        index,
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

  function placeCardOrGroup(cardId, target) {
    const card = state.cards.get(cardId);
    if (!card || state.finished) return;

    if (card.groupId) {
      moveGroup(card, target);
      return;
    }

    placeSingleCard(cardId, target);
  }

  function placeSingleCard(cardId, target) {
    const card = state.cards.get(cardId);
    if (!card || target.type !== "slot") return false;
    if (!canPlaceCells(cardId, target.row, target.index, card.span)) return false;

    clearCardLocation(card);
    occupyCells(cardId, target.row, target.index, card.span);
    card.location = target;
    getSlotElement(target.row, target.index).appendChild(card.element);
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

    if (card.location.type !== "slot") return;
    const delta = target.index - card.location.index;
    if (!canMoveGroup(group, delta)) return;

    const nextLocations = group.cardIds.map((id) => {
      const member = state.cards.get(id);
      return {
        id,
        row: member.location.row,
        index: member.location.index + delta
      };
    });

    group.cardIds.forEach((id) => clearCardLocation(state.cards.get(id)));
    nextLocations.forEach((loc) => {
      const member = state.cards.get(loc.id);
      const location = { type: "slot", row: loc.row, index: loc.index };
      occupyCells(loc.id, location.row, location.index, member.span);
      member.location = location;
      getSlotElement(location.row, location.index).appendChild(member.element);
    });

    afterBoardChange();
  }

  function canMoveGroup(group, delta) {
    return group.cardIds.every((id) => {
      const member = state.cards.get(id);
      if (!member || member.location.type !== "slot") return false;
      return canPlaceCells(id, member.location.row, member.location.index + delta, member.span, group.cardIds);
    });
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
    afterBoardChange();
  }

  function returnGroupToPool(group) {
    group.cardIds.forEach((id) => {
      const card = state.cards.get(id);
      clearCardLocation(card);
      card.location = { type: "pool" };
      els.pool.appendChild(card.element);
    });
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
    const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1);
    els.progress.textContent = `${state.quizList.length} / ${state.quizList.length}`;
    els.feedback.textContent = `クリア。記録は ${elapsed} 秒です。`;
    els.pool.innerHTML = "";
    const tweetText = `#にばいめーかー new 10問を${elapsed}秒でクリアしました\nhttps://greenplus.github.io/nibaimaker/new/`;
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
    entry.textContent = `Q${state.currentQuiz + 1} ${text}`;
    els.history.prepend(entry);
  }

  function detectFactors() {
    state.groups.clear();
    state.cards.forEach((card) => {
      card.groupId = null;
      card.element.classList.remove("factor", "in-group", "bump-left", "notch-right");
    });

    const usedCards = new Set();
    const matches = [];

    FACTOR_PAIRS.forEach((pattern) => {
      for (let start = 0; start <= state.topDigits - pattern.width; start += 1) {
        const match = matchPattern(pattern, start);
        if (match) matches.push(match);
      }
    });

    matches
      .sort((a, b) => b.width - a.width)
      .forEach((match, index) => {
        if (match.cardIds.length < 2) return;
        if (match.cardIds.some((id) => usedCards.has(id))) return;
        const groupId = `group-${index}`;
        state.groups.set(groupId, { id: groupId, cardIds: match.cardIds });
        match.cardIds.forEach((id) => {
          usedCards.add(id);
          const card = state.cards.get(id);
          card.groupId = groupId;
          card.element.classList.add("factor", "in-group");
          if (match.carryIn) card.element.classList.add("notch-right");
          if (match.carryOut) card.element.classList.add("bump-left");
        });
      });
  }

  function matchPattern(pattern, topStart) {
    const cardIds = [];

    for (const token of pattern.top) {
      if (!matchToken("top", topStart + token.start, token, cardIds)) return null;
    }

    for (const token of pattern.bottom) {
      if (!matchToken("bottom", topStart + token.start - bottomOffset(), token, cardIds)) return null;
    }

    return {
      width: pattern.width,
      cardIds: [...new Set(cardIds)],
      carryIn: pattern.carryIn,
      carryOut: pattern.carryOut
    };
  }

  function matchToken(row, index, token, cardIds) {
    const limit = row === "top" ? state.topDigits : state.bottomDigits;
    if (index < 0 || index + token.span > limit) return false;
    const cardId = state.slots.get(slotKey(row, index));
    if (!cardId) return false;
    const card = state.cards.get(cardId);
    if (!card || card.label !== token.label) return false;
    if (card.location.type !== "slot" || card.location.row !== row || card.location.index !== index) return false;
    cardIds.push(cardId);
    return true;
  }

  function findFirstBottomFit(card) {
    for (let i = 0; i <= state.bottomDigits - card.span; i += 1) {
      if (canPlaceCells(card.id, "bottom", i, card.span)) return i;
    }
    return -1;
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
    });
    afterBoardChange();
  }

  function startTimer() {
    state.startTime = Date.now();
    state.timerId = window.setInterval(() => {
      if (state.finished) return;
      els.timer.textContent = `${((Date.now() - state.startTime) / 1000).toFixed(1)}s`;
    }, 100);
  }

  function init() {
    state.quizList = buildQuizList();
    els.reset.addEventListener("click", resetBoard);
    renderQuiz();
    startTimer();
  }

  init();
})();
