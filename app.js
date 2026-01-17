'use strict';

// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// API Configuration
const API_URL = 'http://localhost:3000/api';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  wpm: 250,
  wordSpacing: 8,
  linesAbove: 12,
  linesBelow: 12,
  rowHeight: 40,
  fontSize: 20,
  fontFamily: 'Arial, sans-serif',
  colors: {
    focus: 'white',
    past: '#999',
    future: '#999',
    accent: 'red'
  },
  animation: {
    frameTimeout: 120000,
  },
  scrolling: {
    wheelPixelDelta: 40,
    dragSensitivity: 1.0,
    autoResumeDelay: 0
  }
};

// Sample text as fallback
const SAMPLE_WORDS = [
  "Welcome", "to", "Speed", "Reader", "Select", "a", "book", "from", "the", "left",
  "sidebar", "to", "start", "reading", "You", "can", "toggle", "between", "smooth",
  "and", "word", "modes", "using", "the", "button", "below", "Use", "your", "mouse",
  "wheel", "or", "drag", "to", "manually", "scroll", "through", "the", "text",
  "Press", "the", "play", "button", "to", "start", "automatic", "reading"
];

// =============================================================================
// WORDMETRICS CLASS
// =============================================================================

class WordMetrics {
  constructor(words, config) {
    if (!Array.isArray(words) || words.length === 0) {
      throw new Error('WordMetrics: words must be a non-empty array');
    }

    this.words = words;
    this.config = config;
    this.measurementCache = new Map();
    this.measureElement = document.getElementById('measure');

    if (!this.measureElement) {
      throw new Error('WordMetrics: measure element not found');
    }

    this.wordPositions = this._calculateWordPositions();
  }

  _measureText(text, bold = false) {
    const cacheKey = `${text}_${bold}`;

    if (this.measurementCache.has(cacheKey)) {
      return this.measurementCache.get(cacheKey);
    }

    try {
      this.measureElement.textContent = text;
      this.measureElement.style.fontWeight = bold ? 'bold' : 'normal';
      const width = this.measureElement.offsetWidth;

      this.measurementCache.set(cacheKey, width);
      return width;
    } catch (error) {
      console.warn('WordMetrics: Error measuring text, using fallback', error);
      return text.length * 10;
    }
  }

  getWordWidth(word, isFocus = false) {
    if (!isFocus) {
      return this._measureText(word);
    }

    const len = word.length;
    const middleIndex = len <= 2 ? 0 : Math.floor(len / 2);

    const before = word.slice(0, middleIndex);
    const middle = word[middleIndex];
    const after = word.slice(middleIndex + 1);

    return this._measureText(before) +
           this._measureText(middle, true) +
           this._measureText(after);
  }

  getMiddleLetterOffset(word) {
    const len = word.length;
    const middleIndex = len <= 2 ? 0 : Math.floor(len / 2);

    let offset = 0;
    for (let i = 0; i < middleIndex; i++) {
      offset += this._measureText(word[i]);
    }

    const middleWidth = this._measureText(word[middleIndex], true);
    offset += middleWidth / 2;

    return offset;
  }

  _calculateWordPositions() {
    const positions = [];
    let cumulativePosition = 0;

    this.words.forEach((word, index) => {
      const width = this.getWordWidth(word, true);
      const middleLetterOffset = this.getMiddleLetterOffset(word);

      positions.push({
        word,
        index,
        startPosition: cumulativePosition,
        width,
        middleLetterOffset,
        centerPosition: cumulativePosition + middleLetterOffset
      });

      cumulativePosition += width + this.config.wordSpacing;
    });

    return positions;
  }

  getWordPositionData(index) {
    if (index < 0 || index >= this.wordPositions.length) {
      return null;
    }
    return this.wordPositions[index];
  }

  getWordCount() {
    return this.words.length;
  }

  getLastWordCenter() {
    if (this.wordPositions.length === 0) return 0;
    return this.wordPositions[this.wordPositions.length - 1].centerPosition;
  }

  clearCache() {
    this.measurementCache.clear();
  }
}

// =============================================================================
// RENDERENGINE CLASS
// =============================================================================

class RenderEngine {
  constructor(config, metrics) {
    this.config = config;
    this.metrics = metrics;

    this.elements = {
      displayArea: document.getElementById('display-area'),
      container: document.getElementById('main-container'),
      playPauseBtn: document.getElementById('play-pause'),
      currentWordAria: document.getElementById('current-word'),
      pageInfo: document.getElementById('readfast-page-info')
    };

    if (!this.elements.displayArea) {
      throw new Error('RenderEngine: display-area element not found');
    }
    if (!this.elements.container) {
      throw new Error('RenderEngine: main-container element not found');
    }

    // Account for container padding (20px on each side)
    const containerPadding = 40;
    this.containerWidth = this.elements.container.offsetWidth - containerPadding;
    this.centerX = this.containerWidth / 2;
  }

  _createWordElement(word, isFocus = false) {
    const span = document.createElement('span');
    span.className = 'word';

    if (isFocus) {
      const len = word.length;
      const middleIndex = len <= 2 ? 0 : Math.floor(len / 2);

      const before = word.slice(0, middleIndex);
      const middle = word[middleIndex];
      const after = word.slice(middleIndex + 1);

      span.innerHTML = before + '<span class="middle-letter">' + middle + '</span>' + after;
    } else {
      span.textContent = word;
    }

    return span;
  }

  _renderFocusLine(fragment, focusWordData, globalOffset, pastWords, futureWords) {
    const focusRowDiv = document.createElement('div');
    focusRowDiv.className = 'row';
    focusRowDiv.style.top = 'calc(50% - 20px)';

    pastWords.forEach(({ word, x }) => {
      const wordEl = this._createWordElement(word);
      wordEl.classList.add('past');
      wordEl.style.left = x + 'px';
      focusRowDiv.appendChild(wordEl);
    });

    const focusEl = this._createWordElement(focusWordData.word, true);
    const focusX = globalOffset + focusWordData.startPosition;
    focusEl.style.left = focusX + 'px';
    focusRowDiv.appendChild(focusEl);

    futureWords.forEach(({ word, x }) => {
      const wordEl = this._createWordElement(word);
      wordEl.classList.add('future');
      wordEl.style.left = x + 'px';
      focusRowDiv.appendChild(wordEl);
    });

    fragment.appendChild(focusRowDiv);
  }

