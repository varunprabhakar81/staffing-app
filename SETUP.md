# Staffing Intelligence - Setup Guide

Cross-platform setup instructions for Windows and Mac.

---

## Prerequisites

- A GitHub account with access to this repository
- An Anthropic API key (get one at https://console.anthropic.com)
- Node.js v20+
- Git

---

## 1. Install Node.js

### Windows
1. Go to https://nodejs.org and download the LTS version
2. Run the installer and click through the defaults
3. Verify installation:
   ```
   node --version
   npm --version
   ```

### Mac
Using Homebrew (recommended):
```bash
brew install node
```
Or download the LTS installer from https://nodejs.org

Verify:
```bash
node --version
npm --version
```

---

## 2. Install Git

### Windows
1. Download from https://git-scm.com/download/win
2. Run the installer — default options are fine
3. Verify:
   ```
   git --version
   ```

### Mac
Git comes with Xcode Command Line Tools. If not installed:
```bash
xcode-select --install
```
Or via Homebrew:
```bash
brew install git
```

---

## 3. Install Claude Code

Claude Code is the AI assistant used to build and extend this app.

```bash
npm install -g @anthropic-ai/claude-code
```

Verify:
```bash
claude --version
```

---

## 4. Clone the Repository

```bash
git clone https://github.com/varunprabhakar81/staffing-app.git
cd staffing-app
```

---

## 5. Install Dependencies

```bash
npm install
```

This installs Express, ExcelJS, the Anthropic SDK, and other packages listed in `package.json`.

---

## 6. Set Up Environment Variables

Create a `.env` file in the project root:

### Windows (Command Prompt)
```
echo ANTHROPIC_API_KEY=your_key_here > .env
```

### Windows (PowerShell)
```powershell
"ANTHROPIC_API_KEY=your_key_here" | Out-File -Encoding utf8 .env
```

### Mac / Linux
```bash
echo "ANTHROPIC_API_KEY=your_key_here" > .env
```

Replace `your_key_here` with your actual key from https://console.anthropic.com

> **Note:** `.env` is gitignored and will never be committed.

---

## 7. Add Your Excel Data File

Place your staffing Excel file at:
```
data/resourcing.xlsx
```

The file must have three tabs:

| Tab | Contents |
|-----|----------|
| **Supply** | Employee bookings by week (one row per employee per week) |
| **Demand** | Open role requirements (project, role, hours needed, week) |
| **Master** | Employee master data (name, level, skill set, capacity) |

A sample file is included at `data/resourcing.xlsx` to get you started.

---

## 8. Run the Server

```bash
node server.js
```

Then open your browser at:
```
http://localhost:3000
```

You should see the Staffing Intelligence dashboard load with your data.

---

## 9. Stop the Server

Press `Ctrl + C` in the terminal where the server is running.

---

## 10. Troubleshooting

### "Cannot find module" error on startup
Run `npm install` again — a dependency may be missing.

### Dashboard shows "Connection error"
- Make sure the server is running (`node server.js`)
- Check that port 3000 is not in use by another process
- On Mac/Linux: `lsof -i :3000` to see what's using it
- On Windows: `netstat -ano | findstr :3000`

### "Invalid API key" or Claude Q&A not working
- Check your `.env` file exists in the project root
- Confirm the key is valid at https://console.anthropic.com
- Make sure there are no extra spaces or quotes around the key

### Excel data not loading / charts empty
- Confirm the file is at `data/resourcing.xlsx` (exact path and filename)
- Check that the tabs are named exactly: `Supply`, `Demand`, `Master`
- Open the server terminal — parse errors will appear there

### Port 3000 already in use
Change the port by setting an environment variable:

```bash
PORT=3001 node server.js        # Mac/Linux
set PORT=3001 && node server.js  # Windows
```

Then open `http://localhost:3001`

---

## Project Structure

```
staffing-app/
├── server.js           # Express server + API endpoints
├── package.json        # Dependencies and scripts
├── .env                # Your API key (gitignored, create manually)
├── data/
│   └── resourcing.xlsx # Staffing data (Supply, Demand, Master tabs)
└── public/
    ├── index.html      # App shell and tab structure
    ├── app.js          # Frontend logic, charts, heatmap, Q&A
    └── styles.css      # Dark theme with pastel color palette
```
