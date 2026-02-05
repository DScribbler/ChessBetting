// DX - Peer-to-Peer Chess Staking Platform (MVP)
// Main Server Entry Point

const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// JWT Secret (use strong secret in production)
const JWT_SECRET = process.env.JWT_SECRET || 'dx-chess-mvp-secret-2024';

// Initialize Database
const db = new Database('dx.db');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ================== DATABASE SCHEMA ==================

// Users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    lichess_username TEXT,
    lichess_verified INTEGER DEFAULT 0,
    wallet_balance REAL DEFAULT 0,
    locked_balance REAL DEFAULT 0,
    total_staked REAL DEFAULT 0,
    total_winnings REAL DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    matches_lost INTEGER DEFAULT 0,
    matches_draw INTEGER DEFAULT 0,
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Matches table
db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id TEXT UNIQUE NOT NULL,
    creator_id INTEGER NOT NULL,
    opponent_id INTEGER,
    stake_amount REAL NOT NULL,
    time_control TEXT NOT NULL,
    is_rated INTEGER DEFAULT 0,
    status TEXT DEFAULT 'open',
    winner_id INTEGER,
    lichess_game_id TEXT,
    lichess_game_url TEXT,
    dx_fee REAL DEFAULT 0,
    payout_amount REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (creator_id) REFERENCES users(id),
    FOREIGN KEY (opponent_id) REFERENCES users(id),
    FOREIGN KEY (winner_id) REFERENCES users(id)
  )
`);

// Transactions table
db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    reference_id TEXT,
    status TEXT DEFAULT 'completed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Admin logs table
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(id)
  )
`);

// ================== CONFIGURATION ==================

const CONFIG = {
  MIN_STAKE: 500,
  PLATFORM_FEE_PERCENTAGE: 1.5,
  LICHESS_API_BASE: 'https://lichess.org/api',
  MATCH_TIMEOUT_HOURS: 24
};

// ================== HELPER FUNCTIONS ==================

function generateChallengeId() {
  return 'DX' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function calculateFee(stakeAmount) {
  const totalPot = stakeAmount * 2;
  return (totalPot * CONFIG.PLATFORM_FEE_PERCENTAGE) / 100;
}

function verifyLichessUsername(lichessUsername) {
  // In MVP, we just verify the username format
  // In production, you'd call Lichess API to verify
  return /^[a-zA-Z0-9_-]{3,20}$/.test(lichessUsername);
}

async function fetchLichessGame(gameId) {
  try {
    const response = await axios.get(`${CONFIG.LICHESS_API_BASE}/game/export/${gameId}?evals=false&clocks=false`);
    return response.data;
  } catch (error) {
    console.error('Lichess API error:', error.message);
    return null;
  }
}

// JWT Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Admin Middleware
function requireAdmin(req, res, next) {
  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ================== AUTH ROUTES ==================

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)
    `).run(username, email, passwordHash);

    const token = jwt.sign({ id: result.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: { id: result.lastInsertRowid, username, email }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, is_admin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        lichess_username: user.lichess_username,
        lichess_verified: user.lichess_verified,
        wallet_balance: user.wallet_balance,
        is_admin: user.is_admin
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ================== USER ROUTES ==================

// Get user profile
app.get('/api/user/profile', authenticateToken, (req, res) => {
  const user = db.prepare(`
    SELECT id, username, email, lichess_username, lichess_verified, 
           wallet_balance, locked_balance, total_staked, total_winnings,
           matches_won, matches_lost, matches_draw, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const totalMatches = user.matches_won + user.matches_lost + user.matches_draw;
  const winRate = totalMatches > 0 ? ((user.matches_won / totalMatches) * 100).toFixed(1) : 0;

  res.json({ ...user, total_matches: totalMatches, win_rate: winRate });
});

