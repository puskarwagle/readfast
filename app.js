'use strict';

// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// API Configuration
const API_URL = '/api';

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
  paging: {
    wordsPerPage: 300
  }
};

// =============================================================================
// SENTENCE UTILITIES
// =============================================================================

class SentenceDetector {
  constructor() {
    // Common abbreviations that shouldn't end sentences
    this.abbreviations = new Set([
      'Dr', 'Mr', 'Mrs', 'Ms', 'Prof', 'Sr', 'Jr',
      'etc', 'vs', 'e.g', 'i.e', 'cf', 'approx',
      'U.S', 'U.K', 'U.N', 'E.U',
      'St', 'Ave', 'Blvd', 'Rd',
      'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec',
      'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
      'Inc', 'Ltd', 'Corp', 'Co'
    ]);
  }

  // Split text into sentences
  detectSentences(text) {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const sentences = [];
    let currentSentence = '';
    let i = 0;

    while (i < text.length) {
      const char = text[i];
      currentSentence += char;

      // Check for sentence-ending punctuation
      if (char === '.' || char === '!' || char === '?') {
        // Look ahead to see what comes next
        const nextChar = text[i + 1];
        const afterSpace = text[i + 2];

        // Check if this is likely an abbreviation
        const words = currentSentence.trim().split(/\s+/);
        const lastWord = words[words.length - 1];
        const isAbbreviation = this.abbreviations.has(lastWord.replace(/\.$/, ''));

        // End sentence if:
        // 1. Not an abbreviation AND
        // 2. (Next char is space/newline/end OR next char is closing quote followed by space/end) AND
        // 3. (After space is uppercase OR end of text OR another punctuation)
        if (!isAbbreviation) {
          const nextIsWhitespace = !nextChar || /\s/.test(nextChar);
          const nextIsQuote = nextChar === '"' || nextChar === "'";
          const afterSpaceIsUpper = afterSpace && /[A-Z]/.test(afterSpace);
          const isEndOfText = i === text.length - 1;

          if ((nextIsWhitespace || nextIsQuote) && (afterSpaceIsUpper || isEndOfText || !nextChar)) {
            sentences.push(currentSentence.trim());
            currentSentence = '';
          }
        }
      }

      i++;
    }

    // Add any remaining text as the last sentence
    if (currentSentence.trim().length > 0) {
      sentences.push(currentSentence.trim());
    }

    return sentences;
  }
}

// Sample text as fallback
const SAMPLE_WORDS = [
  "Welcome", "to", "Capsicum", "Speed", "Reader", "Select", "a", "book", "from", "the", "left",
  "sidebar", "to", "start", "reading", "You", "can", "toggle", "between", "word",
  "and", "sentence", "modes", "using", "the", "button", "below", "Use", "your", "mouse",
  "wheel", "to", "manually", "scroll", "through", "the", "text",
  "Press", "the", "play", "button", "to", "start", "automatic", "reading"
];

// =============================================================================
// WORDMETRICS CLASS
// =============================================================================

/**
 * Handles word measurements and position calculations.
 */
class WordMetrics {
  /**
   * @param {string[]} words - Array of words to process
   * @param {Object} config - Configuration object
   */
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

