// API Configuration
const API_URL = 'http://localhost:3000/api';

// Sample text as fallback
const sampleText = `The art of speed reading transforms how we consume information. By training your eyes and brain to process words more efficiently, you can dramatically increase your reading speed while maintaining comprehension. This technique involves reducing subvocalization, expanding your visual span, and minimizing regression. With practice, most people can double or triple their reading speed. The key is consistent practice and gradually increasing your pace as you become more comfortable with the technique.`;

// State
let words = sampleText.split(' ');
let currentWordIndex = 0;
let isPlaying = false;
let wpm = 250;
let interval = null;
let controlsTimeout = null;
let currentBook = null;

// DOM Elements
const flowingText = document.getElementById('flowing-text');
const flowingTextWrapper = document.getElementById('flowing-text-wrapper');
const focalPoint = document.getElementById('focal-point');
const textContainer = document.getElementById('text-container');
const resizeHandle = document.getElementById('resize-handle');
const playPauseBtn = document.getElementById('play-pause-btn');
const playIcon = document.getElementById('play-icon');
const pauseIcon = document.getElementById('pause-icon');
const speedSlider = document.getElementById('speed-slider');
const wpmValue = document.getElementById('wpm-value');
const controls = document.getElementById('controls');
const selectBookBtn = document.getElementById('select-book-btn');
const bookModal = document.getElementById('book-modal');
const closeModalBtn = document.getElementById('close-modal');
const booksGrid = document.getElementById('books-grid');
const loadingBooks = document.getElementById('loading-books');
const loadingOverlay = document.getElementById('loading-overlay');

// Animation state
let animationFrame = null;
let currentOffset = 0;
let textHeight = 0;

// Render text as natural paragraphs
function renderAllWords() {
    // Split into paragraphs (for now, simple approach - every ~10 sentences)
    const text = words.join(' ');

    // Simple paragraph splitting by periods followed by space
    const sentences = text.split(/\.\s+/);
    let paragraphs = [];
    let currentPara = '';

    sentences.forEach((sentence, i) => {
        currentPara += sentence + (i < sentences.length - 1 ? '. ' : '');

        // Create paragraph every 3-5 sentences
        if ((i + 1) % 4 === 0 || i === sentences.length - 1) {
            if (currentPara.trim()) {
                paragraphs.push(currentPara.trim());
            }
            currentPara = '';
        }
    });

    // If no paragraphs were created, just use the whole text
    if (paragraphs.length === 0) {
        paragraphs = [text];
    }

    // Render as paragraphs
    flowingText.innerHTML = paragraphs.map(p => `<p>${p}</p>`).join('');

    // Start from bottom (off screen)
    currentOffset = 0;

    // Wait for render, then measure height
    setTimeout(() => {
        textHeight = flowingText.scrollHeight;
        updatePosition();
    }, 50);
}

// Update position and highlight center line
function updatePosition() {
    if (words.length === 0) return;
    flowingText.style.transform = `translateY(${currentOffset}px)`;
    highlightCenterLine();
}

function highlightCenterLine() {
    // Remove previous highlights
    flowingText.querySelectorAll('.center-line').forEach(el => {
        el.classList.remove('center-line');
    });

    const containerRect = textContainer.getBoundingClientRect();
    const centerY = containerRect.top + containerRect.height / 2;
    const centerX = containerRect.left + containerRect.width / 2;

    // Find text nodes at center
    const range = document.caretRangeFromPoint ?
        document.caretRangeFromPoint(centerX, centerY) :
        null;

    if (range && range.startContainer) {
        let node = range.startContainer;
        // Get the parent element (should be a <p>)
        while (node && node.nodeType !== 1) {
            node = node.parentNode;
        }
        if (node && node.tagName === 'P' && flowingText.contains(node)) {
            node.classList.add('center-line');
        }
    }
}

function startReading() {
    if (animationFrame) return;

    const pixelsPerSecond = calculateSpeed();
    let lastTime = performance.now();

    function animate(currentTime) {
        const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
        lastTime = currentTime;

        // Move text upward (decrease Y offset)
        currentOffset -= pixelsPerSecond * deltaTime;

        // Check if text has scrolled too far up (end of text)
        if (currentOffset < -(textHeight + window.innerHeight)) {
            // Loop back to start
            currentOffset = 0;
        }

        updatePosition();

        if (isPlaying) {
            animationFrame = requestAnimationFrame(animate);
        }
    }

    animationFrame = requestAnimationFrame(animate);
}

function calculateSpeed() {
    // Proper WPM to pixels/second conversion
    // Total words in text
    const totalWords = words.length;

    if (totalWords === 0 || textHeight === 0) {
        console.warn('calculateSpeed: textHeight or words is 0', { textHeight, totalWords });
        return 0;
    }

    // Time to read entire text at current WPM (in seconds)
    const timeToReadInSeconds = (totalWords / wpm) * 60;

    // Pixels per second = total distance / total time
    const pixelsPerSecond = textHeight / timeToReadInSeconds;

    console.log('Speed calc:', { totalWords, wpm, textHeight, pixelsPerSecond });

    return pixelsPerSecond;
}

function stopReading() {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
}

function togglePlayPause() {
    isPlaying = !isPlaying;
    if (isPlaying) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
        startReading();
    } else {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
        stopReading();
    }
}

function showControls() {
    controls.classList.remove('hidden');
    if (controlsTimeout) clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
        controls.classList.add('hidden');
    }, 3000);
}

// Book Modal Functions
function openBookModal() {
    bookModal.classList.add('active');
    loadBooks();
}

function closeBookModal() {
    bookModal.classList.remove('active');
}

