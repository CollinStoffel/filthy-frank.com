# Filthy Frank - Website Setup Guide

## 📁 Folder Structure

```
website/
├── index.html          # Main website file
├── SETUP.md           # This file
└── assets/            # Create this folder and add:
    ├── game-logo.png      # Your game logo (recommended: 350x350px)
    ├── favicon.png        # Browser tab icon (32x32 or 64x64)
    ├── og-image.png       # Social media preview (1200x630px)
    ├── screenshot-1.png   # Phone screenshot 1 (portrait)
    └── screenshot-2.png   # Phone screenshot 2 (portrait)
```

## ⚡ Quick Setup (5 minutes)

### Step 1: Update Configuration
Open `index.html` and find the `CONFIG` object near the bottom. Update these values:

```javascript
const CONFIG = {
    // 1. SET YOUR CONTEST END DATE
    contestEndDate: new Date('2026-02-01T23:59:59'),
    
    // 2. ADD YOUR FIREBASE CONFIG
    firebase: {
        apiKey: "YOUR_FIREBASE_API_KEY",      // From FirebaseConfig.gd
        projectId: "YOUR_PROJECT_ID",          // From FirebaseConfig.gd
        leaderboardPath: "leaderboards/weekly" // Your leaderboard path
    },
    
    // 3. ADD STORE URLs (when approved)
    appStoreUrl: "https://apps.apple.com/app/your-app-id",
    googlePlayUrl: "https://play.google.com/store/apps/details?id=your.package.name",
    
    // 4. ADD DISCORD INVITE
    discordUrl: "https://discord.gg/YOUR_INVITE_CODE"
};
```

### Step 2: Add Your Assets
Create an `assets` folder and add your images:

1. **game-logo.png** - Your main Filthy Frank logo
2. **screenshot-1.png** & **screenshot-2.png** - Phone gameplay screenshots
3. **favicon.png** - Small icon for browser tab
4. **og-image.png** - Image shown when shared on social media

### Step 3: Deploy

#### Option A: Firebase Hosting (Recommended - You already have Firebase!)
```bash
cd website
firebase init hosting
# Select your existing Firebase project
# Set public directory to: .
# Configure as single-page app: No

firebase deploy --only hosting
```

#### Option B: Netlify (Free, drag & drop)
1. Go to https://netlify.com
2. Drag the entire `website` folder onto the page
3. Done! Get your free URL

#### Option C: GitHub Pages (Free)
1. Push to GitHub repo
2. Settings → Pages → Source: main branch, /website folder
3. Your site will be at: `yourusername.github.io/repo-name`

#### Option D: Wix with Velo
See "Wix Integration" section below.

---

## 🔗 Wix Integration (Using Velo)

If you want to keep using Wix, here's how to add the key features:

### Adding the Countdown Timer to Wix:

1. In Wix Editor, click **Dev Mode** → **Turn on Dev Mode**
2. Add an **HTML iframe** element to your page
3. Paste this code:

```html
<div id="countdown" style="font-family: 'Orbitron', monospace; text-align: center;">
    <div style="display: flex; justify-content: center; gap: 15px;">
        <div><span id="days" style="font-size: 48px; color: #FFC500;">00</span><br><small>Days</small></div>
        <div><span id="hours" style="font-size: 48px; color: #FFC500;">00</span><br><small>Hours</small></div>
        <div><span id="mins" style="font-size: 48px; color: #FFC500;">00</span><br><small>Mins</small></div>
        <div><span id="secs" style="font-size: 48px; color: #FFC500;">00</span><br><small>Secs</small></div>
    </div>
</div>
<script>
const endDate = new Date('2026-02-01T23:59:59').getTime();
setInterval(() => {
    const now = Date.now();
    const d = Math.floor((endDate - now) / 86400000);
    const h = Math.floor((endDate - now) % 86400000 / 3600000);
    const m = Math.floor((endDate - now) % 3600000 / 60000);
    const s = Math.floor((endDate - now) % 60000 / 1000);
    document.getElementById('days').textContent = String(d).padStart(2,'0');
    document.getElementById('hours').textContent = String(h).padStart(2,'0');
    document.getElementById('mins').textContent = String(m).padStart(2,'0');
    document.getElementById('secs').textContent = String(s).padStart(2,'0');
}, 1000);
</script>
```

### Adding the Leaderboard to Wix:

1. In Wix Editor, add another **HTML iframe** element
2. Paste this code:

```html
<div id="leaderboard" style="font-family: sans-serif; max-width: 400px; margin: 0 auto;"></div>
<script>
// Your Firebase Realtime Database URL
const dbUrl = 'https://filthyfrank-7d392-default-rtdb.europe-west1.firebasedatabase.app';
// Leaderboard key (downtown_01_leaderboard, industrial_01_leaderboard, etc.)
const leaderboardKey = 'downtown_01_leaderboard';

fetch(`${dbUrl}/leaderboards/${leaderboardKey}.json`)
    .then(r => r.json())
    .then(data => {
        if (!data) {
            document.getElementById('leaderboard').innerHTML = '<p style="color:#888;">No scores yet!</p>';
            return;
        }
        const scores = Object.values(data)
            .map(e => ({ name: e.player_name, score: e.score }))
            .sort((a,b) => b.score - a.score)
            .slice(0, 10);
        document.getElementById('leaderboard').innerHTML = scores.map((p, i) => 
            `<div style="display:flex;justify-content:space-between;padding:10px;background:${i<3?'#1a1a2e':'#0f0f1a'};margin:5px;border-radius:8px;color:#fff;">
                <span>${i+1}. ${p.name}</span>
                <span style="color:#51E01B;font-weight:bold;">${p.score.toLocaleString()}</span>
            </div>`
        ).join('');
    });
</script>
```

---

## 🎨 Your Firebase Config (Already Set Up!)

Your Firebase config from `scripts/FirebaseConfig.gd`:

```
Project ID: filthyfrank-7d392
Database URL: https://filthyfrank-7d392-default-rtdb.europe-west1.firebasedatabase.app
```

**Available Leaderboard Keys:**
- `downtown_01_leaderboard` (Downtown District)
- `industrial_01_leaderboard` (Industrial Zone)
- `harbor_01_leaderboard` (Harbor District)
- `financial_01_leaderboard` (Financial District)
- `warehouse_01_leaderboard` (Warehouse District)
- `citycenter_01_leaderboard` (City Center)

Choose which level's leaderboard to show on the website!

---

## 📱 Getting Store URLs

### Google Play
Once your app is published:
`https://play.google.com/store/apps/details?id=com.yourcompany.filthyfrank`

### App Store
Once your app is approved:
`https://apps.apple.com/app/filthy-frank/id123456789`

---

## 🧪 Testing Locally

Just open `index.html` in a browser! No server needed.

For a local server (optional):
```bash
# Python
python -m http.server 8000

# Node.js
npx serve .
```

Then open: `http://localhost:8000`

---

## ✅ Checklist

- [ ] Update contest end date
- [ ] Add Firebase project ID
- [ ] Add Discord invite link
- [ ] Add game logo image
- [ ] Add phone screenshots
- [ ] Add App Store URL (when approved)
- [ ] Add Google Play URL (when approved)
- [ ] Deploy to hosting platform
- [ ] Test on mobile device

