# DX - Peer-to-Peer Chess Staking Platform

![DX Chess Staking](https://img.shields.io/badge/DX-Chess%20Staking-green)
![License](https://img.shields.io/badge/License-MIT-blue)
![Version](https://img.shields.io/badge/Version-1.0.0-orange)

DX is a web-based platform that enables chess players to stake money against each other while playing chess games on Lichess. Instead of free games, two players agree on a stake amount (minimum ₦500), play on Lichess, and the winner receives the pot minus a transparent DX platform fee.

## 🚀 Deployment Options

### Option 1: Render.com (Recommended)
1. Create a free account at [render.com](https://render.com)
2. Connect your GitHub repository
3. Create a new Web Service:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Add a Disk (1GB) mounted at `/app/data` for persistent database
4. Deploy - your app will be live at `https://your-service-name.onrender.com`

### Option 2: Railway.app
1. Create a free account at [railway.app](https://railway.app)
2. Click "Deploy from GitHub repo"
3. Select your repository
4. Deploy - your app will be live at `https://your-project-name.up.railway.app`

### Option 3: Local Development
```bash
git clone <your-repo-url>
cd ChessBetting
npm install
npm start
```
Server runs at http://localhost:3000

## 🎯 Features

### Core Features
- **💰 Real-money chess stakes** - Stake ₦500+ against opponents
- **🤝 Peer-to-peer matching** - Create challenges or accept existing ones
- **📊 Transparent 1.5% platform fee** - No hidden charges
- **✅ Lichess integration** - Verify game results automatically
- **💳 Wallet system** - Deposit, withdraw, and track balance
- **📈 Dashboard** - View stats, history, and active matches

### Supported Games
- **Blitz** (3+2, 3+0)
- **Rapid** (10+0, 10+5, 15+10)
- **Classical** (30+0, 30+20)
- Rated or Casual games

### Admin Panel
- User management
- Match & game logs
- Wallet & transaction control
- Withdrawal approval/rejection
- Platform fee tracking

## 📖 How It Works

### 1. Create a Match
1. Set your stake amount (minimum ₦500)
2. Choose time control (Blitz/Rapid/Classical)
3. Select rated or casual
4. Your challenge appears in Open Challenges

### 2. Accept a Match
1. Browse available challenges
2. Click "Accept Challenge"
3. Your stake is locked in escrow

### 3. Play on Lichess
1. Both players play ONE game on Lichess
2. Use the agreed time control
3. First completed game counts

### 4. Submit Result
1. Copy the game ID from Lichess URL
2. Submit via DX dashboard
3. DX verifies the game
4. Winner receives payout automatically

### Fee Structure
| Stake | Total Pot | DX Fee (1.5%) | Winner Receives |
|-------|----------|---------------|-----------------|
| ₦500  | ₦1,000   | ₦15           | ₦985            |
| ₦1,000| ₦2,000   | ₦30           | ₦1,970          |
| ₦5,000| ₦10,000  | ₦150          | ₦9,850          |

## 🛠️ Tech Stack

- **Backend:** Node.js + Express
- **Database:** JSON file-based storage (persistent)
- **Frontend:** Vanilla HTML/CSS/JS
- **Authentication:** JWT
- **External API:** Lichess API

## 📁 Project Structure

```
ChessBetting/
├── public/
│   ├── index.html      # Main HTML
│   ├── styles.css      # Styling
│   └── app.js          # Frontend logic
├── server.js           # Main server file
├── render.yaml         # Render deployment config
├── package.json        # Dependencies
├── .gitignore          # Git ignore rules
└── README.md           # This file
```

## ⚠️ Important Notes

- **MVP Version:** This is a minimum viable product for demonstration
- **No real payments:** Wallet deposits/withdrawals are simulated
- **Lichess verification:** Uses Lichess public API for game verification
- **Admin account:** Create via direct database edit or register and manually update

## 🔒 Security Considerations

For production deployment:
- Use strong JWT secrets
- Implement proper payment gateway (Stripe, Paystack, etc.)
- Add rate limiting
- Implement proper KYC/AML compliance
- Use HTTPS
- Add proper anti-fraud measures
- Review and strengthen all security headers

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## 📞 Support

For questions or support, please open an issue on GitHub.

---

**Remember:** Chess is a game of skill. Play responsibly. Set limits. Know when to stop.

♞ Good luck, and may the best player win!
