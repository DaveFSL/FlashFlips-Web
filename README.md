# FlashFlips Web (v1)

Browser version of FlashFlips — **no install**. Works offline after first load.

## How to open

1. Open **`index.html`** in **Safari** or **Chrome** (double-click, or drag into the browser).
2. On iPad: put the folder in **Files**, tap `index.html` → **Share** → **Open in Safari**.

Or host the `FlashFlips-Web` folder on a website and link your QR code to that URL.

## Add to Home Screen

Once it's hosted on a URL, it installs like an app with a proper ⚡ icon:

- **iPad / iPhone (Safari):** Share → **Add to Home Screen**
- **Chromebook / Android / Chrome:** menu → **Install app** / **Add to Home Screen**

It opens fullscreen (no browser bars). Icons live in `icon-192.png`, `icon-512.png`, and `apple-touch-icon.png` — swap these out to rebrand. `icon-1024.png` is the master.

## QR deep link (optional)

Open with a table pre-selected, e.g. for a **6×** card pack:

`index.html?table=6`

## Features (v1)

- **Start practising instantly** — no sign-in needed
- Times tables 1×–12×, mix mode, flip + slide to piles
- **Timer off by default** (no stopwatch when off)
- Optional **players** to save progress per child — saved on **this device only** (`localStorage`)
- **Manage Players** — add/remove, bulk add, choose tables, CSV export

## Files

- `index.html` — structure
- `styles.css` — layout and animations
- `app.js` — game + storage

## Privacy

No accounts, no cloud. Data stays in the browser unless you export CSV.