  _renderPastLines(fragment, pastLines) {
    pastLines.forEach((lineWords, lineIndex) => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'row';

      const distanceFromFocus = pastLines.length - lineIndex;
      rowDiv.style.top = `calc(50% - ${20 + distanceFromFocus * this.config.rowHeight}px)`;

      let x = this.containerWidth - this.config.wordSpacing;
      for (let i = lineWords.length - 1; i >= 0; i--) {
        const { word } = lineWords[i];
        const width = this.metrics.getWordWidth(word);
        x -= width;

        // Skip words that would render off the left edge
        if (x >= 0) {
          const wordEl = this._createWordElement(word);
          wordEl.classList.add('past');
          wordEl.style.left = x + 'px';
          rowDiv.appendChild(wordEl);
        }

        x -= this.config.wordSpacing;
      }

      fragment.appendChild(rowDiv);
    });
  }

  _renderFutureLines(fragment, futureLines) {
    futureLines.forEach((lineWords, lineIndex) => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'row';

      rowDiv.style.top = `calc(50% + ${20 + lineIndex * this.config.rowHeight}px)`;

      let x = this.config.wordSpacing;
      for (let i = 0; i < lineWords.length; i++) {
        const { word } = lineWords[i];
        const width = this.metrics.getWordWidth(word);

        // Skip words that would render off the right edge
        if (x + width <= this.containerWidth) {
          const wordEl = this._createWordElement(word);
          wordEl.classList.add('future');
          wordEl.style.left = x + 'px';
          rowDiv.appendChild(wordEl);
        }

        x += width + this.config.wordSpacing;
      }

      fragment.appendChild(rowDiv);
    });
  }

  render(state) {
    if (!this.elements.displayArea) {
      return;
    }

    try {
      let currentFocusIndex;
      let globalOffset;
      let scrollOffset = state.scrollOffset;

      if (state.mode === 'smooth') {
        currentFocusIndex = 0;
        let minDistance = Math.abs(scrollOffset - this.metrics.wordPositions[0].centerPosition);

        for (let i = 1; i < this.metrics.wordPositions.length; i++) {
          const distance = Math.abs(scrollOffset - this.metrics.wordPositions[i].centerPosition);
          if (distance < minDistance) {
            minDistance = distance;
            currentFocusIndex = i;
          } else {
            break;
          }
        }
        globalOffset = this.centerX - scrollOffset;
      } else {
        currentFocusIndex = state.focusIndex;
        const focusData = this.metrics.getWordPositionData(currentFocusIndex);
        if (!focusData) return;
        scrollOffset = focusData.centerPosition;
        globalOffset = this.centerX - scrollOffset;
      }

      const focusWordData = this.metrics.getWordPositionData(currentFocusIndex);
      if (!focusWordData) return;

      if (this.elements.currentWordAria) {
        this.elements.currentWordAria.textContent = focusWordData.word;
      }

      // Update page info
      this.updatePageInfo(currentFocusIndex);

      const focusLinePastWords = [];
      const focusLineFutureWords = [];

      for (let i = currentFocusIndex - 1; i >= 0; i--) {
        const wordData = this.metrics.getWordPositionData(i);
        if (!wordData) break;

        const x = globalOffset + wordData.startPosition;
        const width = wordData.width;

        // Stop if word is completely off-screen to the left
        if (x + width < 0) break;

        focusLinePastWords.unshift({ word: wordData.word, index: i, x });
      }

      for (let i = currentFocusIndex + 1; i < this.metrics.getWordCount(); i++) {
        const wordData = this.metrics.getWordPositionData(i);
        if (!wordData) break;

        const x = globalOffset + wordData.startPosition;
        const width = wordData.width;

        if (x > this.containerWidth) break;

        focusLineFutureWords.push({ word: wordData.word, index: i, x });
      }

      const pastLines = this._calculatePastLines(
        currentFocusIndex - focusLinePastWords.length - 1
      );

      const futureLines = this._calculateFutureLines(
        currentFocusIndex + focusLineFutureWords.length + 1
      );

      const fragment = document.createDocumentFragment();

      this._renderPastLines(fragment, pastLines);
      this._renderFocusLine(fragment, focusWordData, globalOffset, focusLinePastWords, focusLineFutureWords);
      this._renderFutureLines(fragment, futureLines);

      this.elements.displayArea.innerHTML = '';
      this.elements.displayArea.appendChild(fragment);

    } catch (error) {
      console.error('RenderEngine: Error during render', error);
    }
  }

  _calculatePastLines(startIndex) {
    const pastLines = [];
    let currentLineWords = [];
    let lineWidth = 0;

    for (let i = startIndex; i >= 0; i--) {
      const wordData = this.metrics.getWordPositionData(i);
      if (!wordData) break;

      const word = wordData.word;
      const width = this.metrics.getWordWidth(word) + this.config.wordSpacing;

      if (lineWidth + width > this.containerWidth - this.config.wordSpacing && currentLineWords.length > 0) {
        pastLines.unshift([...currentLineWords]);
        currentLineWords = [];
        lineWidth = 0;

        if (pastLines.length >= this.config.linesAbove) {
          break;
        }
      }

      currentLineWords.unshift({ word, index: i });
      lineWidth += width;
    }

    if (currentLineWords.length > 0 && pastLines.length < this.config.linesAbove) {
      pastLines.unshift(currentLineWords);
    }

    return pastLines;
  }

  _calculateFutureLines(startIndex) {
    const futureLines = [];
    let currentLineWords = [];
    let lineWidth = 0;

    for (let i = startIndex; i < this.metrics.getWordCount(); i++) {
      const wordData = this.metrics.getWordPositionData(i);
      if (!wordData) break;

      const word = wordData.word;
      const width = this.metrics.getWordWidth(word) + this.config.wordSpacing;

      if (lineWidth + width > this.containerWidth - this.config.wordSpacing && currentLineWords.length > 0) {
        futureLines.push([...currentLineWords]);
        currentLineWords = [];
        lineWidth = 0;

        if (futureLines.length >= this.config.linesBelow) {
          break;
        }
      }

      currentLineWords.push({ word, index: i });
      lineWidth += width;
    }

    if (currentLineWords.length > 0 && futureLines.length < this.config.linesBelow) {
      futureLines.push(currentLineWords);
    }

    return futureLines;
  }

  updateModeIndicator(mode) {
    const toggleBtn = document.getElementById('toggle-mode');
    if (toggleBtn) {
      toggleBtn.textContent = mode === 'smooth' ? 'Smooth' : 'Word';
    }
  }

  updatePlayPauseButton(isPlaying) {
    if (this.elements.playPauseBtn) {
      this.elements.playPauseBtn.textContent = isPlaying ? '⏸' : '▶';
    }
  }

  updatePageInfo(currentWordIndex) {
    if (!this.elements.pageInfo) return;

    const totalWords = this.metrics.getWordCount();

    // Calculate approximate page (assuming ~300 words per page)
    const wordsPerPage = 300;
    const currentPage = Math.floor(currentWordIndex / wordsPerPage) + 1;
    const totalPages = Math.ceil(totalWords / wordsPerPage);

    this.elements.pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  }
}

// =============================================================================
// WORDMARQUEEENGINE CLASS
// =============================================================================

