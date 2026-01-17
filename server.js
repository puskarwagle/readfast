const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

// Import pdfjs-dist dynamically since it's an ES module
let pdfjsLib;
(async () => {
    pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
})();

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// API endpoint to list all books
app.get('/api/books', async (req, res) => {
    try {
        const booksDir = path.join(__dirname, 'books');
        const files = await fs.readdir(booksDir);

        // Filter for PDF and EPUB files
        const books = files
            .filter(file => file.endsWith('.pdf') || file.endsWith('.epub'))
            .map(file => ({
                filename: file,
                title: file.replace(/\.(pdf|epub)$/, '').replace(/_/g, ' '),
                type: file.endsWith('.pdf') ? 'pdf' : 'epub'
            }));

        res.json(books);
    } catch (error) {
        console.error('Error reading books directory:', error);
        res.status(500).json({ error: 'Failed to read books directory' });
    }
});

// API endpoint to extract text from a PDF
app.get('/api/books/:filename/extract', async (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'books', filename);

        // Check if file exists and is a PDF
        if (!filename.endsWith('.pdf')) {
            return res.status(400).json({ error: 'Only PDF files are supported for server-side extraction' });
        }

        // Ensure pdfjs-dist is loaded
        if (!pdfjsLib) {
            return res.status(503).json({ error: 'PDF processing library is still loading' });
        }

        const dataBuffer = await fs.readFile(filePath);

        // Load PDF document using pdfjs-dist
        const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(dataBuffer),
            useSystemFonts: true,
        });
        const pdf = await loadingTask.promise;

        // Extract text from all pages
        let fullText = '';
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }

        // Get metadata
        const metadata = await pdf.getMetadata();

        res.json({
            text: fullText,
            pages: pdf.numPages,
            info: metadata.info
        });
    } catch (error) {
        console.error('Error extracting PDF text:', error);
        res.status(500).json({ error: 'Failed to extract text from PDF' });
    }
});

// Serve individual book files
app.get('/api/books/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'books', filename);

        // Check if file exists
        await fs.access(filePath);

        res.sendFile(filePath);
    } catch (error) {
        console.error('Error serving book file:', error);
        res.status(404).json({ error: 'Book not found' });
    }
});

app.listen(PORT, () => {
    console.log(`ReadFast server running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT}/readfast.html to use the app`);
});