    /**
     * @type {Array<{
     *   word: string,
     *   index: number,
     *   startPosition: number,
     *   width: number,
     *   middleLetterOffset: number,
     *   centerPosition: number
     * }>}
     */
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
  constructor(config, metrics, sentenceWordMap = []) {
    this.config = config;
    this.metrics = metrics;
    this.sentenceWordMap = sentenceWordMap;

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

  _renderSentenceMode(state) {
    const sentenceIndex = state.sentenceIndex || 0;

    if (sentenceIndex < 0 || sentenceIndex >= this.sentenceWordMap.length) {
      return;
    }

    const sentenceMap = this.sentenceWordMap[sentenceIndex];
    if (!sentenceMap) return;

    const fragment = document.createDocumentFragment();

    // Create a centered container for the sentence
    const sentenceDiv = document.createElement('div');
    sentenceDiv.className = 'sentence-container';
    sentenceDiv.style.position = 'absolute';
    sentenceDiv.style.top = '50%';
    sentenceDiv.style.left = '50%';
    sentenceDiv.style.transform = 'translate(-50%, -50%)';
    sentenceDiv.style.width = '90%';
    sentenceDiv.style.textAlign = 'center';
    sentenceDiv.style.fontSize = '24px';
    sentenceDiv.style.lineHeight = '1.6';
    sentenceDiv.style.color = 'var(--text-color)';
    sentenceDiv.style.padding = '20px';

    // Highlight all words in the sentence
    const words = sentenceMap.text.split(/\s+/).filter(w => w.length > 0);
    words.forEach((word, index) => {
      const wordSpan = document.createElement('span');
      wordSpan.textContent = word;
      wordSpan.style.background = 'rgba(255, 255, 255, 0.1)';
      wordSpan.style.padding = '2px 4px';
      wordSpan.style.margin = '0 2px';
      wordSpan.style.borderRadius = '3px';
      wordSpan.style.transition = 'background 0.2s';

      sentenceDiv.appendChild(wordSpan);

      if (index < words.length - 1) {
        sentenceDiv.appendChild(document.createTextNode(' '));
      }
    });

    fragment.appendChild(sentenceDiv);

    this.elements.displayArea.innerHTML = '';
    this.elements.displayArea.appendChild(fragment);

    // Update page info
    if (this.elements.pageInfo) {
      const totalSentences = this.sentenceWordMap.length;
      this.elements.pageInfo.textContent = `Sentence ${sentenceIndex + 1} of ${totalSentences}`;
    }
  }

  render(state) {
    if (!this.elements.displayArea) return;

    try {
      if (state.mode === 'sentence') {
        this._renderSentenceMode(state);
        return;
      }

      const renderData = this._prepareRenderData(state);
      this._updateAccessibility(renderData.focusWordData);
      this._renderWordMode(renderData);
    } catch (error) {
      console.error('RenderEngine: Error during render', error);
    }
  }

  _prepareRenderData(state) {
    const focusIndex = state.focusIndex;
    const focusWordData = this.metrics.getWordPositionData(focusIndex);

    if (!focusWordData) {
      throw new Error('Invalid focus word data');
    }

    const scrollOffset = focusWordData.centerPosition;
    const globalOffset = this.centerX - scrollOffset;

    return {
      focusIndex,
      focusWordData,
      globalOffset,
      scrollOffset
    };
  }

  _updateAccessibility(focusWordData) {
    if (this.elements.currentWordAria) {
      this.elements.currentWordAria.textContent = focusWordData.word;
    }
  }

  _renderWordMode(renderData) {
    const { focusIndex, focusWordData, globalOffset } = renderData;

    const visibleWords = this._getVisibleWords(focusIndex, globalOffset);
    this.updatePageInfo(focusIndex);

    const fragment = document.createDocumentFragment();
    this._renderPastLines(fragment, visibleWords.pastLines);
    this._renderFocusLine(fragment, focusWordData, globalOffset, visibleWords.pastOnLine, visibleWords.futureOnLine);
    this._renderFutureLines(fragment, visibleWords.futureLines);

    this.elements.displayArea.innerHTML = '';
    this.elements.displayArea.appendChild(fragment);
  }

  _getVisibleWords(focusIndex, globalOffset) {
    const pastOnLine = this._getPastWordsOnFocusLine(focusIndex, globalOffset);
    const futureOnLine = this._getFutureWordsOnFocusLine(focusIndex, globalOffset);

    const pastLines = this._calculatePastLines(focusIndex - pastOnLine.length - 1);
    const futureLines = this._calculateFutureLines(focusIndex + futureOnLine.length + 1);

    return { pastOnLine, futureOnLine, pastLines, futureLines };
  }

  _getPastWordsOnFocusLine(focusIndex, globalOffset) {
    const words = [];

    for (let i = focusIndex - 1; i >= 0; i--) {
      const wordData = this.metrics.getWordPositionData(i);
      if (!wordData) break;

      const x = globalOffset + wordData.startPosition;
      const width = wordData.width;

      if (x + width < 0) break;

      words.unshift({ word: wordData.word, index: i, x });
    }

    return words;
  }

  _getFutureWordsOnFocusLine(focusIndex, globalOffset) {
    const words = [];

    for (let i = focusIndex + 1; i < this.metrics.getWordCount(); i++) {
      const wordData = this.metrics.getWordPositionData(i);
      if (!wordData) break;

      const x = globalOffset + wordData.startPosition;
      const width = wordData.width;

      if (x > this.containerWidth) break;

      words.push({ word: wordData.word, index: i, x });
    }

    return words;
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
      if (mode === 'word') {
        toggleBtn.textContent = 'Word';
      } else if (mode === 'sentence') {
        toggleBtn.textContent = 'Sentence';
      }
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

    // Calculate approximate page
    const wordsPerPage = this.config.paging.wordsPerPage;
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
      // Initialize sentence detector first
      this.sentenceDetector = new SentenceDetector();
      this.sentences = [];
      this.sentenceWordMap = [];
      this.renderer = new RenderEngine(config, this.metrics, this.sentenceWordMap);
    } catch (error) {
      throw new Error(`WordMarqueeEngine: Initialization failed - ${error.message}`);
    }

    this.state = {
      mode: 'word', // 'word' or 'sentence'
      isPlaying: false,
      focusIndex: 0,
      sentenceIndex: 0,
      lastTimestamp: null
    };

    // Initialize sentences
    this._initializeSentences();

    this.intervalId = null;
    this.eventListeners = [];

    this._boundAdvanceWord = this._advanceWord.bind(this);
    this._boundAdvanceSentence = this._advanceSentence.bind(this);
    this._boundHandleWheel = this._handleWheel.bind(this);
    this._boundNextPage = this._nextPage.bind(this);
    this._boundPrevPage = this._prevPage.bind(this);
  }