class WordMarqueeEngine {
  constructor(config, words) {
    if (!config) {
      throw new Error('WordMarqueeEngine: config is required');
    }
    if (!Array.isArray(words) || words.length === 0) {
      throw new Error('WordMarqueeEngine: words must be a non-empty array');
    }

    this.config = config;
    this.words = words;

    try {
      this.metrics = new WordMetrics(words, config);
      this.renderer = new RenderEngine(config, this.metrics);
    } catch (error) {
      throw new Error(`WordMarqueeEngine: Initialization failed - ${error.message}`);
    }

    this.state = {
      mode: 'word',
      isPlaying: false,
      scrollOffset: 0,
      focusIndex: 0,
      lastTimestamp: null
    };

    this.animationId = null;
    this.intervalId = null;

    const wordInterval = 60000 / this.config.wpm;
    const totalWidth = this.metrics.getLastWordCenter();
    const totalWords = this.metrics.getWordCount();
    this.pixelsPerMs = (totalWidth / totalWords) / wordInterval;

    this.dragState = {
      isDragging: false,
      startX: 0,
      startScrollOffset: 0,
      startFocusIndex: 0
    };

    this.autoResumeTimer = null;
    this.wasPlayingBeforeManualScroll = false;
    this.eventListeners = [];

    this._boundAnimateSmooth = this._animateSmooth.bind(this);
    this._boundAdvanceWord = this._advanceWord.bind(this);
    this._boundHandleWheel = this._handleWheel.bind(this);
    this._boundHandleMouseDown = this._handleMouseDown.bind(this);
    this._boundHandleMouseMove = this._handleMouseMove.bind(this);
    this._boundHandleMouseUp = this._handleMouseUp.bind(this);
    this._boundNextPage = this._nextPage.bind(this);
    this._boundPrevPage = this._prevPage.bind(this);
  }

  loadNewText(words) {
    // Stop playback
    this.stop();

    // Clear old event listeners
    this.eventListeners.forEach(({ target, event, handler }) => {
      target.removeEventListener(event, handler);
    });
    this.eventListeners = [];

    // Update words
    this.words = words;

    // Recreate metrics and renderer
    this.metrics = new WordMetrics(words, this.config);
    this.renderer = new RenderEngine(this.config, this.metrics);

    // Reset state
    this.state = {
      mode: this.state.mode, // Preserve mode
      isPlaying: false,
      scrollOffset: 0,
      focusIndex: 0,
      lastTimestamp: null
    };

    // Recalculate speed
    const wordInterval = 60000 / this.config.wpm;
    const totalWidth = this.metrics.getLastWordCenter();
    const totalWords = this.metrics.getWordCount();
    this.pixelsPerMs = (totalWidth / totalWords) / wordInterval;

    // Re-setup event listeners
    this.setupEventListeners();

    // Render initial state
    this.renderer.render(this.state);
    this.renderer.updateModeIndicator(this.state.mode);
    this.renderer.updatePlayPauseButton(false);

    console.log('Text loaded:', words.length, 'words');
  }

  start() {
    if (this.state.isPlaying) {
      return;
    }

    try {
      if (this.autoResumeTimer) {
        clearTimeout(this.autoResumeTimer);
        this.autoResumeTimer = null;
      }

      this.state.isPlaying = true;
      this.renderer.updatePlayPauseButton(true);

      if (this.state.mode === 'smooth') {
        this.state.lastTimestamp = null;
        this.animationId = requestAnimationFrame(this._boundAnimateSmooth);
      } else {
        const wordInterval = 60000 / this.config.wpm;
        this.intervalId = setInterval(this._boundAdvanceWord, wordInterval);
      }
    } catch (error) {
      console.error('WordMarqueeEngine: Error starting playback', error);
      this.state.isPlaying = false;
    }
  }

  stop() {
    this.state.isPlaying = false;
    this.renderer.updatePlayPauseButton(false);

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.state.lastTimestamp = null;
  }

  toggleMode() {
    const wasPlaying = this.state.isPlaying;
    this.stop();

    try {
      if (this.state.mode === 'smooth') {
        this.state.mode = 'word';

        for (let i = 0; i < this.metrics.wordPositions.length; i++) {
          const wordData = this.metrics.getWordPositionData(i);
          if (wordData && this.state.scrollOffset >= wordData.centerPosition) {
            this.state.focusIndex = i;
          } else {
            break;
          }
        }
      } else {
        this.state.mode = 'smooth';

        const wordData = this.metrics.getWordPositionData(this.state.focusIndex);
        if (wordData) {
          this.state.scrollOffset = wordData.centerPosition;
        }
      }

      this.renderer.updateModeIndicator(this.state.mode);
      this.renderer.render(this.state);

      if (wasPlaying) {
        this.start();
      }

      saveState();
    } catch (error) {
      console.error('WordMarqueeEngine: Error toggling mode', error);
    }
  }

  togglePlayPause() {
    if (this.autoResumeTimer) {
      clearTimeout(this.autoResumeTimer);
      this.autoResumeTimer = null;
    }
    this.wasPlayingBeforeManualScroll = false;

    if (this.state.isPlaying) {
      this.stop();
    } else {
      this.start();
    }
  }

  _nextPage() {
    // Calculate words per page
    const wordsPerPage = 300;
    const totalWords = this.metrics.getWordCount();

    const currentWordIndex = this.state.mode === 'smooth'
      ? this._findClosestWordIndex(this.state.scrollOffset)
      : this.state.focusIndex;

    // Calculate next page start
    const currentPage = Math.floor(currentWordIndex / wordsPerPage);
    const nextPageStart = Math.min((currentPage + 1) * wordsPerPage, totalWords - 1);

    // Jump to next page
    if (this.state.mode === 'smooth') {
      const wordData = this.metrics.getWordPositionData(nextPageStart);
      if (wordData) {
        this.state.scrollOffset = wordData.centerPosition;
        this.renderer.render(this.state);
        saveState();
      }
    } else {
      this.state.focusIndex = nextPageStart;
      this.renderer.render(this.state);
      saveState();
    }
  }

  _prevPage() {
    // Calculate words per page
    const wordsPerPage = 300;

    const currentWordIndex = this.state.mode === 'smooth'
      ? this._findClosestWordIndex(this.state.scrollOffset)
      : this.state.focusIndex;

    // Calculate previous page start
    const currentPage = Math.floor(currentWordIndex / wordsPerPage);
    const prevPageStart = Math.max((currentPage - 1) * wordsPerPage, 0);

    // Jump to previous page
    if (this.state.mode === 'smooth') {
      const wordData = this.metrics.getWordPositionData(prevPageStart);
      if (wordData) {
        this.state.scrollOffset = wordData.centerPosition;
        this.renderer.render(this.state);
        saveState();
      }
    } else {
      this.state.focusIndex = prevPageStart;
      this.renderer.render(this.state);
      saveState();
    }
  }

  _findClosestWordIndex(scrollOffset) {
    let closestIndex = 0;
    let minDistance = Math.abs(scrollOffset - this.metrics.wordPositions[0].centerPosition);

    for (let i = 1; i < this.metrics.wordPositions.length; i++) {
      const distance = Math.abs(scrollOffset - this.metrics.wordPositions[i].centerPosition);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      } else {
        break;
      }
    }