async function loadBooks() {
    try {
        loadingBooks.style.display = 'block';
        booksGrid.innerHTML = '';

        const response = await fetch(`${API_URL}/books`);
        if (!response.ok) throw new Error('Failed to fetch books');

        const books = await response.json();
        loadingBooks.style.display = 'none';

        if (books.length === 0) {
            booksGrid.innerHTML = '<p class="loading">No books found in the books folder</p>';
            return;
        }

        books.forEach(book => {
            const bookCard = createBookCard(book);
            booksGrid.appendChild(bookCard);
        });
    } catch (error) {
        console.error('Error loading books:', error);
        loadingBooks.style.display = 'none';
        booksGrid.innerHTML = '<p class="loading">Error loading books. Make sure the server is running.</p>';
    }
}

function createBookCard(book) {
    const card = document.createElement('div');
    card.className = 'book-card';

    const icon = book.type === 'pdf' ? '📕' : '📘';

    card.innerHTML = `
        <div class="book-icon">${icon}</div>
        <div class="book-title">${book.title}</div>
        <div class="book-type">${book.type}</div>
    `;

    card.addEventListener('click', () => selectBook(book));

    return card;
}

async function selectBook(book) {
    closeBookModal();

    if (book.type === 'epub') {
        alert('EPUB support coming soon! Please select a PDF file.');
        return;
    }

    // Stop current reading
    if (isPlaying) {
        togglePlayPause();
    }

    loadingOverlay.style.display = 'flex';

    try {
        const text = await extractPDFText(book.filename);
        loadText(text);
        currentBook = book;
        loadingOverlay.style.display = 'none';
    } catch (error) {
        console.error('Error loading book:', error);
        loadingOverlay.style.display = 'none';
        alert('Failed to extract text from PDF. Please try another book.');
    }
}

async function extractPDFText(filename) {
    try {
        // Use server-side extraction as primary method
        const response = await fetch(`${API_URL}/books/${filename}/extract`);

        if (response.ok) {
            const data = await response.json();
            return cleanText(data.text);
        }

        // Fallback to client-side extraction
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
    // Remove extra whitespace and clean up text
    return text
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, ' ')
        .trim();
}

function loadText(text) {
    words = text.split(' ').filter(word => word.length > 0);
    currentWordIndex = 0;
    currentOffset = 0; // Reset to start position
    renderAllWords();
    // Wait for DOM to update before calculating positions
    setTimeout(() => updatePosition(), 50);
}

// Event Listeners
playPauseBtn.addEventListener('click', togglePlayPause);

speedSlider.addEventListener('input', (e) => {
    wpm = parseInt(e.target.value);
    wpmValue.textContent = wpm;
    // Speed recalculation happens automatically in the animation loop
    // But we need to restart if playing to pick up new speed
    if (isPlaying) {
        stopReading();
        startReading();
    }
});

selectBookBtn.addEventListener('click', openBookModal);
closeModalBtn.addEventListener('click', closeBookModal);

// Close modal on outside click
bookModal.addEventListener('click', (e) => {
    if (e.target === bookModal) {
        closeBookModal();
    }
});

document.body.addEventListener('click', showControls);
document.body.addEventListener('touchstart', showControls);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
    } else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
        e.preventDefault();
        currentOffset += 30; // Move down (back)
        updatePosition();
    } else if (e.code === 'ArrowDown' || e.code === 'ArrowRight') {
        e.preventDefault();
        currentOffset -= 30; // Move up (forward)
        updatePosition();
    } else if (e.code === 'KeyB') {
        e.preventDefault();
        openBookModal();
    }
});

// Mouse wheel and trackpad scrolling
let scrollTimeout = null;
flowingTextWrapper.addEventListener('wheel', (e) => {
    e.preventDefault();

    // Pause playback when manually scrolling
    if (isPlaying) {
        togglePlayPause();
    }

    // Move vertically based on scroll
    const delta = e.deltaY;
    currentOffset -= delta; // Direct 1:1 mapping for smooth scrolling

    updatePosition();

    // Clear previous timeout and set new one for control visibility
    clearTimeout(scrollTimeout);
    showControls();
}, { passive: false });

// Touch scrolling
let touchStartY = 0;
let touchLastY = 0;

flowingTextWrapper.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
    touchLastY = touchStartY;
}, { passive: true });

flowingTextWrapper.addEventListener('touchmove', (e) => {
    e.preventDefault();

    const touchY = e.touches[0].clientY;
    const delta = touchLastY - touchY;

    // Pause playback when manually scrolling
    if (isPlaying && Math.abs(delta) > 5) {
        togglePlayPause();
    }

    // Move based on touch delta
    if (Math.abs(delta) > 5) {
        currentOffset -= delta;
        updatePosition();
        touchLastY = touchY;
    }
}, { passive: false });

// Container resize functionality
let isResizing = false;
let startX = 0;
let startWidth = 0;

resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = textContainer.offsetWidth;
    document.body.style.cursor = 'ew-resize';
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const deltaX = e.clientX - startX;
    const newWidth = startWidth + (deltaX * 2); // multiply by 2 since container is centered

    // Clamp width between min and max
    const minWidth = 300;
    const maxWidth = window.innerWidth * 0.95;
    const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

    textContainer.style.width = clampedWidth + 'px';

    // Update position
    if (words.length > 0) {
        updatePosition();
    }
});

document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';

        // Recalculate text height after resize
        setTimeout(() => {
            textHeight = flowingText.scrollHeight;
            if (isPlaying) {
                stopReading();
                startReading();
            }
        }, 100);
    }
});

// Handle window resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        textHeight = flowingText.scrollHeight;
        if (isPlaying) {
            stopReading();
            startReading();
        }
    }, 250);
});

// Initialize
renderAllWords();
setTimeout(() => updatePosition(), 50);
showControls();