  setSpeed(value) {
    this.config.wpm = value;
    // Restart interval/timeout if playing
    if (this.state.isPlaying) {
      if (this.state.mode === 'word') {
        clearInterval(this.intervalId);
        const wordInterval = 60000 / this.config.wpm;
        this.intervalId = setInterval(this._boundAdvanceWord, wordInterval);
      } else if (this.state.mode === 'sentence') {
        // No simple interval for sentence mode as it varies per sentence
        // But the next advanceSentence call will use the new WPM
      }
    }
    saveState();
  }

  getSpeed() {
    return this.config.wpm;
  }

  _initializeSentences() {
    // Convert words array to text
    const text = this.words.join(' ');
    this.sentences = this.sentenceDetector.detectSentences(text);

    // Map each sentence to its word indices
    this.sentenceWordMap = [];
    let wordIndex = 0;

    this.sentences.forEach((sentence, sentenceIdx) => {
      const sentenceWords = sentence.split(/\s+/).filter(w => w.length > 0);
      const startWordIndex = wordIndex;
      const endWordIndex = wordIndex + sentenceWords.length - 1;

      this.sentenceWordMap.push({
        sentenceIndex: sentenceIdx,
        startWordIndex,
        endWordIndex,
        text: sentence
      });

      wordIndex += sentenceWords.length;
    });
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

    // Initialize sentences before creating renderer
    this._initializeSentences();

    this.renderer = new RenderEngine(this.config, this.metrics, this.sentenceWordMap);

    // Reset state
    this.state = {
      mode: this.state.mode, // Preserve mode
      isPlaying: false,
      focusIndex: 0,
      sentenceIndex: 0,
      lastTimestamp: null
    };

    // Re-setup event listeners
    this.setupEventListeners();

    // Render initial state
    this.renderer.render(this.state);
    this.renderer.updateModeIndicator(this.state.mode);
    this.updateSpeedUI();
    this.renderer.updatePlayPauseButton(false);

    console.log('Text loaded:', words.length, 'words,', this.sentences.length, 'sentences');
  }