    return closestIndex;
  }

  _animateSmooth(timestamp) {
    if (!this.state.lastTimestamp) {
      this.state.lastTimestamp = timestamp;
    }

    const deltaTime = timestamp - this.state.lastTimestamp;
    this.state.lastTimestamp = timestamp;

    this.state.scrollOffset += this.pixelsPerMs * deltaTime;

    const lastWordCenter = this.metrics.getLastWordCenter();
    if (this.state.scrollOffset >= lastWordCenter) {
      this.state.scrollOffset = lastWordCenter;
      this.renderer.render(this.state);
      this.stop();
      saveState();
      return;
    }

    try {
      this.renderer.render(this.state);
      saveStateDebounced(2000); // Save every 2 seconds during playback

      if (this.state.isPlaying && this.state.mode === 'smooth') {
        this.animationId = requestAnimationFrame(this._boundAnimateSmooth);
      }
    } catch (error) {
      console.error('WordMarqueeEngine: Error in smooth animation', error);
      this.stop();
    }
  }

  _advanceWord() {
    try {
      if (this.state.focusIndex < this.metrics.getWordCount() - 1) {
        this.state.focusIndex++;
        this.renderer.render(this.state);
        saveStateDebounced(2000); // Save every 2 seconds during playback
      } else {
        this.stop();
        saveState();
      }
    } catch (error) {
      console.error('WordMarqueeEngine: Error advancing word', error);
      this.stop();
    }
  }

  _startAutoResumeTimer() {
    if (this.autoResumeTimer) {
      clearTimeout(this.autoResumeTimer);
      this.autoResumeTimer = null;
    }

    if (this.wasPlayingBeforeManualScroll) {
      this.autoResumeTimer = setTimeout(() => {
        this.autoResumeTimer = null;
        this.wasPlayingBeforeManualScroll = false;
        this.start();
      }, this.config.scrolling.autoResumeDelay);
    }
  }

  _handleManualScrollStart() {
    if (!this.autoResumeTimer && this.state.isPlaying) {
      this.wasPlayingBeforeManualScroll = true;
    }

    if (this.state.isPlaying) {
      this.stop();
    }

    this._startAutoResumeTimer();
  }

  _handleWheel(event) {
    event.preventDefault();

    this._handleManualScrollStart();

    try {
      if (this.state.mode === 'smooth') {
        const delta = -Math.sign(event.deltaY) * this.config.scrolling.wheelPixelDelta;

        this.state.scrollOffset += delta;

        this.state.scrollOffset = Math.max(0, Math.min(
          this.state.scrollOffset,
          this.metrics.getLastWordCenter()
        ));

        this.renderer.render(this.state);
        saveStateDebounced();
      } else {
        if (event.deltaY > 0) {
          if (this.state.focusIndex > 0) {
            this.state.focusIndex--;
            this.renderer.render(this.state);
            saveStateDebounced();
          }
        } else if (event.deltaY < 0) {
          if (this.state.focusIndex < this.metrics.getWordCount() - 1) {
            this.state.focusIndex++;
            this.renderer.render(this.state);
            saveStateDebounced();
          }
        }
      }
    } catch (error) {
      console.error('WordMarqueeEngine: Error handling wheel event', error);
    }
  }

  _handleMouseDown(event) {
    if (event.target.tagName === 'BUTTON') {
      return;
    }

    this.dragState.isDragging = true;
    this.dragState.startX = event.clientX;
    this.dragState.startScrollOffset = this.state.scrollOffset;
    this.dragState.startFocusIndex = this.state.focusIndex;

    this.renderer.elements.container.classList.add('dragging');

    this._handleManualScrollStart();
  }

  _handleMouseMove(event) {
    if (!this.dragState.isDragging) {
      return;
    }

    this._startAutoResumeTimer();

    try {
      const deltaX = event.clientX - this.dragState.startX;

      if (this.state.mode === 'smooth') {
        const dragDelta = -deltaX * this.config.scrolling.dragSensitivity;

        this.state.scrollOffset = this.dragState.startScrollOffset + dragDelta;

        this.state.scrollOffset = Math.max(0, Math.min(
          this.state.scrollOffset,
          this.metrics.getLastWordCenter()
        ));

        this.renderer.render(this.state);
        saveStateDebounced();
      } else {
        const wordThreshold = 30;
        const wordDelta = -Math.floor(deltaX / wordThreshold);

        const newFocusIndex = this.dragState.startFocusIndex + wordDelta;

        const clampedIndex = Math.max(0, Math.min(
          newFocusIndex,
          this.metrics.getWordCount() - 1
        ));

        if (clampedIndex !== this.state.focusIndex) {
          this.state.focusIndex = clampedIndex;
          this.renderer.render(this.state);
          saveStateDebounced();
        }
      }
    } catch (error) {
      console.error('WordMarqueeEngine: Error handling mouse move', error);
    }
  }

  _handleMouseUp(event) {
    if (!this.dragState.isDragging) {
      return;
    }

    this.dragState.isDragging = false;

    this.renderer.elements.container.classList.remove('dragging');

    if (this.state.mode === 'word') {
      const wordData = this.metrics.getWordPositionData(this.state.focusIndex);
      if (wordData) {
        this.state.scrollOffset = wordData.centerPosition;
      }
    }
  }

  _addEventListener(target, event, handler) {
    target.addEventListener(event, handler);
    this.eventListeners.push({ target, event, handler });
  }

  setupEventListeners() {
    const toggleModeBtn = document.getElementById('toggle-mode');
    const playPauseBtn = document.getElementById('play-pause');
    const nextPageBtn = document.getElementById('readfast-next');
    const prevPageBtn = document.getElementById('readfast-prev');
    const container = this.renderer.elements.container;

    if (toggleModeBtn) {
      this._addEventListener(toggleModeBtn, 'click', () => this.toggleMode());
    }

    if (playPauseBtn) {
      this._addEventListener(playPauseBtn, 'click', () => this.togglePlayPause());
    }

    if (nextPageBtn) {
      this._addEventListener(nextPageBtn, 'click', this._boundNextPage);
    }

    if (prevPageBtn) {
      this._addEventListener(prevPageBtn, 'click', this._boundPrevPage);
    }

    this._addEventListener(document, 'keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();

        // Toggle based on current view
        if (currentView === 'real' && pdfViewer) {
          pdfViewer.toggleHighlighting();
        } else {
          this.togglePlayPause();
        }
      }
    });

    if (container) {
      this._addEventListener(container, 'wheel', this._boundHandleWheel, { passive: false });
      this._addEventListener(container, 'mousedown', this._boundHandleMouseDown);
    }

    this._addEventListener(document, 'mousemove', this._boundHandleMouseMove);
    this._addEventListener(document, 'mouseup', this._boundHandleMouseUp);
  }

  destroy() {
    this.stop();

    if (this.autoResumeTimer) {
      clearTimeout(this.autoResumeTimer);
      this.autoResumeTimer = null;
    }

    this.eventListeners.forEach(({ target, event, handler }) => {
      target.removeEventListener(event, handler);
    });
    this.eventListeners = [];

    this.dragState.isDragging = false;
    if (this.renderer && this.renderer.elements.container) {
      this.renderer.elements.container.classList.remove('dragging');
    }

    if (this.metrics) {
      this.metrics.clearCache();
    }

    this.metrics = null;
    this.renderer = null;
    this.state = null;
  }
}

