// DX - Peer-to-Peer Chess Staking Platform (MVP)
// Main Server Entry Point - Using sql.js (pure JS SQLite)

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'dx-chess-mvp-secret-2024';

// Database path
const DB_PATH = path.join(__dirname, 'dx.db');

let db;

// Configuration
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

function verifyLichessUsername(lichessUsername) {
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

// ================== DATABASE HELPERS ==================

async function initDatabase() {
  const SQL = await initSqlJs();
  
  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  // Create tables
  db.run(`
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
  
  db.run(`
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
      completed_at DATETIME
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      reference_id TEXT,
      status TEXT DEFAULT 'completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  saveDatabase();
  console.log('Database initialized');
}

function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function getOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
  return { lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] };
}

// ================== MIDDLEWARE ==================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

function requireAdmin(req, res, next) {
  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ================== AUTH ROUTES ==================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const existingUser = getOne('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    const result = run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, passwordHash]);
    
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

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = getOne('SELECT * FROM users WHERE username = ? OR email = ?', [username, username]);
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

app.get('/api/user/profile', authenticateToken, (req, res) => {
  const user = getOne(`
    SELECT id, username, email, lichess_username, lichess_verified, 
           wallet_balance, locked_balance, total_staked, total_winnings,
           matches_won, matches_lost, matches_draw, created_at
    FROM users WHERE id = ?
  `, [req.user.id]);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const totalMatches = user.matches_won + user.matches_lost + user.matches_draw;
  const winRate = totalMatches > 0 ? ((user.matches_won / totalMatches) * 100).toFixed(1) : 0;
  
  res.json({ ...user, total_matches: totalMatches, win_rate: winRate });
});

app.post('/api/user/lichess-link', authenticateToken, (req, res) => {
  const { lichess_username } = req.body;
  
  if (!lichess_username) {
    return res.status(400).json({ error: 'Lichess username required' });
  }
  
  if (!verifyLichessUsername(lichess_username)) {
    return res.status(400).json({ error: 'Invalid Lichess username format' });
  }
  
  run('UPDATE users SET lichess_username = ?, lichess_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [lichess_username, req.user.id]);
  
  res.json({ message: 'Lichess account linked', lichess_username });
});

// ================== WALLET ROUTES ==================

app.get('/api/wallet/balance', authenticateToken, (req, res) => {
  const user = getOne('SELECT wallet_balance, locked_balance FROM users WHERE id = ?', [req.user.id]);
  res.json({ available: user.wallet_balance, locked: user.locked_balance });
});

app.get('/api/wallet/transactions', authenticateToken, (req, res) => {
  const transactions = getAll('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.user.id]);
  res.json(transactions);
});

app.post('/api/wallet/deposit', authenticateToken, (req, res) => {
  const { amount, payment_method } = req.body;
  
  if (!amount || amount < 100) {
    return res.status(400).json({ error: 'Minimum deposit is ₦100' });
  }
  
  run('UPDATE users SET wallet_balance = wallet_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [amount, req.user.id]);
  
  run('INSERT INTO transactions (user_id, type, amount, description, reference_id) VALUES (?, \'deposit\', ?, ?, ?)',
      [req.user.id, amount, 'Wallet deposit', `DEP${Date.now()}`]);
  
  const user = getOne('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
  res.json({ message: 'Deposit successful', new_balance: user.wallet_balance });
});

app.post('/api/wallet/withdraw', authenticateToken, (req, res) => {
  const { amount } = req.body;
  
  if (!amount || amount < 500) {
    return res.status(400).json({ error: 'Minimum withdrawal is ₦500' });
  }
  
  const user = getOne('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
  
  if (user.wallet_balance < amount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }
  
  run('UPDATE users SET wallet_balance = wallet_balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [amount, req.user.id]);
  
  run('INSERT INTO transactions (user_id, type, amount, description, reference_id, status) VALUES (?, \'withdrawal\', ?, ?, ?, \'pending\')',
      [req.user.id, amount, 'Withdrawal request', `WTH${Date.now()}`]);
  
  res.json({ message: 'Withdrawal request submitted for approval' });
});

// ================== MATCH ROUTES ==================

app.post('/api/matches/create', authenticateToken, (req, res) => {
  const { stake_amount, time_control, is_rated } = req.body;
  
  if (stake_amount < CONFIG.MIN_STAKE) {
    return res.status(400).json({ error: `Minimum stake is ₦${CONFIG.MIN_STAKE}` });
  }
  
  const user = getOne('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
  
  if (user.wallet_balance < stake_amount) {
    return res.status(400).json({ error: 'Insufficient wallet balance' });
  }
  
  const challengeId = generateChallengeId();
  const totalPot = stake_amount * 2;
  const dxFee = (totalPot * CONFIG.PLATFORM_FEE_PERCENTAGE) / 100;
  
  run('UPDATE users SET wallet_balance = wallet_balance - ?, locked_balance = locked_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [stake_amount, stake_amount, req.user.id]);
  
  run('INSERT INTO matches (challenge_id, creator_id, stake_amount, time_control, is_rated, dx_fee, status) VALUES (?, ?, ?, ?, ?, ?, \'open\')',
      [challengeId, req.user.id, stake_amount, time_control, is_rated ? 1 : 0, dxFee]);
  
  const match = getOne('SELECT * FROM matches WHERE challenge_id = ?', [challengeId]);
  
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

app.get('/api/matches/open', authenticateToken, (req, res) => {
  const matches = getAll(`
    SELECT m.*, u.username as creator_username, u.lichess_username as creator_lichess
    FROM matches m
    JOIN users u ON m.creator_id = u.id
    WHERE m.status = 'open' AND m.creator_id != ?
    ORDER BY m.created_at DESC
  `, [req.user.id]);
  
  res.json(matches);
});

app.post('/api/matches/accept/:challengeId', authenticateToken, (req, res) => {
  const { challengeId } = req.params;
  
  const match = getOne('SELECT * FROM matches WHERE challenge_id = ? AND status = \'open\'', [challengeId]);
  
  if (!match) {
    return res.status(404).json({ error: 'Match not found or already accepted' });
  }
  
  if (match.creator_id === req.user.id) {
    return res.status(400).json({ error: 'Cannot accept your own challenge' });
  }
  
  const user = getOne('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
  
  if (user.wallet_balance < match.stake_amount) {
    return res.status(400).json({ error: 'Insufficient balance to accept match' });
  }
  
  run('UPDATE users SET wallet_balance = wallet_balance - ?, locked_balance = locked_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [match.stake_amount, match.stake_amount, req.user.id]);
  
  run('UPDATE matches SET opponent_id = ?, status = \'pending_game\', created_at = CURRENT_TIMESTAMP WHERE id = ?',
      [req.user.id, match.id]);
  
  const updatedMatch = getOne(`
    SELECT m.*, uc.username as creator_username, uc.lichess_username as creator_lichess,
           uo.username as opponent_username, uo.lichess_username as opponent_lichess
    FROM matches m
    JOIN users uc ON m.creator_id = uc.id
    JOIN users uo ON m.opponent_id = uo.id
    WHERE m.id = ?
  `, [match.id]);
  
  res.json({
    message: 'Match accepted! Players can now play on Lichess.',
    match: updatedMatch,
    instructions: `Both players must play ONE game of ${match.time_control} on Lichess. The first completed game counts.`
  });
});

app.post('/api/matches/submit-result/:matchId', authenticateToken, async (req, res) => {
  const { matchId } = req.params;
  const { lichess_game_id, lichess_game_url } = req.body;
  
  if (!lichess_game_id) {
    return res.status(400).json({ error: 'Lichess game ID is required' });
  }
  
  const match = getOne(`
    SELECT m.*, 
           uc.username as creator_username, uc.lichess_username as creator_lichess,
           uo.username as opponent_username, uo.lichess_username as opponent_lichess
    FROM matches m
    JOIN users uc ON m.creator_id = uc.id
    JOIN users uo ON m.opponent_id = uo.id
    WHERE m.id = ?
  `, [matchId]);
  
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
  
  // Determine winner
  let winnerId = null;
  let loserId = null;
  let isDraw = gameData.winner === null;
  
  if (!isDraw) {
    const creatorLichess = (match.creator_lichess || '').toLowerCase();
    const opponentLichess = (match.opponent_lichess || '').toLowerCase();
    
    if (gameData.winner === 'white') {
      const whitePlayer = (gameData.white?.username || '').toLowerCase();
      if (whitePlayer === creatorLichess) {
        winnerId = match.creator_id;
        loserId = match.opponent_id;
      } else if (whitePlayer === opponentLichess) {
        winnerId = match.opponent_id;
        loserId = match.creator_id;
      }
    } else if (gameData.winner === 'black') {
      const blackPlayer = (gameData.black?.username || '').toLowerCase();
      if (blackPlayer === creatorLichess) {
        winnerId = match.creator_id;
        loserId = match.opponent_id;
      } else if (blackPlayer === opponentLichess) {
        winnerId = match.opponent_id;
        loserId = match.creator_id;
      }
    }
  }
  
  // Update match
  const finalStatus = isDraw ? 'draw' : 'completed';
  const payout = isDraw ? match.stake_amount : (match.stake_amount * 2) - match.dx_fee;
  
  run(`
    UPDATE matches SET 
      lichess_game_id = ?,
      lichess_game_url = ?,
      status = ?,
      winner_id = ?,
      payout_amount = ?,
      completed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [lichess_game_id, lichess_game_url || `https://lichess.org/${lichess_game_id}`, finalStatus, winnerId, payout, matchId]);
  
  if (isDraw) {
    // Refund both
    run('UPDATE users SET wallet_balance = wallet_balance + ?, locked_balance = locked_balance - ?, matches_draw = matches_draw + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [match.stake_amount, match.stake_amount, match.creator_id]);
    run('UPDATE users SET wallet_balance = wallet_balance + ?, locked_balance = locked_balance - ?, matches_draw = matches_draw + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [match.stake_amount, match.stake_amount, match.opponent_id]);
  } else if (winnerId) {
    const winnerPayout = (match.stake_amount * 2) - match.dx_fee;
    
    run('UPDATE users SET wallet_balance = wallet_balance + ?, locked_balance = locked_balance - ?, total_winnings = total_winnings + ?, matches_won = matches_won + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [winnerPayout, match.stake_amount, winnerPayout, winnerId]);
    run('UPDATE users SET locked_balance = locked_balance - ?, matches_lost = matches_lost + 1, total_staked = total_staked + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [match.stake_amount, match.stake_amount, loserId]);
  }
  
  // Platform fee
  run('INSERT INTO transactions (user_id, type, amount, description, reference_id) VALUES (0, \'platform_fee\', ?, \'DX Platform fee from match\', ?)',
      [match.dx_fee, `FEE${matchId}`]);
  
  res.json({
    message: isDraw ? 'Match resulted in a draw. Stakes refunded.' : 'Match completed! Payout processed.',
    result: isDraw ? 'draw' : 'win',
    winner: winnerId ? (winnerId === match.creator_id ? match.creator_username : match.opponent_username) : null,
    payout: payout,
    dx_fee: match.dx_fee
  });
});

app.get('/api/matches/my', authenticateToken, (req, res) => {
  const matches = getAll(`
    SELECT m.*,
           uc.username as creator_username,
           uo.username as opponent_username
    FROM matches m
    LEFT JOIN users uc ON m.creator_id = uc.id
    LEFT JOIN users uo ON m.opponent_id = uo.id
    WHERE m.creator_id = ? OR m.opponent_id = ?
    ORDER BY m.created_at DESC
  `, [req.user.id, req.user.id]);
  
  res.json(matches);
});

// ================== ADMIN ROUTES ==================

app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  const users = getAll(`
    SELECT id, username, email, lichess_username, lichess_verified,
           wallet_balance, locked_balance, total_staked, total_winnings,
           matches_won, matches_lost, matches_draw, is_admin, created_at
    FROM users ORDER BY created_at DESC
  `);
  res.json(users);
});

app.get('/api/admin/matches', authenticateToken, requireAdmin, (req, res) => {
  const matches = getAll(`
    SELECT m.*,
           uc.username as creator_username,
           uo.username as opponent_username,
           uw.username as winner_username
    FROM matches m
    LEFT JOIN users uc ON m.creator_id = uc.id
    LEFT JOIN users uo ON m.opponent_id = uo.id
    LEFT JOIN users uw ON m.winner_id = uw.id
    ORDER BY m.created_at DESC
  `);
  res.json(matches);
});

app.get('/api/admin/withdrawals', authenticateToken, requireAdmin, (req, res) => {
  const withdrawals = getAll(`
    SELECT t.*, u.username, u.email
    FROM transactions t
    JOIN users u ON t.user_id = u.id
    WHERE t.type = 'withdrawal' AND t.status = 'pending'
    ORDER BY t.created_at DESC
  `);
  res.json(withdrawals);
});

app.post('/api/admin/withdrawals/:id/approve', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  
  const transaction = getOne(`
    SELECT t.*, u.username FROM transactions t
    JOIN users u ON t.user_id = u.id
    WHERE t.id = ? AND t.status = 'pending'
  `, [id]);
  
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  
  run('UPDATE transactions SET status = \'approved\', updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  run('INSERT INTO admin_logs (admin_id, action, details) VALUES (?, \'approve_withdrawal\', ?)',
      [req.user.id, `Approved withdrawal of ₦${transaction.amount} for ${transaction.username}`]);
  
  res.json({ message: 'Withdrawal approved' });
});

app.post('/api/admin/withdrawals/:id/reject', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  
  const transaction = getOne(`
    SELECT t.*, u.username FROM transactions t
    JOIN users u ON t.user_id = u.id
    WHERE t.id = ? AND t.status = 'pending'
  `, [id]);
  
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  
  run('UPDATE users SET wallet_balance = wallet_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [transaction.amount, transaction.user_id]);
  run('UPDATE transactions SET status = \'rejected\', updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  run('INSERT INTO admin_logs (admin_id, action, details) VALUES (?, \'reject_withdrawal\', ?)',
      [req.user.id, `Rejected withdrawal of ₦${transaction.amount} for ${transaction.username}. Refunded.`]);
  
  res.json({ message: 'Withdrawal rejected and refunded' });
});

app.get('/api/admin/stats', authenticateToken, requireAdmin, (req, res) => {
  const totalUsers = getOne('SELECT COUNT(*) as count FROM users').count;
  const totalMatches = getOne('SELECT COUNT(*) as count FROM matches').count;
  const completedMatches = getOne("SELECT COUNT(*) as count FROM matches WHERE status = 'completed'").count;
  const pendingMatches = getOne("SELECT COUNT(*) as count FROM matches WHERE status IN ('open', 'pending_game')").count;
  const platformFees = getOne('SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = \'platform_fee\'').total;
  const totalStaked = getOne("SELECT COALESCE(SUM(stake_amount), 0) as total FROM matches WHERE status IN ('completed', 'draw')").total;
  
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================== START SERVER ==================

async function startServer() {
  await initDatabase();
  
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
}

startServer().catch(console.error);

module.exports = app;