  start() {
    if (this.state.isPlaying) {
      return;
    }

    try {
      this.state.isPlaying = true;
      this.renderer.updatePlayPauseButton(true);

      if (this.state.mode === 'sentence') {
        // Sentence mode: calculate interval based on sentence length
        this._advanceSentence();
      } else {
        // Word mode
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

    if (this.intervalId) {
      clearInterval(this.intervalId);
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }

    this.state.lastTimestamp = null;
  }

  toggleMode() {
    const wasPlaying = this.state.isPlaying;
    this.stop();

    try {
      const currentFocusIndex = this.state.focusIndex;

      // Cycle through modes: word -> sentence -> word
      if (this.state.mode === 'word') {
        this.state.mode = 'sentence';

        // Find which sentence contains the current word
        this.state.sentenceIndex = 0;
        for (let i = 0; i < this.sentenceWordMap.length; i++) {
          const sentenceMap = this.sentenceWordMap[i];
          if (currentFocusIndex >= sentenceMap.startWordIndex &&
              currentFocusIndex <= sentenceMap.endWordIndex) {
            this.state.sentenceIndex = i;
            this.state.focusIndex = sentenceMap.startWordIndex;
            break;
          }
        }
      } else {
        // sentence -> word
        this.state.mode = 'word';
      }

      this.renderer.updateModeIndicator(this.state.mode);
      this.updateSpeedUI();
      this.renderer.render(this.state);

      if (wasPlaying) {
        this.start();
      }

      saveState();
    } catch (error) {
      console.error('WordMarqueeEngine: Error toggling mode', error);
    }
  }

  updateSpeedUI() {
    const slider = document.getElementById('speed-slider');
    const label = document.getElementById('speed-value');
    if (slider && label) {
      const speed = this.getSpeed();
      slider.value = speed;
      label.textContent = `${speed} wpm`;
    }
  }

  togglePlayPause() {
    if (this.state.isPlaying) {
      this.stop();
    } else {
      this.start();
    }
  }

  _nextPage() {
    if (this.state.mode === 'sentence') {
      // In sentence mode, jump forward by 10 sentences
      const jumpSize = 10;
      const newIndex = Math.min(
        this.state.sentenceIndex + jumpSize,
        this.sentenceWordMap.length - 1
      );

      this.state.sentenceIndex = newIndex;
      const sentenceMap = this.sentenceWordMap[newIndex];
      if (sentenceMap) {
        this.state.focusIndex = sentenceMap.startWordIndex;
      }
      this.renderer.render(this.state);
      saveState();
      return;
    }

    // Calculate words per page
    const wordsPerPage = this.config.paging.wordsPerPage;
    const totalWords = this.metrics.getWordCount();
    const currentWordIndex = this.state.focusIndex;

    // Calculate next page start
    const currentPage = Math.floor(currentWordIndex / wordsPerPage);
    const nextPageStart = Math.min((currentPage + 1) * wordsPerPage, totalWords - 1);

    // Jump to next page
    this.state.focusIndex = nextPageStart;
    this.renderer.render(this.state);
    saveState();
  }

  _prevPage() {
    if (this.state.mode === 'sentence') {
      // In sentence mode, jump backward by 10 sentences
      const jumpSize = 10;
      const newIndex = Math.max(this.state.sentenceIndex - jumpSize, 0);

      this.state.sentenceIndex = newIndex;
      const sentenceMap = this.sentenceWordMap[newIndex];
      if (sentenceMap) {
        this.state.focusIndex = sentenceMap.startWordIndex;
      }
      this.renderer.render(this.state);
      saveState();
      return;
    }

    // Calculate words per page
    const wordsPerPage = this.config.paging.wordsPerPage;
    const currentWordIndex = this.state.focusIndex;

    // Calculate previous page start
    const currentPage = Math.floor(currentWordIndex / wordsPerPage);
    const prevPageStart = Math.max((currentPage - 1) * wordsPerPage, 0);

    // Jump to previous page
    this.state.focusIndex = prevPageStart;
    this.renderer.render(this.state);
    saveState();
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

  _advanceSentence() {
    try {
      if (this.state.sentenceIndex < this.sentenceWordMap.length - 1) {
        this.state.sentenceIndex++;
        const sentenceMap = this.sentenceWordMap[this.state.sentenceIndex];
        if (sentenceMap) {
          this.state.focusIndex = sentenceMap.startWordIndex;
        }
        this.renderer.render(this.state);
        saveStateDebounced(2000); // Save every 2 seconds during playback

        // Calculate delay based on sentence word count and WPM
        const wordCount = sentenceMap.text.split(/\s+/).filter(w => w.length > 0).length;
        const wordsPerMinute = this.config.wpm;
        const delayMs = (wordCount / wordsPerMinute) * 60000;

        // Schedule next sentence advance if still playing
        if (this.state.isPlaying && this.state.mode === 'sentence') {
          this.intervalId = setTimeout(this._boundAdvanceSentence, delayMs);
        }
      } else {
        // Reached the end
        this.stop();
        saveState();
      }
    } catch (error) {
      console.error('WordMarqueeEngine: Error advancing sentence', error);
      this.stop();
    }
  }

  _handleWheel(event) {
    event.preventDefault();

    try {
      if (this.state.mode === 'sentence') {
        // Navigate between sentences
        if (event.deltaY > 0) {
          // Scroll down = previous sentence
          if (this.state.sentenceIndex > 0) {
            this.state.sentenceIndex--;
            const sentenceMap = this.sentenceWordMap[this.state.sentenceIndex];
            if (sentenceMap) {
              this.state.focusIndex = sentenceMap.startWordIndex;
            }
            this.renderer.render(this.state);
            saveStateDebounced();
          }
        } else if (event.deltaY < 0) {
          // Scroll up = next sentence
          if (this.state.sentenceIndex < this.sentenceWordMap.length - 1) {
            this.state.sentenceIndex++;
            const sentenceMap = this.sentenceWordMap[this.state.sentenceIndex];
            if (sentenceMap) {
              this.state.focusIndex = sentenceMap.startWordIndex;
            }
            this.renderer.render(this.state);
            saveStateDebounced();
          }
        }
      } else {
        // Word mode
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

  _addEventListener(target, event, handler) {
    target.addEventListener(event, handler);
    this.eventListeners.push({ target, event, handler });
  }

  setupEventListeners() {
    const toggleModeBtn = document.getElementById('toggle-mode');
    const playPauseBtn = document.getElementById('play-pause');
    const nextPageBtn = document.getElementById('readfast-next');
    const prevPageBtn = document.getElementById('readfast-prev');
    const speedSlider = document.getElementById('speed-slider');
    const container = this.renderer.elements.container;

    if (toggleModeBtn) {
      this._addEventListener(toggleModeBtn, 'click', () => this.toggleMode());
    }

    if (speedSlider) {
      this._addEventListener(speedSlider, 'input', (e) => {
        const value = parseInt(e.target.value);
        this.setSpeed(value);
        this.updateSpeedUI();
      });
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
    }
  }

  destroy() {
    this.stop();

    this.eventListeners.forEach(({ target, event, handler }) => {
      target.removeEventListener(event, handler);
    });
    this.eventListeners = [];

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
    this.zoomLevel = 1;
    this.minZoom = 0.5;
    this.maxZoom = 3;

    this._boundHandleKeydown = this._handleKeydown.bind(this);
    this._boundHandleWheel = this._handleWheel.bind(this);
    this._boundPrevPage = () => this.prevPage();
    this._boundNextPage = () => this.nextPage();
    this._boundToggleHighlight = () => this.toggleHighlighting();
    this._boundAdvanceHighlight = this._advanceHighlight.bind(this);
    this._boundZoomIn = () => this.zoomIn();
    this._boundZoomOut = () => this.zoomOut();
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
    if (!this._canRender()) return;

    this.isRendering = true;
    this.stopHighlighting();

    try {
      const page = await this.pdfDoc.getPage(pageNumber);
      const viewport = this._calculateViewport(page);

      if (!viewport) {
        this._skipRender(pageNumber);
        return;
      }

      this._configureCanvas(viewport);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      await this._renderPageContent(page, viewport);
      await this.renderTextLayer(page, viewport);

      this._updatePageState(pageNumber);
    } catch (error) {
      console.error('Error rendering page:', error);
    } finally {
      this.isRendering = false;
    }
  }

  _canRender() {
    return this.pdfDoc && !this.isRendering;
  }

  _calculateViewport(page) {
    const { width, height } = this._getContainerDimensions();

    if (width <= 0 || height <= 0) {
      return null;
    }

    const viewport = page.getViewport({ scale: 1 });
    const scale = this._calculateOptimalScale(viewport, width, height);
    this.currentScale = scale;

    return page.getViewport({ scale });
  }

  _getContainerDimensions() {
    const PADDING = { horizontal: 40, vertical: 80 };
    return {
      width: this.container.offsetWidth - PADDING.horizontal,
      height: this.container.offsetHeight - PADDING.vertical
    };
  }

  _calculateOptimalScale(viewport, containerWidth, containerHeight) {
    // Base scale to fit page in container
    const scaleX = containerWidth / viewport.width;
    const scaleY = containerHeight / viewport.height;
    const baseScale = Math.min(scaleX, scaleY);

    // Apply zoom level
    return baseScale * this.zoomLevel;
  }

  _configureCanvas(viewport) {
    const outputScale = window.devicePixelRatio || 1;

    this.canvas.width = Math.floor(viewport.width * outputScale);
    this.canvas.height = Math.floor(viewport.height * outputScale);
    this.canvas.style.width = `${Math.floor(viewport.width)}px`;
    this.canvas.style.height = `${Math.floor(viewport.height)}px`;
  }

  async _renderPageContent(page, viewport) {
    const outputScale = window.devicePixelRatio || 1;
    const transform = outputScale !== 1
      ? [outputScale, 0, 0, outputScale, 0, 0]
      : null;

    const renderContext = {
      canvasContext: this.ctx,
      transform,
      viewport
    };

    await page.render(renderContext).promise;
  }

  _skipRender(pageNumber) {
    console.log('Container hidden, skipping render');
    this.currentPage = pageNumber;
    this.isRendering = false;
  }

  _updatePageState(pageNumber) {
    this.currentPage = pageNumber;
    this.updatePageInfo();

    if (!window._restoringState) {
      saveState();
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
    // Check if it's a pinch zoom gesture (ctrl/cmd + wheel)
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const delta = -event.deltaY;
      if (delta > 0) {
        this.zoomIn(0.1);
      } else {
        this.zoomOut(0.1);
      }
      return;
    }

    event.preventDefault();

    if (event.deltaY > 0) {
      this.nextPage();
    } else if (event.deltaY < 0) {
      this.prevPage();
    }
  }

  zoomIn() {
    this.zoomLevel = Math.min(this.zoomLevel + 0.25, this.maxZoom);
    this.renderPage(this.currentPage);
    saveState();
  }

  zoomOut() {
    this.zoomLevel = Math.max(this.zoomLevel - 0.25, this.minZoom);
    this.renderPage(this.currentPage);
    saveState();
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
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');

    if (prevBtn) {
      prevBtn.addEventListener('click', this._boundPrevPage);
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', this._boundNextPage);
    }

    if (highlightBtn) {
      highlightBtn.addEventListener('click', this._boundToggleHighlight);
    }

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', this._boundZoomIn);
    } else {
      console.warn('PDFViewer: zoom-in button not found');
    }

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', this._boundZoomOut);
    } else {
      console.warn('PDFViewer: zoom-out button not found');
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
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');

    if (prevBtn) {
      prevBtn.removeEventListener('click', this._boundPrevPage);
    }

    if (nextBtn) {
      nextBtn.removeEventListener('click', this._boundNextPage);
    }

    if (highlightBtn) {
      highlightBtn.removeEventListener('click', this._boundToggleHighlight);
    }

    if (zoomInBtn) {
      zoomInBtn.removeEventListener('click', this._boundZoomIn);
    }

    if (zoomOutBtn) {
      zoomOutBtn.removeEventListener('click', this._boundZoomOut);
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
      focusIndex: engine.state.focusIndex,
      sentenceIndex: engine.state.sentenceIndex,
      wpm: CONFIG.wpm
    } : null,
    pdf: pdfViewer && pdfViewer.pdfDoc ? {
      currentPage: pdfViewer.currentPage,
      highlightingActive: pdfViewer.highlightingActive,
      currentHighlightIndex: pdfViewer.currentHighlightIndex,
      highlightWPM: pdfViewer.highlightWPM,
      zoomLevel: pdfViewer.zoomLevel
    } : null,
    ui: {
      booksPanelOpen: document.getElementById('books')?.classList.contains('open') || false,
      controlsPanelOpen: document.getElementById('controls-panel')?.classList.contains('open') || false,
      textColor: currentTextColor,
      bgColor: currentBgColor
    }
  };

  try {
    sessionStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save state:', error);
  }
}

function loadState() {
  try {
    const stateJson = sessionStorage.getItem(STATE_STORAGE_KEY);
    if (!stateJson) return null;

    return JSON.parse(stateJson);
  } catch (error) {
    console.warn('Failed to load state:', error);
    return null;
  }
}

function clearState() {
  try {
    sessionStorage.removeItem(STATE_STORAGE_KEY);
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
        engine.state.focusIndex = Math.max(0, Math.min(estimatedWordIndex, totalWords - 1));
        engine.renderer.render(engine.state);
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
    if (pdfViewer) {
      pdfViewer.setupEventListeners();
    }

    // Ensure controls panel is open for easy access to zoom buttons
    const controlsPanel = document.getElementById('controls-panel');
    const controlsHamburger = document.getElementById('controls-hamburger-btn');
    if (controlsPanel && controlsHamburger && !controlsPanel.classList.contains('open')) {
      controlsHamburger.click();
    }

    if (pdfViewer && pdfViewer.pdfDoc) {
      // Sync page position and highlight position based on word position (unless skipping)
      if (!skipSync && engine && engine.metrics) {
        const currentWordIndex = engine.state.focusIndex;
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
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Select book: ${book.title}`);

  const icon = book.type === 'pdf' ? '📕' : '📘';

  card.innerHTML = `
    <div class="book-icon">${icon}</div>
    <div class="book-info">
      <div class="book-title">${book.title}</div>
      <div class="book-type">${book.type}</div>
    </div>
  `;

  card.addEventListener('click', () => selectBook(book, card));

  // Add keyboard support for accessibility
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectBook(book, card);
    }
  });

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

// =============================================================================
// STATE RESTORATION CLASS
// =============================================================================

class StateRestoration {
  constructor(savedState) {
    this.savedState = savedState;
    this.bookCard = null;
  }

  async execute() {
    window._restoringState = true;

    try {
      if (!await this._loadBook()) return false;

      await this._restoreReadFastState();
      await this._restorePDFState();
      this._restoreUIState();
      await this._restoreView();

      console.log('State restored successfully');
      return true;
    } catch (error) {
      console.error('Error restoring state:', error);
      return false;
    } finally {
      window._restoringState = false;
    }
  }

  async _loadBook() {
    this.bookCard = this._findBookCard();

    if (!this.bookCard) {
      console.warn('Saved book not found:', this.savedState.book.filename);
      return false;
    }

    const startPage = this.savedState.pdf?.currentPage || 1;
    await selectBook(this.savedState.book, this.bookCard, startPage);
    return true;
  }

  _findBookCard() {
    return document.querySelector(
      `.book-card[data-filename="${this.savedState.book.filename}"]`
    );
  }

  async _restoreReadFastState() {
    const readfastState = this.savedState.readfast;
    if (!readfastState || !engine) return;

    engine.state.mode = readfastState.mode;
    engine.state.focusIndex = readfastState.focusIndex;
    engine.state.sentenceIndex = readfastState.sentenceIndex || 0;

    if (readfastState.wpm) {
      CONFIG.wpm = readfastState.wpm;
    }

    engine.updateSpeedUI();
    engine.renderer.updateModeIndicator(engine.state.mode);
    engine.renderer.render(engine.state);
  }

  async _restorePDFState() {
    const pdfState = this.savedState.pdf;
    if (!pdfState || !pdfViewer?.pdfDoc) return;

    this._restorePDFSettings(pdfState);
  }

  _restorePDFSettings(pdfState) {
    if (pdfState.highlightWPM) {
      pdfViewer.highlightWPM = pdfState.highlightWPM;
      this._updateWPMInput(pdfState.highlightWPM);
    }

    if (pdfState.currentHighlightIndex) {
      pdfViewer.currentHighlightIndex = pdfState.currentHighlightIndex;
    }

    if (pdfState.zoomLevel !== undefined) {
      pdfViewer.zoomLevel = pdfState.zoomLevel;
    }
  }

  _updateWPMInput(wpm) {
    const wpmInput = document.getElementById('pdf-wpm-input');
    if (wpmInput) {
      wpmInput.value = wpm;
    }
  }

  _restoreUIState() {
    const uiState = this.savedState.ui;
    if (!uiState) return;

    this._restoreColors(uiState);
  }

  _restoreColors(uiState) {
    if (uiState.textColor) {
      currentTextColor = uiState.textColor;
      this._updateColorInput('text-color', uiState.textColor);
    }

    if (uiState.bgColor) {
      currentBgColor = uiState.bgColor;
      this._updateColorInput('bg-color', uiState.bgColor);
    }

    applyColors();
  }

  _updateColorInput(id, value) {
    const input = document.getElementById(id);
    if (input) {
      input.value = value;
    }
  }

  async _restoreView() {
    const view = this.savedState.view || 'readfast';
    switchView(view, true);

    if (view === 'real' && pdfViewer?.pdfDoc) {
      await this._ensurePDFRendered();
    } else {
      saveState();
    }
  }

  async _ensurePDFRendered() {
    await new Promise(resolve => requestAnimationFrame(resolve));
    await pdfViewer.renderPage(pdfViewer.currentPage);
  }
}

async function restoreState(savedState) {
  if (!savedState || !savedState.book) return false;

  const restoration = new StateRestoration(savedState);
  return await restoration.execute();
}

// =============================================================================
// HAMBURGER MENUS
// =============================================================================

function setupHamburgerMenu(initialState = false) {
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const booksPanel = document.getElementById('books');
  const viewerWrapper = document.getElementById('viewer-wrapper');
  const controlsPanel = document.getElementById('controls-panel');
  const controlsHamburgerBtn = document.getElementById('controls-hamburger-btn');

  let isOpen = initialState;

  // Apply initial state
  if (isOpen) {
    hamburgerBtn.classList.add('active');
    booksPanel.classList.add('open');
    viewerWrapper.classList.add('books-open');
  }

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
    saveState();
  });

  // Removed auto-close on outside click
}

function setupControlsHamburgerMenu(initialState = false) {
  const controlsHamburgerBtn = document.getElementById('controls-hamburger-btn');
  const controlsPanel = document.getElementById('controls-panel');
  const viewerWrapper = document.getElementById('viewer-wrapper');
  const booksPanel = document.getElementById('books');
  const hamburgerBtn = document.getElementById('hamburger-btn');

  let isOpen = initialState;

  // Apply initial state
  if (isOpen) {
    controlsHamburgerBtn.classList.add('active');
    controlsPanel.classList.add('open');
    viewerWrapper.classList.add('controls-open');
  }

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
    saveState();
  });

  // Removed auto-close on outside click
}

// =============================================================================
// COLOR CONTROLS
// =============================================================================

let currentTextColor = '#ffffff';
let currentBgColor = '#000000';

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 0, g: 0, b: 0 };
}

function applyColors() {
  // Update CSS Variables for ReadFast mode
  document.documentElement.style.setProperty('--bg-color', currentBgColor);
  document.documentElement.style.setProperty('--text-color', currentTextColor);

  // Update SVG Filter for Real PDF mode
  const matrix = document.getElementById('pdf-recolor-matrix');
  if (matrix) {
    const bg = hexToRgb(currentBgColor);
    const text = hexToRgb(currentTextColor);

    // Map White (Paper) -> BgColor
    // Map Black (Text) -> TextColor
    // Out = In * (Bg - Text) + Text
    
    const rScale = bg.r - text.r;
    const gScale = bg.g - text.g;
    const bScale = bg.b - text.b;

    // Use a clean matrix string
    const value = [
      rScale, 0, 0, 0, text.r,
      0, gScale, 0, 0, text.g,
      0, 0, bScale, 0, text.b,
      0, 0, 0, 1, 0
    ].join(' ');

    matrix.setAttribute('values', value);
  }

  saveState();
}

function setupColorControls() {
  const textColorInput = document.getElementById('text-color');
  const bgColorInput = document.getElementById('bg-color');

  if (textColorInput) {
    textColorInput.addEventListener('input', (e) => {
      currentTextColor = e.target.value;
      applyColors();
    });
  }

  if (bgColorInput) {
    bgColorInput.addEventListener('input', (e) => {
      currentBgColor = e.target.value;
      applyColors();
    });
  }
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

    // Load books from server
    await loadBooks();

    // Setup color controls
    setupColorControls();
    
    // Apply default colors immediately
    applyColors();

    // Try to restore saved state
    const savedState = loadState();

    // Setup hamburger menus with saved state
    const booksPanelOpen = savedState?.ui?.booksPanelOpen || false;
    const controlsPanelOpen = savedState?.ui?.controlsPanelOpen || false;
    setupHamburgerMenu(booksPanelOpen);
    setupControlsHamburgerMenu(controlsPanelOpen);

    if (savedState) {
      const restored = await restoreState(savedState);
      if (!restored) {
        console.log('Could not restore saved state, starting fresh');
        // Initialize the default view properly
        switchView(currentView, true);
      }
    } else {
      // No saved state - initialize default view
      switchView(currentView, true);
    }

    console.log('Speed Reader initialized successfully');

    // Validate initialization state
    if (currentView === 'real' && pdfViewer && !pdfViewer.listenersActive) {
      console.warn('⚠️ PDF viewer is in Real view but event listeners are not active');
      console.warn('This may cause zoom buttons and navigation to not work');
    }
  } catch (error) {
    console.error('Failed to initialize Speed Reader:', error);

    const displayArea = document.getElementById('display-area');
    if (displayArea) {
      displayArea.innerHTML = '<div style="color: var(--text-color); padding: 20px;">Error initializing reader. Please check console.</div>';
    }
  }
})();