// Update Lichess username
app.post('/api/user/lichess-link', authenticateToken, (req, res) => {
  const { lichess_username } = req.body;

  if (!lichess_username) {
    return res.status(400).json({ error: 'Lichess username required' });
  }

  if (!verifyLichessUsername(lichess_username)) {
    return res.status(400).json({ error: 'Invalid Lichess username format' });
  }

  db.prepare(`
    UPDATE users SET lichess_username = ?, lichess_verified = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(lichess_username, req.user.id);

  res.json({ message: 'Lichess account linked', lichess_username });
});

// ================== WALLET ROUTES ==================

// Get wallet balance
app.get('/api/wallet/balance', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT wallet_balance, locked_balance FROM users WHERE id = ?').get(req.user.id);
  res.json({ 
    available: user.wallet_balance, 
    locked: user.locked_balance 
  });
});

// Get transaction history
app.get('/api/wallet/transactions', authenticateToken, (req, res) => {
  const transactions = db.prepare(`
    SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(req.user.id);
  res.json(transactions);
});

// Deposit funds (MVP - simulated)
app.post('/api/wallet/deposit', authenticateToken, (req, res) => {
  const { amount, payment_method } = req.body;

  if (!amount || amount < 100) {
    return res.status(400).json({ error: 'Minimum deposit is ₦100' });
  }

  db.prepare(`
    UPDATE users SET wallet_balance = wallet_balance + ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(amount, req.user.id);

  db.prepare(`
    INSERT INTO transactions (user_id, type, amount, description, reference_id)
    VALUES (?, 'deposit', ?, ?, ?)
  `).run(req.user.id, amount, 'Wallet deposit', `DEP${Date.now()}`);

  res.json({ message: 'Deposit successful', new_balance: db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(req.user.id).wallet_balance });
});

// Withdraw funds (MVP - manual approval)
app.post('/api/wallet/withdraw', authenticateToken, (req, res) => {
  const { amount, bank_details } = req.body;

  if (!amount || amount < 500) {
    return res.status(400).json({ error: 'Minimum withdrawal is ₦500' });
  }

  const user = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(req.user.id);
  
  if (user.wallet_balance < amount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  // In MVP, withdrawals require admin approval
  db.prepare(`
    UPDATE users SET wallet_balance = wallet_balance - ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(amount, req.user.id);

  db.prepare(`
    INSERT INTO transactions (user_id, type, amount, description, reference_id, status)
    VALUES (?, 'withdrawal', ?, ?, ?, 'pending')
  `).run(req.user.id, amount, 'Withdrawal request', `WTH${Date.now()}`);

  res.json({ message: 'Withdrawal request submitted for approval' });
});

// ================== MATCH ROUTES ==================

// Create a match challenge
app.post('/api/matches/create', authenticateToken, (req, res) => {
  const { stake_amount, time_control, is_rated } = req.body;

  if (stake_amount < CONFIG.MIN_STAKE) {
    return res.status(400).json({ error: `Minimum stake is ₦${CONFIG.MIN_STAKE}` });
  }

  const user = db.prepare('SELECT wallet_balance, locked_balance FROM users WHERE id = ?').get(req.user.id);
  
  if (user.wallet_balance < stake_amount) {
    return res.status(400).json({ error: 'Insufficient wallet balance' });
  }

  const challengeId = generateChallengeId();
  const totalPot = stake_amount * 2;
  const dxFee = (totalPot * CONFIG.PLATFORM_FEE_PERCENTAGE) / 100;

  db.prepare(`
    UPDATE users SET 
      wallet_balance = wallet_balance - ?,
      locked_balance = locked_balance + ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(stake_amount, stake_amount, req.user.id);

  db.prepare(`
    INSERT INTO matches (challenge_id, creator_id, stake_amount, time_control, is_rated, dx_fee, status)
    VALUES (?, ?, ?, ?, ?, ?, 'open')
  `).run(challengeId, req.user.id, stake_amount, time_control, is_rated ? 1 : 0, dxFee);

  const match = db.prepare('SELECT * FROM matches WHERE challenge_id = ?').get(challengeId);

  res.status(201).json({
    message: 'Match challenge created',
    match: {
      ...match,
      fee_breakdown: {
        stake_per_player: stake_amount,
        total_pot: totalPot,
        dx_fee: dxFee,
        winner_receives: totalPot - dxFee
      }
    }
  });
});

// Get open challenges
app.get('/api/matches/open', authenticateToken, (req, res) => {
  const matches = db.prepare(`
    SELECT m.*, u.username as creator_username, u.lichess_username as creator_lichess
    FROM matches m
    JOIN users u ON m.creator_id = u.id
    WHERE m.status = 'open' AND m.creator_id != ?
    ORDER BY m.created_at DESC
  `).all(req.user.id);

  res.json(matches);
});

// Accept a match challenge
app.post('/api/matches/accept/:challengeId', authenticateToken, (req, res) => {
  const { challengeId } = req.params;

  const match = db.prepare(`
    SELECT * FROM matches WHERE challenge_id = ? AND status = 'open'
  `).get(challengeId);

  if (!match) {
    return res.status(404).json({ error: 'Match not found or already accepted' });
  }

  if (match.creator_id === req.user.id) {
    return res.status(400).json({ error: 'Cannot accept your own challenge' });
  }

  const user = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(req.user.id);
  
  if (user.wallet_balance < match.stake_amount) {
    return res.status(400).json({ error: 'Insufficient balance to accept match' });
  }

  db.prepare(`
    UPDATE users SET 
      wallet_balance = wallet_balance - ?,
      locked_balance = locked_balance + ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(match.stake_amount, match.stake_amount, req.user.id);

  db.prepare(`
    UPDATE matches SET 
      opponent_id = ?,
      status = 'pending_game',
      created_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(req.user.id, match.id);

  const updatedMatch = db.prepare(`
    SELECT m.*, 
           uc.username as creator_username, uc.lichess_username as creator_lichess,
           uo.username as opponent_username, uo.lichess_username as opponent_lichess
    FROM matches m
    JOIN users uc ON m.creator_id = uc.id
    JOIN users uo ON m.opponent_id = uo.id
    WHERE m.id = ?
  `).get(match.id);

  res.json({
    message: 'Match accepted! Players can now play on Lichess.',
    match: updatedMatch,
    instructions: `Both players must play ONE game of ${match.time_control} on Lichess. The first completed game counts.`
  });
});

// Submit game result
app.post('/api/matches/submit-result/:matchId', authenticateToken, (req, res) => {
  const { matchId } = req.params;
  const { lichess_game_id, lichess_game_url } = req.body;

  if (!lichess_game_id) {
    return res.status(400).json({ error: 'Lichess game ID is required' });
  }

  const match = db.prepare(`
    SELECT m.*, 
           uc.username as creator_username, uc.lichess_username as creator_lichess,
           uo.username as opponent_username, uo.lichess_username as opponent_lichess
    FROM matches m
    JOIN users uc ON m.creator_id = uc.id
    JOIN users uo ON m.opponent_id = uo.id
    WHERE m.id = ?
  `).get(matchId);

  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  if (match.creator_id !== req.user.id && match.opponent_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized to submit result for this match' });
  }

  // Verify game on Lichess
  const gameData = await fetchLichessGame(lichess_game_id);
  
  if (!gameData) {
    return res.status(400).json({ error: 'Could not verify game on Lichess' });
  }

  // Validate game time control
  const expectedTimeControl = match.time_control.toLowerCase();
  const gameTimeControl = gameData.speed || gameData.clock || '';
  
  if (!gameTimeControl.includes(expectedTimeControl)) {
    return res.status(400).json({ 
      error: `Game time control doesn't match. Expected: ${match.time_control}, Got: ${gameTimeControl}` 
    });
  }

  // Determine winner
  let winnerId = null;
  let loserId = null;
  let isDraw = false;

  if (gameData.winner === 'white') {
    // Check if creator was white
    winnerId = gameData.white?.username?.toLowerCase() === match.creator_lichess?.toLowerCase() 
      ? match.creator_id : match.opponent_id;
    loserId = winnerId === match.creator_id ? match.opponent_id : match.creator_id;
  } else if (gameData.winner === 'black') {
    winnerId = gameData.black?.username?.toLowerCase() === match.creator_lichess?.toLowerCase() 
      ? match.creator_id : match.opponent_id;
    loserId = winnerId === match.creator_id ? match.opponent_id : match.creator_id;
  } else if (gameData.winner === null) {
    isDraw = true;
  }

  // Update match status
  db.prepare(`
    UPDATE matches SET 
      lichess_game_id = ?,
      lichess_game_url = ?,
      status = ?,
      winner_id = ?,
      payout_amount = ?,
      completed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    lichess_game_id, 
    lichess_game_url || `https://lichess.org/${lichess_game_id}`,
    isDraw ? 'draw' : 'completed',
    winnerId,
    isDraw ? match.stake_amount : (match.stake_amount * 2) - match.dx_fee,
    matchId
  );

  // Update wallet balances
  if (isDraw) {
    // Refund both players
    db.prepare(`
      UPDATE users SET 
        wallet_balance = wallet_balance + ?,
        locked_balance = locked_balance - ?,
        matches_draw = matches_draw + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(match.stake_amount, match.stake_amount, match.creator_id);

    db.prepare(`
      UPDATE users SET 
        wallet_balance = wallet_balance + ?,
        locked_balance = locked_balance - ?,
        matches_draw = matches_draw + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(match.stake_amount, match.stake_amount, match.opponent_id);
  } else if (winnerId) {
    // Winner gets payout
    const winnerPayout = (match.stake_amount * 2) - match.dx_fee;
    
    db.prepare(`
      UPDATE users SET 
        wallet_balance = wallet_balance + ?,
        locked_balance = locked_balance - ?,
        total_winnings = total_winnings + ?,
        matches_won = matches_won + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(winnerPayout, match.stake_amount, winnerPayout, winnerId);

    db.prepare(`
      UPDATE users SET 
        locked_balance = locked_balance - ?,
        matches_lost = matches_lost + 1,
        total_staked = total_staked + ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(match.stake_amount, match.stake_amount, loserId);
  }

  // Record platform fee transaction
  db.prepare(`
    INSERT INTO transactions (user_id, type, amount, description, reference_id)
    VALUES (0, 'platform_fee', ?, 'DX Platform fee from match', ?)
  `).run(match.dx_fee, `FEE${matchId}`);

  res.json({
    message: isDraw ? 'Match resulted in a draw. Stakes refunded.' : 'Match completed! Payout processed.',
    result: isDraw ? 'draw' : 'win',
    winner: winnerId ? (winnerId === match.creator_id ? match.creator_username : match.opponent_username) : null,
    payout: isDraw ? match.stake_amount : (match.stake_amount * 2) - match.dx_fee,
    dx_fee: match.dx_fee
  });
});

// Get user's matches
app.get('/api/matches/my', authenticateToken, (req, res) => {
  const matches = db.prepare(`
    SELECT m.*,
           uc.username as creator_username,
           uo.username as opponent_username
    FROM matches m
    LEFT JOIN users uc ON m.creator_id = uc.id
    LEFT JOIN users uo ON m.opponent_id = uo.id
    WHERE m.creator_id = ? OR m.opponent_id = ?
    ORDER BY m.created_at DESC
  `).all(req.user.id, req.user.id);

  res.json(matches);
});

// ================== ADMIN ROUTES ==================

// Admin login
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;

  const admin = db.prepare('SELECT * FROM users WHERE username = ? AND is_admin = 1').get(username);
  if (!admin) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }

  const validPassword = await bcrypt.compare(password, admin.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }

  const token = jwt.sign(
    { id: admin.id, username: admin.username, is_admin: 1 },
    JWT_SECRET,
    { expiresIn: '1d' }
  );

  res.json({ message: 'Admin login successful', token });
});