// =============================================================================
// PDF VIEWER CLASS
// =============================================================================

class PDFViewer {
  constructor() {
    this.pdfDoc = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.canvas = document.getElementById('pdf-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.pageInfo = document.getElementById('pdf-page-info');
    this.container = document.getElementById('pdf-container');
    this.textLayer = document.getElementById('pdf-text-layer');
    this.isRendering = false;
    this.listenersActive = false;

    // Auto-highlighting state
    this.highlightingActive = false;
    this.currentTextItems = [];
    this.currentHighlightIndex = 0;
    this.highlightWPM = 250; // Words per minute
    this.highlightIntervalId = null;
    this.currentScale = 1;
    this.highlightRects = []; // Store highlight rectangle elements

    this._boundHandleKeydown = this._handleKeydown.bind(this);
    this._boundHandleWheel = this._handleWheel.bind(this);
    this._boundPrevPage = () => this.prevPage();
    this._boundNextPage = () => this.nextPage();
    this._boundToggleHighlight = () => this.toggleHighlighting();
    this._boundAdvanceHighlight = this._advanceHighlight.bind(this);
    this._boundHandleWPMChange = this._handleWPMChange.bind(this);
  }

  _handleWPMChange(event) {
    const newWPM = parseInt(event.target.value);
    if (newWPM >= 50 && newWPM <= 1000) {
      this.highlightWPM = newWPM;

      // Restart highlighting if it's currently active
      if (this.highlightingActive) {
        this.stopHighlighting();
        this.startHighlighting();
      }

      saveState();
    }
  }

  async loadPDF(filename, startPage = 1) {
    try {
      const pdfUrl = `${API_URL}/books/${filename}`;
      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      this.pdfDoc = await loadingTask.promise;
      this.totalPages = this.pdfDoc.numPages;

      // Clamp start page to valid range
      const validStartPage = Math.max(1, Math.min(startPage, this.pdfDoc.numPages));
      this.currentPage = validStartPage;

      await this.renderPage(this.currentPage);
      this.updatePageInfo();

      console.log('PDF loaded:', this.totalPages, 'pages, starting at page', this.currentPage);
    } catch (error) {
      console.error('Error loading PDF:', error);
    }
  }

  async renderPage(pageNumber) {
    if (!this.pdfDoc || this.isRendering) return;

    this.isRendering = true;

    // Stop highlighting when changing pages
    this.stopHighlighting();

    try {
      const page = await this.pdfDoc.getPage(pageNumber);

      // Calculate scale to fit the container
      const containerWidth = this.container.offsetWidth - 40; // padding
      const containerHeight = this.container.offsetHeight - 80; // padding + info bar

      // If container is hidden (dimensions are 0), skip rendering - it will be re-rendered when shown
      if (containerWidth <= 0 || containerHeight <= 0) {
        console.log('Container hidden, skipping render - will render when visible');
        this.currentPage = pageNumber;
        this.isRendering = false;
        return;
      }

      const viewport = page.getViewport({ scale: 1 });
      const scaleX = containerWidth / viewport.width;
      const scaleY = containerHeight / viewport.height;
      const scale = Math.min(scaleX, scaleY);

      const scaledViewport = page.getViewport({ scale });
      this.currentScale = scale;

      // Support HiDPI screens
      const outputScale = window.devicePixelRatio || 1;

      this.canvas.width = Math.floor(scaledViewport.width * outputScale);
      this.canvas.height = Math.floor(scaledViewport.height * outputScale);
      this.canvas.style.width = Math.floor(scaledViewport.width) + 'px';
      this.canvas.style.height = Math.floor(scaledViewport.height) + 'px';

      const transform = outputScale !== 1
        ? [outputScale, 0, 0, outputScale, 0, 0]
        : null;

      const renderContext = {
        canvasContext: this.ctx,
        transform: transform,
        viewport: scaledViewport
      };

      await page.render(renderContext).promise;

      // Render text layer
      await this.renderTextLayer(page, scaledViewport);

      this.currentPage = pageNumber;
      this.updatePageInfo();

      // Only save state if this is a user-initiated page change, not during restoration
      // We can tell by checking if we're in the middle of state restoration
      if (typeof window._restoringState === 'undefined' || !window._restoringState) {
        saveState();
      }
    } catch (error) {
      console.error('Error rendering page:', error);
    } finally {
      this.isRendering = false;
    }
  }

  async renderTextLayer(page, viewport) {
    if (!this.textLayer) return;

    // Clear existing text layer
    this.textLayer.innerHTML = '';
    this.currentTextItems = [];

    try {
      const textContent = await page.getTextContent();

      // Set text layer dimensions to match canvas
      this.textLayer.style.width = this.canvas.style.width;
      this.textLayer.style.height = this.canvas.style.height;

      textContent.items.forEach((item, index) => {
        // Skip empty items
        if (!item.str.trim()) return;

        const tx = viewport.transform;

        // Create text span
        const textSpan = document.createElement('span');
        textSpan.textContent = item.str;
        textSpan.dataset.index = index;

        // Calculate position and size
        const tx0 = tx[0];
        const tx1 = tx[1];
        const tx2 = tx[2];
        const tx3 = tx[3];
        const tx4 = tx[4];
        const tx5 = tx[5];

        const x = item.transform[4] * tx0 + item.transform[5] * tx2 + tx4;
        const y = item.transform[4] * tx1 + item.transform[5] * tx3 + tx5;

        const fontHeight = Math.sqrt(item.transform[2] * item.transform[2] + item.transform[3] * item.transform[3]);
        const scaledFontSize = fontHeight * tx0;

        textSpan.style.left = x + 'px';
        textSpan.style.top = y + 'px';
        textSpan.style.fontSize = scaledFontSize + 'px';
        textSpan.style.fontFamily = item.fontName || 'sans-serif';

        // Store font size for highlight rectangle calculation
        textSpan.dataset.fontSize = scaledFontSize;

        this.textLayer.appendChild(textSpan);
        this.currentTextItems.push(textSpan);
      });

      this.currentHighlightIndex = 0;
    } catch (error) {
      console.error('Error rendering text layer:', error);
    }
  }

  toggleHighlighting() {
    if (this.highlightingActive) {
      this.stopHighlighting();
    } else {
      this.startHighlighting();
    }
    saveState();
  }

  startHighlighting() {
    if (this.highlightingActive || this.currentTextItems.length === 0) return;

    this.highlightingActive = true;
    this.updateHighlightButton();

    // Calculate interval based on WPM
    const wordsPerSecond = this.highlightWPM / 60;
    const millisecondsPerWord = 1000 / wordsPerSecond;

    this.highlightIntervalId = setInterval(this._boundAdvanceHighlight, millisecondsPerWord);

    // Highlight first item immediately
    this._advanceHighlight();
  }

  setHighlightPosition(wordIndexInDocument, totalWordsInDocument) {
    // Set the highlight position based on word progress through the document
    if (this.currentTextItems.length === 0) return;

    // Calculate proportional position in current page
    const progress = wordIndexInDocument / totalWordsInDocument;
    const targetIndex = Math.floor(progress * this.currentTextItems.length);

    this.currentHighlightIndex = Math.max(0, Math.min(targetIndex, this.currentTextItems.length - 1));
  }

  stopHighlighting() {
    this.highlightingActive = false;
    this.updateHighlightButton();

    if (this.highlightIntervalId) {
      clearInterval(this.highlightIntervalId);
      this.highlightIntervalId = null;
    }

    // Clear all highlight rectangles
    this.highlightRects.forEach(rect => {
      if (rect.parentNode) {
        rect.parentNode.removeChild(rect);
      }
    });
    this.highlightRects = [];

    this.currentHighlightIndex = 0;
  }

  _advanceHighlight() {
    if (this.currentHighlightIndex >= this.currentTextItems.length) {
      // Reached end of page
      if (this.currentPage < this.totalPages) {
        // Move to next page
        this.nextPage();
      } else {
        // Reached end of document
        this.stopHighlighting();
      }
      return;
    }

    // Highlight current item with blue rectangle
    const currentItem = this.currentTextItems[this.currentHighlightIndex];
    if (currentItem && this.textLayer) {
      // Get text span dimensions and position
      const spanRect = currentItem.getBoundingClientRect();
      const layerRect = this.textLayer.getBoundingClientRect();

      // Get font size
      const fontSize = parseFloat(currentItem.dataset.fontSize || currentItem.style.fontSize);

      // Calculate highlight rectangle dimensions
      const rectHeight = fontSize * 1.2; // 20% taller than font size
      const rectWidth = spanRect.width;

      // Position relative to text layer
      const rectLeft = spanRect.left - layerRect.left;
      const rectTop = spanRect.top - layerRect.top;

      // Create highlight rectangle
      const highlightRect = document.createElement('div');
      highlightRect.className = 'pdf-highlight-rect';
      highlightRect.style.left = rectLeft + 'px';
      highlightRect.style.top = rectTop + 'px';
      highlightRect.style.width = rectWidth + 'px';
      highlightRect.style.height = rectHeight + 'px';

      this.textLayer.appendChild(highlightRect);
      this.highlightRects.push(highlightRect);
    }

    this.currentHighlightIndex++;
    saveStateDebounced(2000); // Save every 2 seconds during highlighting
  }

  updateHighlightButton() {
    const btn = document.getElementById('pdf-highlight-play');
    if (btn) {
      btn.textContent = this.highlightingActive ? '⏸' : '▶';
    }
  }

  updatePageInfo() {
    if (this.pageInfo) {
      this.pageInfo.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.renderPage(this.currentPage + 1);
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.renderPage(this.currentPage - 1);
    }
  }

  goToPage(pageNumber) {
    const page = Math.max(1, Math.min(pageNumber, this.totalPages));
    if (page !== this.currentPage) {
      this.renderPage(page);
    }
  }

  _handleKeydown(event) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.prevPage();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.nextPage();
    }
  }

  _handleWheel(event) {
    event.preventDefault();

    if (event.deltaY > 0) {
      this.nextPage();
    } else if (event.deltaY < 0) {
      this.prevPage();
    }
  }

  setupEventListeners() {
    if (this.listenersActive) return;

    document.addEventListener('keydown', this._boundHandleKeydown);

    if (this.container) {
      this.container.addEventListener('wheel', this._boundHandleWheel, { passive: false });
    }

    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const highlightBtn = document.getElementById('pdf-highlight-play');
    const wpmInput = document.getElementById('pdf-wpm-input');

    if (prevBtn) {
      prevBtn.addEventListener('click', this._boundPrevPage);
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', this._boundNextPage);
    }

    if (highlightBtn) {
      highlightBtn.addEventListener('click', this._boundToggleHighlight);
    }

    if (wpmInput) {
      wpmInput.addEventListener('input', this._boundHandleWPMChange);
    }

    this.listenersActive = true;
  }

  removeEventListeners() {
    if (!this.listenersActive) return;

    document.removeEventListener('keydown', this._boundHandleKeydown);

    if (this.container) {
      this.container.removeEventListener('wheel', this._boundHandleWheel);
    }

    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const highlightBtn = document.getElementById('pdf-highlight-play');
    const wpmInput = document.getElementById('pdf-wpm-input');

    if (prevBtn) {
      prevBtn.removeEventListener('click', this._boundPrevPage);
    }

    if (nextBtn) {
      nextBtn.removeEventListener('click', this._boundNextPage);
    }

    if (highlightBtn) {
      highlightBtn.removeEventListener('click', this._boundToggleHighlight);
    }

    if (wpmInput) {
      wpmInput.removeEventListener('input', this._boundHandleWPMChange);
    }

    this.listenersActive = false;
  }

  destroy() {
    this.removeEventListeners();
    this.stopHighlighting();
    this.pdfDoc = null;

    if (this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    if (this.textLayer) {
      this.textLayer.innerHTML = '';
    }

    this.currentTextItems = [];
  }
}

