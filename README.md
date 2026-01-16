# ReadFast - Speed Reading App

A web-based speed reading application that allows you to read PDF books from your library at adjustable speeds using the RSVP (Rapid Serial Visual Presentation) technique with ORP (Optimal Recognition Point) anchoring.

## Features

- 📚 **Book Library**: Browse and select PDF books from your `books` folder
- ⚡ **Adjustable Speed**: Control reading speed from 100 to 600 WPM
- 🎯 **ORP Anchoring**: Optimal Recognition Point highlighting for better focus
- ⌨️ **Keyboard Shortcuts**: Full keyboard control for efficient reading
- 🎨 **Clean UI**: Distraction-free reading interface with auto-hiding controls
- 📖 **PDF Support**: Automatic text extraction from PDF files

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm

### Installation

Dependencies are already installed. If you need to reinstall:

```bash
npm install
```

### Running the App

1. Start the server:
```bash
npm start
```

2. Open your browser and navigate to:
```
http://localhost:3000/readfast.html
```

## Usage

### Selecting a Book

1. Click the book icon (📚) button in the controls at the bottom
2. Or press `B` on your keyboard
3. Select a PDF from your library
4. Wait for the text to be extracted

### Reading Controls

- **Play/Pause**: Click the play button or press `Space`
- **Speed Control**: Use the slider to adjust WPM (Words Per Minute)
- **Navigation**:
  - Press `←` (Left Arrow) to go back one word
  - Press `→` (Right Arrow) to go forward one word
- **Select Book**: Click the book icon or press `B`

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Pause reading |
| `←` | Previous word |
| `→` | Next word |
| `B` | Open book selection |

## Adding Books

Simply add PDF files to the `books/` folder. They will automatically appear in the book selection modal.

## Technical Details

### Architecture

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js + Express
- **PDF Processing**:
  - Server-side: pdf-parse
  - Client-side fallback: PDF.js

### How It Works

1. The Express server serves the static files and provides API endpoints
2. Books are listed from the `books/` directory
3. When a book is selected, text is extracted using pdf-parse (server-side)
4. If server extraction fails, PDF.js extracts text client-side
5. The text is then displayed word-by-word using RSVP technique
6. ORP algorithm highlights the optimal character for eye fixation

## Development

To run in development mode with auto-reload:

```bash
npm run dev
```

## File Structure

```
readfast/
├── books/              # Your PDF book library
├── server.js           # Express server
├── readfast.html       # Main HTML file
├── readfast.css        # Styles
├── readfast.js         # Frontend JavaScript
├── package.json        # Dependencies
└── README.md          # This file
```

## Browser Compatibility

Works in all modern browsers that support:
- ES6+ JavaScript
- CSS Grid
- Fetch API
- PDF.js

## Tips for Better Speed Reading

1. Start at a comfortable speed (200-300 WPM)
2. Gradually increase speed as you get comfortable
3. Focus on the highlighted ORP character
4. Avoid subvocalization (speaking words in your head)
5. Trust your brain to process the information

## License

MIT
# readfast