// Get all users (admin)
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, email, lichess_username, lichess_verified,
           wallet_balance, locked_balance, total_staked, total_winnings,
           matches_won, matches_lost, matches_draw, is_admin, created_at
    FROM users ORDER BY created_at DESC
  `).all();
  res.json(users);
});

// Get all matches (admin)
app.get('/api/admin/matches', authenticateToken, requireAdmin, (req, res) => {
  const matches = db.prepare(`
    SELECT m.*,
           uc.username as creator_username,
           uo.username as opponent_username,
           uw.username as winner_username
    FROM matches m
    LEFT JOIN users uc ON m.creator_id = uc.id
    LEFT JOIN users uo ON m.opponent_id = uo.id
    LEFT JOIN users uw ON m.winner_id = uw.id
    ORDER BY m.created_at DESC
  `).all();
  res.json(matches);
});

// Get pending withdrawals (admin)
app.get('/api/admin/withdrawals', authenticateToken, requireAdmin, (req, res) => {
  const withdrawals = db.prepare(`
    SELECT t.*, u.username, u.email
    FROM transactions t
    JOIN users u ON t.user_id = u.id
    WHERE t.type = 'withdrawal' AND t.status = 'pending'
    ORDER BY t.created_at DESC
  `).all();
  res.json(withdrawals);
});

// Approve withdrawal (admin)
app.post('/api/admin/withdrawals/:id/approve', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  const transaction = db.prepare(`
    SELECT t.*, u.username FROM transactions t
    JOIN users u ON t.user_id = u.id
    WHERE t.id = ? AND t.status = 'pending'
  `).get(id);

  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  db.prepare(`
    UPDATE transactions SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(id);

  db.prepare(`
    INSERT INTO admin_logs (admin_id, action, details)
    VALUES (?, 'approve_withdrawal', ?)
  `).run(req.user.id, `Approved withdrawal of ₦${transaction.amount} for ${transaction.username}`);

  res.json({ message: 'Withdrawal approved' });
});