// =============================================================================
// STATE PERSISTENCE
// =============================================================================

const STATE_STORAGE_KEY = 'readfast_state';

function saveState() {
  if (!currentBook) return;

  const state = {
    book: {
      filename: currentBook.filename,
      title: currentBook.title,
      type: currentBook.type
    },
    view: currentView,
    readfast: engine ? {
      mode: engine.state.mode,
      scrollOffset: engine.state.scrollOffset,
      focusIndex: engine.state.focusIndex,
      wpm: CONFIG.wpm
    } : null,
    pdf: pdfViewer && pdfViewer.pdfDoc ? {
      currentPage: pdfViewer.currentPage,
      highlightingActive: pdfViewer.highlightingActive,
      currentHighlightIndex: pdfViewer.currentHighlightIndex,
      highlightWPM: pdfViewer.highlightWPM
    } : null
  };

  try {
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save state:', error);
  }
}

function loadState() {
  try {
    const stateJson = localStorage.getItem(STATE_STORAGE_KEY);
    if (!stateJson) return null;

    return JSON.parse(stateJson);
  } catch (error) {
    console.warn('Failed to load state:', error);
    return null;
  }
}

function clearState() {
  try {
    localStorage.removeItem(STATE_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear state:', error);
  }
}

// Debounced save for frequently changing state (position)
let saveStateTimeout = null;
function saveStateDebounced(delay = 500) {
  if (saveStateTimeout) {
    clearTimeout(saveStateTimeout);
  }
  saveStateTimeout = setTimeout(() => {
    saveState();
    saveStateTimeout = null;
  }, delay);
}

// =============================================================================
// BOOK LOADING FUNCTIONS
// =============================================================================

let currentBook = null;
let engine = null;
let pdfViewer = null;
let currentView = 'real'; // 'readfast' or 'real'

function switchView(view, skipSync = false) {
  currentView = view;
  saveState();

  const mainContainer = document.getElementById('main-container');
  const pdfContainer = document.getElementById('pdf-container');
  const tabReadfast = document.getElementById('tab-readfast');
  const tabReal = document.getElementById('tab-real');
  const toggleModeBtn = document.getElementById('toggle-mode');
  const playPauseBtn = document.getElementById('play-pause');
  const pdfNavButtons = document.querySelectorAll('.pdf-nav-buttons');
  const readfastNavButtons = document.querySelectorAll('.readfast-nav-buttons');

  if (view === 'readfast') {
    // Show ReadFast view
    mainContainer.style.display = 'block';
    pdfContainer.style.display = 'none';

    // Update tabs
    tabReadfast.classList.add('active');
    tabReal.classList.remove('active');

    // Show ReadFast controls
    toggleModeBtn.parentElement.style.display = 'flex';
    playPauseBtn.parentElement.style.display = 'flex';
    readfastNavButtons.forEach(btn => btn.style.display = 'flex');

    // Hide PDF controls
    pdfNavButtons.forEach(btn => btn.style.display = 'none');

    // Remove PDF event listeners and stop highlighting
    if (pdfViewer) {
      pdfViewer.removeEventListeners();
      pdfViewer.stopHighlighting();

      // Sync ReadFast position based on PDF page and highlight position (unless skipping)
      if (!skipSync && engine && engine.metrics && pdfViewer.pdfDoc) {
        const currentPage = pdfViewer.currentPage;
        const totalPages = pdfViewer.totalPages;
        const totalWords = engine.metrics.getWordCount();

        // Calculate word position based on page progress
        const pageProgress = (currentPage - 1) / totalPages;
        const estimatedWordIndex = Math.floor(pageProgress * totalWords);

        // Update engine position
        if (engine.state.mode === 'smooth') {
          const wordData = engine.metrics.getWordPositionData(estimatedWordIndex);
          if (wordData) {
            engine.state.scrollOffset = wordData.centerPosition;
            engine.renderer.render(engine.state);
          }
        } else {
          engine.state.focusIndex = Math.max(0, Math.min(estimatedWordIndex, totalWords - 1));
          engine.renderer.render(engine.state);
        }
      }
    }

    // Resume engine event listeners if needed
    if (engine) {
      // Engine listeners are always active, no need to re-add
    }

  } else if (view === 'real') {
    // Show Real PDF view
    mainContainer.style.display = 'none';
    pdfContainer.style.display = 'flex';

    // Update tabs
    tabReadfast.classList.remove('active');
    tabReal.classList.add('active');

    // Hide ReadFast controls
    toggleModeBtn.parentElement.style.display = 'none';
    playPauseBtn.parentElement.style.display = 'none';
    readfastNavButtons.forEach(btn => btn.style.display = 'none');

    // Show PDF controls
    pdfNavButtons.forEach(btn => btn.style.display = 'flex');

    // Setup PDF event listeners
    if (pdfViewer && pdfViewer.pdfDoc) {
      pdfViewer.setupEventListeners();

      // Sync page position and highlight position based on word position (unless skipping)
      if (!skipSync && engine && engine.metrics) {
        const currentWordIndex = engine.state.mode === 'smooth'
          ? findClosestWordIndex(engine.state.scrollOffset, engine.metrics)
          : engine.state.focusIndex;

        const totalWords = engine.metrics.getWordCount();
        const totalPages = pdfViewer.totalPages;

        // Calculate corresponding page (proportional mapping)
        const estimatedPage = Math.floor((currentWordIndex / totalWords) * totalPages) + 1;
        const targetPage = Math.max(1, Math.min(estimatedPage, totalPages));

        pdfViewer.goToPage(targetPage);

        // Set highlight position based on word progress
        pdfViewer.setHighlightPosition(currentWordIndex, totalWords);
      }
    }

    // Stop engine playback
    if (engine && engine.state.isPlaying) {
      engine.stop();
    }
  }
}

function findClosestWordIndex(scrollOffset, metrics) {
  let closestIndex = 0;
  let minDistance = Math.abs(scrollOffset - metrics.wordPositions[0].centerPosition);

  for (let i = 1; i < metrics.wordPositions.length; i++) {
    const distance = Math.abs(scrollOffset - metrics.wordPositions[i].centerPosition);
    if (distance < minDistance) {
      minDistance = distance;
      closestIndex = i;
    } else {
      break;
    }
  }

  return closestIndex;
}

async function loadBooks() {
  const loadingBooks = document.getElementById('loading-books');
  const booksGrid = document.getElementById('books-grid');

  try {
    loadingBooks.style.display = 'block';
    booksGrid.innerHTML = '';

    const response = await fetch(`${API_URL}/books`);
    if (!response.ok) throw new Error('Failed to fetch books');

    const books = await response.json();
    loadingBooks.style.display = 'none';

    if (books.length === 0) {
      booksGrid.innerHTML = '<p class="loading-text">No books found in the books folder</p>';
      return;
    }

    books.forEach(book => {
      const bookCard = createBookCard(book);
      booksGrid.appendChild(bookCard);
    });
  } catch (error) {
    console.error('Error loading books:', error);
    loadingBooks.style.display = 'none';
    booksGrid.innerHTML = '<p class="loading-text">Error loading books. Make sure the server is running.</p>';
  }
}

function createBookCard(book) {
  const card = document.createElement('div');
  card.className = 'book-card';
  card.dataset.filename = book.filename;

  const icon = book.type === 'pdf' ? '📕' : '📘';

  card.innerHTML = `
    <div class="book-icon">${icon}</div>
    <div class="book-info">
      <div class="book-title">${book.title}</div>
      <div class="book-type">${book.type}</div>
    </div>
  `;

  card.addEventListener('click', () => selectBook(book, card));

  return card;
}

async function selectBook(book, cardElement, startPage = 1) {
  if (book.type === 'epub') {
    alert('EPUB support coming soon! Please select a PDF file.');
    return;
  }

  // Update active state
  document.querySelectorAll('.book-card').forEach(card => card.classList.remove('active'));
  cardElement.classList.add('active');

  const loadingOverlay = document.getElementById('loading-overlay');
  loadingOverlay.classList.add('active');

  try {
    // Load text for ReadFast view
    const text = await extractPDFText(book.filename);
    const words = text.split(' ').filter(word => word.length > 0);

    if (engine) {
      engine.loadNewText(words);
    }

    // Load PDF for Real view with optional starting page
    if (pdfViewer) {
      await pdfViewer.loadPDF(book.filename, startPage);
    }

    currentBook = book;
    loadingOverlay.classList.remove('active');
    saveState();
  } catch (error) {
    console.error('Error loading book:', error);
    loadingOverlay.classList.remove('active');
    alert('Failed to extract text from PDF. Please try another book.');
  }
}

async function extractPDFText(filename) {
  try {
    const response = await fetch(`${API_URL}/books/${filename}/extract`);

    if (response.ok) {
      const data = await response.json();
      return cleanText(data.text);
    }

    return await extractPDFTextClientSide(filename);
  } catch (error) {
    console.error('Server-side extraction failed, trying client-side:', error);
    return await extractPDFTextClientSide(filename);
  }
}

async function extractPDFTextClientSide(filename) {
  const pdfUrl = `${API_URL}/books/${filename}`;
  const loadingTask = pdfjsLib.getDocument(pdfUrl);
  const pdf = await loadingTask.promise;

  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + ' ';
  }

  return cleanText(fullText);
}

