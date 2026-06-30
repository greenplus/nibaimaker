(function () {
  "use strict";

  const TOP_SLOT_COUNT = 6;
  const BOTTOM_SLOT_COUNT = 5;
  const BOTTOM_OFFSET = 1;
  const QUIZ_COUNT = 10;
  const SMALL_DIVISORS = [2, 3, 5, 7, 11, 13];
  const CARD_SYMBOLS = ["T", "J", "Q", "K"];
  const SYMBOL_TO_DIGITS = { T: "10", J: "11", Q: "12", K: "13" };
  const FACTOR_PAIRS = [
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
  ].map(makeFactorPattern);

  const state = {
    quizList: [],
    currentQuiz: 0,
    startTime: 0,
    timerId: 0,
    cardSeq: 0,
    cards: new Map(),
    slots: new Map(),
    groups: new Map(),
    dragCardId: null,
    pointerDrag: null,
    suppressClickUntil: 0,
    finished: false
  };

  const els = {
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
          if (factor.length !== BOTTOM_SLOT_COUNT || double.length !== BOTTOM_SLOT_COUNT) return;
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
      const key = JSON.stringify(quiz);
      if (unique.has(key)) return;
      unique.add(key);
      quizList.push({
        details: quiz,
        cards: removeFixedTwo(detailsToCards(quiz))
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
    const width = Math.max(pair[0].length, pair[1].length);
    const bottom = pair[0].padStart(width, "0");
    const top = pair[1].padStart(width, "0");
    const bottomDigits = expandSymbols(pair[0]);
    const topDigits = expandSymbols(pair[1]);
    const lowerValue = Number(bottomDigits);
    const topValue = Number(topDigits);
    const noCarry = lowerValue * 2;
    const withCarry = noCarry + 1;
    const carryIn = String(withCarry).endsWith(String(topValue)) && !String(noCarry).endsWith(String(topValue));
    const carryOut = (carryIn ? withCarry : noCarry) >= 10 ** bottomDigits.length;

    return { bottom, top, width, carryIn, carryOut };
  }

  function expandSymbols(value) {
    return value.replace(/[TJQK]/g, (symbol) => SYMBOL_TO_DIGITS[symbol]);
  }

  function initSlots() {
    els.topRow.innerHTML = "";
    els.bottomRow.innerHTML = "";
    state.slots.clear();

    for (let i = 0; i < TOP_SLOT_COUNT; i += 1) {
      const slot = makeSlot("top", i);
      els.topRow.appendChild(slot);
    }

    for (let i = 0; i < BOTTOM_SLOT_COUNT; i += 1) {
      const slot = makeSlot("bottom", i);
      els.bottomRow.appendChild(slot);
    }
  }

  function makeSlot(row, index) {
    const slot = document.createElement("div");
    const key = slotKey(row, index);
    slot.className = "slot";
    slot.dataset.row = row;
    slot.dataset.index = String(index);
    slot.dataset.col = row === "top" ? String(index + 1) : String(index + 1);
    slot.addEventListener("dragover", onDragOver);
    slot.addEventListener("dragleave", onDragLeave);
    slot.addEventListener("drop", onSlotDrop);
    state.slots.set(key, null);
    return slot;
  }

  function makeCard(label) {
    const id = `card-${state.cardSeq}`;
    state.cardSeq += 1;

    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    card.textContent = label;
    card.draggable = true;
    card.dataset.cardId = id;
    card.dataset.label = label;
    card.setAttribute("aria-label", `${label} のカード`);
    card.addEventListener("dragstart", onDragStart);
    card.addEventListener("dragend", onDragEnd);
    card.addEventListener("pointerdown", onPointerDown);
    card.addEventListener("click", onCardClick);

    state.cards.set(id, {
      id,
      label,
      element: card,
      location: { type: "pool" },
      groupId: null
    });

    return card;
  }

  function renderQuiz() {
    const quiz = state.quizList[state.currentQuiz];
    state.cards.clear();
    state.groups.clear();
    state.cardSeq = 0;
    state.slots.forEach((_, key) => state.slots.set(key, null));

    els.pool.innerHTML = "";
    document.querySelectorAll(".slot").forEach((slot) => {
      slot.innerHTML = "";
      slot.classList.remove("drag-over");
    });

    shuffleString(quiz.cards).forEach((label) => {
      els.pool.appendChild(makeCard(label));
    });

    els.progress.textContent = `${state.currentQuiz + 1} / ${state.quizList.length}`;
    els.feedback.textContent = "下段が埋まると自動で判定します。カードをタップすると左の空き枠へ入ります。";
    detectFactors();
  }

  function shuffleString(value) {
    return getRandomSubarray(value.split(""), value.length);
  }

  function onDragStart(event) {
    const cardId = event.currentTarget.dataset.cardId;
    state.dragCardId = cardId;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", cardId);
  }

  function onDragEnd() {
    state.dragCardId = null;
    state.suppressClickUntil = Date.now() + 250;
    document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
  }

  function onDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add("drag-over");
  }

  function onDragLeave(event) {
    event.currentTarget.classList.remove("drag-over");
  }

  function onSlotDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove("drag-over");
    const cardId = event.dataTransfer.getData("text/plain") || state.dragCardId;
    const row = event.currentTarget.dataset.row;
    const index = Number(event.currentTarget.dataset.index);
    placeCardOrGroup(cardId, { type: "slot", row, index });
  }

  function onPoolDrop(event) {
    event.preventDefault();
    els.pool.classList.remove("drag-over");
    const cardId = event.dataTransfer.getData("text/plain") || state.dragCardId;
    returnToPool(cardId);
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

    const emptyIndex = findFirstEmptyBottomSlot();
    if (emptyIndex === -1) return;
    placeSingleCard(cardId, { type: "slot", row: "bottom", index: emptyIndex });
  }

  function onPointerDown(event) {
    if (event.button !== 0 || state.finished) return;
    const cardId = event.currentTarget.dataset.cardId;
    state.pointerDrag = {
      cardId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      ghost: null
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  function onPointerMove(event) {
    const drag = state.pointerDrag;
    if (!drag) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.active && Math.hypot(dx, dy) < 8) return;

    event.preventDefault();
    if (!drag.active) {
      const card = state.cards.get(drag.cardId);
      drag.active = true;
      drag.ghost = card.element.cloneNode(true);
      drag.ghost.classList.add("drag-ghost");
      drag.ghost.removeAttribute("id");
      drag.ghost.draggable = false;
      document.body.appendChild(drag.ghost);
      card.element.classList.add("drag-source");
    }

    drag.ghost.style.left = `${event.clientX}px`;
    drag.ghost.style.top = `${event.clientY}px`;
    document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".slot, #pool");
    if (target) target.classList.add("drag-over");
  }

  function onPointerUp(event) {
    window.removeEventListener("pointermove", onPointerMove);
    const drag = state.pointerDrag;
    state.pointerDrag = null;
    document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
    if (!drag || !drag.active) return;

    const card = state.cards.get(drag.cardId);
    card?.element.classList.remove("drag-source");
    drag.ghost?.remove();
    state.suppressClickUntil = Date.now() + 250;

    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".slot, #pool");
    if (!target) return;
    if (target.id === "pool") {
      returnToPool(drag.cardId);
      return;
    }
    placeCardOrGroup(drag.cardId, {
      type: "slot",
      row: target.dataset.row,
      index: Number(target.dataset.index)
    });
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

    const targetKey = slotKey(target.row, target.index);
    const occupant = state.slots.get(targetKey);
    if (occupant && occupant !== cardId) return false;

    clearCardLocation(card);
    state.slots.set(targetKey, cardId);
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
    const nextLocations = group.cardIds.map((id) => {
      const member = state.cards.get(id);
      return {
        id,
        row: member.location.row,
        index: member.location.index + delta
      };
    });

    const canMove = nextLocations.every((loc) => {
      const limit = loc.row === "top" ? TOP_SLOT_COUNT : BOTTOM_SLOT_COUNT;
      if (loc.index < 0 || loc.index >= limit) return false;
      const occupant = state.slots.get(slotKey(loc.row, loc.index));
      return !occupant || group.cardIds.includes(occupant);
    });
    if (!canMove) return;

    group.cardIds.forEach((id) => clearCardLocation(state.cards.get(id)));
    nextLocations.forEach((loc) => {
      const member = state.cards.get(loc.id);
      const location = { type: "slot", row: loc.row, index: loc.index };
      state.slots.set(slotKey(loc.row, loc.index), loc.id);
      member.location = location;
      getSlotElement(location.row, location.index).appendChild(member.element);
    });

    afterBoardChange();
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
      state.slots.set(slotKey(card.location.row, card.location.index), null);
    }
    card.element.remove();
  }

  function afterBoardChange() {
    detectFactors();
    const answer = getBottomAnswer();
    if (answer.length === BOTTOM_SLOT_COUNT) judge(answer);
  }

  function getBottomAnswer() {
    let answer = "";
    for (let i = 0; i < BOTTOM_SLOT_COUNT; i += 1) {
      const cardId = state.slots.get(slotKey("bottom", i));
      if (!cardId) return "";
      answer += state.cards.get(cardId).label;
    }
    return answer;
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
      for (let start = 0; start <= TOP_SLOT_COUNT - pattern.width; start += 1) {
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

  function matchPattern(pattern, start) {
    const cardIds = [];

    for (let offset = 0; offset < pattern.width; offset += 1) {
      const topChar = pattern.top[offset];
      const bottomChar = pattern.bottom[offset];
      const col = start + offset;

      if (!matchCell("top", col, topChar, cardIds)) return null;
      if (!matchCell("bottom", col - BOTTOM_OFFSET, bottomChar, cardIds)) return null;
    }

    return {
      width: pattern.width,
      cardIds: [...new Set(cardIds)],
      carryIn: pattern.carryIn,
      carryOut: pattern.carryOut
    };
  }

  function matchCell(row, index, expected, cardIds) {
    const inBounds = row === "top"
      ? index >= 0 && index < TOP_SLOT_COUNT
      : index >= 0 && index < BOTTOM_SLOT_COUNT;
    const cardId = inBounds ? state.slots.get(slotKey(row, index)) : null;

    if (expected === "0") return !cardId;
    if (!cardId) return false;
    const card = state.cards.get(cardId);
    if (card.label !== expected) return false;
    cardIds.push(cardId);
    return true;
  }

  function findFirstEmptyBottomSlot() {
    for (let i = 0; i < BOTTOM_SLOT_COUNT; i += 1) {
      if (!state.slots.get(slotKey("bottom", i))) return i;
    }
    return -1;
  }

  function slotKey(row, index) {
    return `${row}:${index}`;
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
    initSlots();
    state.quizList = buildQuizList();
    els.pool.addEventListener("dragover", onDragOver);
    els.pool.addEventListener("dragleave", onDragLeave);
    els.pool.addEventListener("drop", onPoolDrop);
    els.reset.addEventListener("click", resetBoard);
    renderQuiz();
    startTimer();
  }

  init();
})();
