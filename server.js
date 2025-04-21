const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose(); // Use sqlite3
const multer = require('multer');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ejs = require('ejs'); // Add this line

const app = express();
app.use(bodyParser.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // Ensure this folder exists

// Connect to SQLite database (creates the file if it doesn't exist)
const db = new sqlite3.Database('./shared_notes.db', (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Create the shared_notes table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS shared_notes (
            shareId TEXT PRIMARY KEY,
            noteId TEXT NOT NULL,
            content TEXT NOT NULL, /* Store note content */
            password TEXT,
            permissions TEXT
        )`, (createErr) => {
            if (createErr) {
                console.error('Error creating table:', createErr.message);
            } else {
                console.log('Shared notes table ready.');
            }
        });

        // Create table for custom short URLs
        db.run(`CREATE TABLE IF NOT EXISTS short_urls (
            alias TEXT PRIMARY KEY,
            url TEXT NOT NULL
        )`, (err) => {
            if (err) {
                console.error('Error creating short_urls table:', err.message);
            }
        });
    }
});
app.use(express.static('public')); // Serve static files from the public directory

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Endpoint to share a note
app.post('/share', (req, res) => {
    const { noteId, content, password, permissions } = req.body;

    // Validate required fields
    if (!noteId || !content) {
        return res.status(400).json({ error: 'Note ID and content are required.' });
    }

    const shareId = crypto.randomBytes(8).toString('hex');

    // Insert the shared note details into the database
    db.run(`INSERT INTO shared_notes (shareId, noteId, content, password, permissions) VALUES (?, ?, ?, ?, ?)`,
        [shareId, noteId, content, password, permissions],
        function(err) {
            if (err) {
                console.error('Error inserting shared note:', err.message);
                return res.status(500).json({ error: 'Failed to share note.' });
            }
            console.log(`A row has been inserted with shareId ${shareId}`);

            const link = `http://localhost:3000/shared/${shareId}`;
            res.json({ link });
        }
    );
});

// Endpoint to retrieve and display a shared note
app.get('/shared/:shareId', (req, res) => {
    const { shareId } = req.params;

    db.get(`SELECT content, password, permissions FROM shared_notes WHERE shareId = ?`, [shareId], (err, row) => {
        if (err) {
            console.error('Error retrieving shared note:', err.message);
            return res.status(500).send('<h1>Error retrieving shared note.</h1>');
        }

        if (!row) {
            return res.status(404).send('<h1>Shared note not found.</h1>');
        }

        res.render('shared-note', {
            shareId,
            content: row.content,
            password: row.password,
            permissions: row.permissions
        });
    });
});

// Add an API endpoint to fetch note content
app.get('/api/notes/:noteId', (req, res) => {
    const { noteId } = req.params;

    // Simulate fetching the note content (replace with actual logic)
    const noteContent = "This is the content of the note."; // Replace with actual content retrieval logic
    res.json({ content: noteContent });
});

// Add an API endpoint to update note content
app.put('/api/notes/:noteId', (req, res) => {
    const { noteId } = req.params;
    const { content } = req.body;

    // Simulate saving the note content (replace with actual logic)
    console.log(`Saving note ${noteId} with content:`, content);
    res.status(200).send('Note updated successfully.');
});

// Endpoint to handle folder uploads
app.post('/upload-folder', upload.array('files'), (req, res) => {
    const files = req.files;
    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded.' });
    }

    const uuid = uuidv4();
    const zipPath = `zips/${uuid}.zip`;

    // Create a ZIP file
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } }); // Low-medium compression

    output.on('close', () => {
        console.log(`ZIP file created: ${zipPath} (${archive.pointer()} bytes)`);

        // Clean up temporary files
        files.forEach((file) => {
            const filePath = path.join(file.destination, file.filename);
            fs.unlinkSync(filePath);
        });

        res.json({ uuid, link: `/webfolder/user-content/${uuid}` });
    });

    archive.on('error', (err) => {
        console.error('Error creating ZIP:', err.message);

        // Clean up all files in the upload folder in case of error
        const uploadFolder = path.join(__dirname, 'uploads');
        fs.readdirSync(uploadFolder).forEach((file) => {
            const filePath = path.join(uploadFolder, file);
            fs.unlinkSync(filePath);
        });

        res.status(500).json({ error: 'Failed to create ZIP file.' });
    });

    archive.pipe(output);

    // Add uploaded files to the ZIP, preserving deeply nested folder structure
    files.forEach((file) => {
        // file.originalname contains the full relative path if set correctly on the client
        // fallback to file.filename if not present (should not happen if client is correct)
        const relativePath = file.originalname || file.filename;
        const filePath = path.join(file.destination, file.filename);
        archive.file(filePath, { name: relativePath });
    });

    archive.finalize();
});