function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
}

async function restoreState(savedState) {
  if (!savedState || !savedState.book) return false;

  // Set flag to indicate we're restoring state
  window._restoringState = true;

  try {
    // Find the book in the list
    const bookCard = document.querySelector(`.book-card[data-filename="${savedState.book.filename}"]`);
    if (!bookCard) {
      console.warn('Saved book not found:', savedState.book.filename);
      window._restoringState = false;
      return false;
    }

    // Load the book with saved page number
    const startPage = savedState.pdf?.currentPage || 1;
    await selectBook(savedState.book, bookCard, startPage);

    // Restore ReadFast state
    if (savedState.readfast && engine) {
      engine.state.mode = savedState.readfast.mode;
      engine.state.scrollOffset = savedState.readfast.scrollOffset;
      engine.state.focusIndex = savedState.readfast.focusIndex;

      if (savedState.readfast.wpm) {
        CONFIG.wpm = savedState.readfast.wpm;

        // Recalculate speed
        const wordInterval = 60000 / CONFIG.wpm;
        const totalWidth = engine.metrics.getLastWordCenter();
        const totalWords = engine.metrics.getWordCount();
        engine.pixelsPerMs = (totalWidth / totalWords) / wordInterval;
      }

      engine.renderer.updateModeIndicator(engine.state.mode);
      engine.renderer.render(engine.state);
    }

    // Restore PDF state (page was already loaded in selectBook)
    if (savedState.pdf && pdfViewer && pdfViewer.pdfDoc) {
      if (savedState.pdf.highlightWPM) {
        pdfViewer.highlightWPM = savedState.pdf.highlightWPM;
        const wpmInput = document.getElementById('pdf-wpm-input');
        if (wpmInput) {
          wpmInput.value = savedState.pdf.highlightWPM;
        }
      }

      if (savedState.pdf.currentHighlightIndex) {
        pdfViewer.currentHighlightIndex = savedState.pdf.currentHighlightIndex;
      }

      // Note: We don't auto-resume highlighting, user must click play
    }

    // Restore view (skip sync to preserve restored positions)
    if (savedState.view) {
      switchView(savedState.view, true); // true = skipSync

      // If switching to 'real' view, re-render the PDF page to fix any scaling issues
      // that may have occurred when the container was hidden
      if (savedState.view === 'real' && pdfViewer && pdfViewer.pdfDoc) {
        // Wait for next frame to ensure container is visible and has correct dimensions
        await new Promise(resolve => requestAnimationFrame(resolve));
        await pdfViewer.renderPage(pdfViewer.currentPage);
      }
    } else {
      // Save the final state even if view wasn't changed
      saveState();
    }

    console.log('State restored successfully');
    return true;
  } catch (error) {
    console.error('Error restoring state:', error);
    return false;
  } finally {
    // Clear the restoration flag
    window._restoringState = false;
  }
}