// Reject withdrawal (admin)
app.post('/api/admin/withdrawals/:id/reject', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const transaction = db.prepare(`
    SELECT t.*, u.username FROM transactions t
    JOIN users u ON t.user_id = u.id
    WHERE t.id = ? AND t.status = 'pending'
  `).get(id);

  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  // Refund the amount back to user
  db.prepare(`
    UPDATE users SET wallet_balance = wallet_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(transaction.amount, transaction.user_id);

  db.prepare(`
    UPDATE transactions SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(id);

  db.prepare(`
    INSERT INTO admin_logs (admin_id, action, details)
    VALUES (?, 'reject_withdrawal', ?)
  `).run(req.user.id, `Rejected withdrawal of ₦${transaction.amount} for ${transaction.username}. Refunded.`);

  res.json({ message: 'Withdrawal rejected and refunded' });
});

// Get platform stats (admin)
app.get('/api/admin/stats', authenticateToken, requireAdmin, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const totalMatches = db.prepare('SELECT COUNT(*) as count FROM matches').get().count;
  const completedMatches = db.prepare("SELECT COUNT(*) as count FROM matches WHERE status = 'completed'").get().count;
  const pendingMatches = db.prepare("SELECT COUNT(*) as count FROM matches WHERE status IN ('open', 'pending_game')").get().count;
  
  const platformFees = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'platform_fee'
  `).get().total;

  const totalStaked = db.prepare(`
    SELECT COALESCE(SUM(stake_amount), 0) as total FROM matches WHERE status IN ('completed', 'draw')
  `).get().total;

  res.json({
    total_users: totalUsers,
    total_matches: totalMatches,
    completed_matches: completedMatches,
    pending_matches: pendingMatches,
    platform_fees_collected: platformFees,
    total_volume: totalStaked
  });
});

// ================== PUBLIC ROUTES ==================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ================== SERVE FRONTEND ==================

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║                                                ║
║   DX - Chess Staking Platform                 ║
║   MVP Server Running                          ║
║                                                ║
║   Server: http://localhost:${PORT}              ║
║   API:     http://localhost:${PORT}/api         ║
║                                                ║
║   Platform Fee: ${CONFIG.PLATFORM_FEE_PERCENTAGE}%                         ║
║   Min Stake:   ₦${CONFIG.MIN_STAKE}                        ║
║                                                ║
╚════════════════════════════════════════════════╝
  `);
});

module.exports = app;