// Endpoint to serve the ZIP file and preview UI
app.get('/webfolder/user-content/:uuid', (req, res) => {
    const { uuid } = req.params;
    const zipPath = path.join('zips', `${uuid}.zip`);

    if (!fs.existsSync(zipPath)) {
        return res.status(404).send('<h1>File not found.</h1>');
    }

    res.send(`
<!doctypehtml><html lang=en><meta charset=UTF-8><meta content="width=device-width,initial-scale=1"name=viewport><title>Download Folder</title><script src=https://cdn.tailwindcss.com></script><style>body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}</style><body class="items-center justify-center flex bg-gradient-to-br font-sans from-gray-50 min-h-screen p-4 text-gray-800 to-indigo-100"><div class="mx-auto bg-white container max-w-md p-10 rounded-2xl shadow-xl text-center"><div class="items-center justify-center flex bg-green-100 h-16 mb-6 mx-auto rounded-full w-16"><svg class="h-10 text-green-600 w-10"fill=none stroke=currentColor stroke-width=1.5 viewBox="0 0 24 24"xmlns=http://www.w3.org/2000/svg><path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12l-4.5 4.5m0 0l-4.5-4.5m4.5 4.5V3"stroke-linecap=round stroke-linejoin=round /></svg></div><h1 class="font-bold mb-3 text-2xl text-gray-800">Your Folder is Ready!</h1><p class="mb-8 text-gray-600">Click the button below to download your compressed folder as a ZIP file.</p><a class="items-center justify-center bg-gradient-to-r duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75 font-bold from-green-500 hover:from-green-600 hover:shadow-lg hover:to-emerald-700 inline-flex px-8 py-3 rounded-lg shadow-md text-lg text-white to-emerald-600 transition-all"download href=/download/${uuid}><svg class="h-6 mr-3 w-6"fill=none stroke=currentColor stroke-width=2 viewBox="0 0 24 24"xmlns=http://www.w3.org/2000/svg><path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12l-4.5 4.5m0 0l-4.5-4.5m4.5 4.5V3"stroke-linecap=round stroke-linejoin=round /></svg> Download ZIP</a></div>
    `);
});

// Endpoint to download the ZIP file
app.get('/download/:uuid', (req, res) => {
    const { uuid } = req.params;
    const zipPath = path.join('zips', `${uuid}.zip`);

    if (!fs.existsSync(zipPath)) {
        return res.status(404).send('File not found.');
    }

    res.download(zipPath, `${uuid}.zip`);
});

// Endpoint to create/update a custom short URL alias
app.post('/u', (req, res) => {
    const { alias, url } = req.body;
    if (!alias || !url) {
        return res.status(400).json({ error: 'Alias and URL are required.' });
    }
    // Insert or replace the alias
    db.run(
        `INSERT OR REPLACE INTO short_urls (alias, url) VALUES (?, ?)`,
        [alias, url],
        function(err) {
            if (err) {
                console.error('Error saving short URL:', err.message);
                return res.status(500).json({ error: 'Failed to save alias.' });
            }
            res.json({ message: 'Alias saved.', alias, url, shortUrl: `http://localhost:3000/u/${alias}` });
        }
    );
});

// Endpoint to redirect based on custom alias
app.get('/u/:useralias', (req, res) => {
    const { useralias } = req.params;
    db.get(`SELECT url FROM short_urls WHERE alias = ?`, [useralias], (err, row) => {
        if (err) {
            console.error('Error retrieving short URL:', err.message);
            return res.status(500).send('Internal server error.');
        }
        if (!row) {
            return res.status(404).send('<h1>Alias not found.</h1>');
        }
        // Redirect to the target URL
        res.redirect(row.url);
    });
});

// Ensure the 'zips' directory exists
if (!fs.existsSync('zips')) {
    fs.mkdirSync('zips');
}

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Close the database connection when the app exits (optional, good practice)
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        }
        console.log('Database connection closed.');
        process.exit(0);
    });
});