// =============================================================================
// HAMBURGER MENUS
// =============================================================================

function setupHamburgerMenu() {
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const booksPanel = document.getElementById('books');
  const viewerWrapper = document.getElementById('viewer-wrapper');

  let isOpen = false;

  hamburgerBtn.addEventListener('click', () => {
    isOpen = !isOpen;

    if (isOpen) {
      hamburgerBtn.classList.add('active');
      booksPanel.classList.add('open');
      viewerWrapper.classList.add('books-open');
    } else {
      hamburgerBtn.classList.remove('active');
      booksPanel.classList.remove('open');
      viewerWrapper.classList.remove('books-open');
    }
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (isOpen &&
        !booksPanel.contains(e.target) &&
        !hamburgerBtn.contains(e.target)) {
      isOpen = false;
      hamburgerBtn.classList.remove('active');
      booksPanel.classList.remove('open');
      viewerWrapper.classList.remove('books-open');
    }
  });
}

function setupControlsHamburgerMenu() {
  const controlsHamburgerBtn = document.getElementById('controls-hamburger-btn');
  const controlsPanel = document.getElementById('controls-panel');
  const viewerWrapper = document.getElementById('viewer-wrapper');

  let isOpen = false;

  controlsHamburgerBtn.addEventListener('click', () => {
    isOpen = !isOpen;

    if (isOpen) {
      controlsHamburgerBtn.classList.add('active');
      controlsPanel.classList.add('open');
      viewerWrapper.classList.add('controls-open');
    } else {
      controlsHamburgerBtn.classList.remove('active');
      controlsPanel.classList.remove('open');
      viewerWrapper.classList.remove('controls-open');
    }
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (isOpen &&
        !controlsPanel.contains(e.target) &&
        !controlsHamburgerBtn.contains(e.target)) {
      isOpen = false;
      controlsHamburgerBtn.classList.remove('active');
      controlsPanel.classList.remove('open');
      viewerWrapper.classList.remove('controls-open');
    }
  });
}

// =============================================================================
// INITIALIZATION
// =============================================================================

(async function init() {
  try {
    engine = new WordMarqueeEngine(CONFIG, SAMPLE_WORDS);
    engine.setupEventListeners();
    engine.renderer.render(engine.state);

    window.marqueeEngine = engine;

    // Initialize PDF viewer
    pdfViewer = new PDFViewer();
    window.pdfViewer = pdfViewer;

    // Expose state management for debugging
    window.clearReadFastState = clearState;

    // Setup tab switching
    const tabReadfast = document.getElementById('tab-readfast');
    const tabReal = document.getElementById('tab-real');

    if (tabReadfast) {
      tabReadfast.addEventListener('click', () => switchView('readfast'));
    }

    if (tabReal) {
      tabReal.addEventListener('click', () => switchView('real'));
    }

    // Setup hamburger menus
    setupHamburgerMenu();
    setupControlsHamburgerMenu();

    // Load books from server
    await loadBooks();

    // Try to restore saved state
    const savedState = loadState();
    if (savedState) {
      const restored = await restoreState(savedState);
      if (!restored) {
        console.log('Could not restore saved state, starting fresh');
      }
    }

    console.log('Speed Reader initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Speed Reader:', error);

    const displayArea = document.getElementById('display-area');
    if (displayArea) {
      displayArea.innerHTML = '<div style="color: white; padding: 20px;">Error initializing reader. Please check console.</div>';
    }
  }
})();
