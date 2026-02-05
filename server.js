// DX - Peer-to-Peer Chess Staking Platform (MVP)
// Main Server Entry Point - Using file-based JSON storage

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'dx-chess-mvp-secret-2024';

// Data file path
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Configuration
const CONFIG = {
  MIN_STAKE: 500,
  PLATFORM_FEE_PERCENTAGE: 1.5,
  LICHESS_API_BASE: 'https://lichess.org/api'
};

// ================== DATABASE (JSON FILE-BASED) ==================

let db = {
  users: [],
  matches: [],
  transactions: [],
  admin_logs: []
};

function loadDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      console.error('Failed to load database:', e);
    }
  }
}

function saveDatabase() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function generateId(collection) {
  const ids = collection.map(item => item.id);
  return ids.length > 0 ? Math.max(...ids) + 1 : 1;
}

function findById(collection, id) {
  return collection.find(item => item.id === id);
}

function findOne(collection, predicate) {
  return collection.find(predicate);
}

function findAll(collection, predicate = () => true) {
  return collection.filter(predicate);
}

function insert(collection, item) {
  item.id = generateId(collection);
  item.created_at = new Date().toISOString();
  collection.push(item);
  saveDatabase();
  return item;
}

function update(collection, id, updates) {
  const index = collection.findIndex(item => item.id === id);
  if (index !== -1) {
    collection[index] = { ...collection[index], ...updates, updated_at: new Date().toISOString() };
    saveDatabase();
    return collection[index];
  }
  return null;
}

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
    
    const existingUser = findOne(db.users, u => u.username === username || u.email === email);
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    const user = insert(db.users, {
      username,
      email,
      password_hash: passwordHash,
      lichess_username: null,
      lichess_verified: 0,
      wallet_balance: 0,
      locked_balance: 0,
      total_staked: 0,
      total_winnings: 0,
      matches_won: 0,
      matches_lost: 0,
      matches_draw: 0,
      is_admin: 0
    });
    
    const token = jwt.sign({ id: user.id, username }, JWT_SECRET, { expiresIn: '7d' });
    
    res.status(201).json({
      message: 'Registration successful',
      token,
      user: { id: user.id, username, email }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = findOne(db.users, u => u.username === username || u.email === username);
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
  const user = findById(db.users, req.user.id);
  
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
  
  update(db.users, req.user.id, {
    lichess_username,
    lichess_verified: 1
  });
  
  res.json({ message: 'Lichess account linked', lichess_username });
});

// ================== WALLET ROUTES ==================

app.get('/api/wallet/balance', authenticateToken, (req, res) => {
  const user = findById(db.users, req.user.id);
  res.json({ available: user.wallet_balance, locked: user.locked_balance });
});

app.get('/api/wallet/transactions', authenticateToken, (req, res) => {
  const transactions = findAll(db.transactions, t => t.user_id === req.user.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 50);
  res.json(transactions);
});

app.post('/api/wallet/deposit', authenticateToken, (req, res) => {
  const { amount } = req.body;
  
  if (!amount || amount < 100) {
    return res.status(400).json({ error: 'Minimum deposit is ₦100' });
  }
  
  const user = findById(db.users, req.user.id);
  user.wallet_balance += amount;
  saveDatabase();
  
  insert(db.transactions, {
    user_id: req.user.id,
    type: 'deposit',
    amount,
    description: 'Wallet deposit',
    reference_id: `DEP${Date.now()}`,
    status: 'completed'
  });
  
  res.json({ message: 'Deposit successful', new_balance: user.wallet_balance });
});

app.post('/api/wallet/withdraw', authenticateToken, (req, res) => {
  const { amount } = req.body;
  
  if (!amount || amount < 500) {
    return res.status(400).json({ error: 'Minimum withdrawal is ₦500' });
  }
  
  const user = findById(db.users, req.user.id);
  
  if (user.wallet_balance < amount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }
  
  user.wallet_balance -= amount;
  saveDatabase();
  
  insert(db.transactions, {
    user_id: req.user.id,
    type: 'withdrawal',
    amount,
    description: 'Withdrawal request',
    reference_id: `WTH${Date.now()}`,
    status: 'pending'
  });
  
  res.json({ message: 'Withdrawal request submitted for approval' });
});

// ================== MATCH ROUTES ==================

app.post('/api/matches/create', authenticateToken, (req, res) => {
  const { stake_amount, time_control, is_rated } = req.body;
  
  if (stake_amount < CONFIG.MIN_STAKE) {
    return res.status(400).json({ error: `Minimum stake is ₦${CONFIG.MIN_STAKE}` });
  }
  
  const user = findById(db.users, req.user.id);
  
  if (user.wallet_balance < stake_amount) {
    return res.status(400).json({ error: 'Insufficient wallet balance' });
  }
  
  const challengeId = generateChallengeId();
  const totalPot = stake_amount * 2;
  const dxFee = (totalPot * CONFIG.PLATFORM_FEE_PERCENTAGE) / 100;
  
  user.wallet_balance -= stake_amount;
  user.locked_balance = (user.locked_balance || 0) + stake_amount;
  
  const match = insert(db.matches, {
    challenge_id: challengeId,
    creator_id: req.user.id,
    opponent_id: null,
    stake_amount,
    time_control,
    is_rated: is_rated ? 1 : 0,
    status: 'open',
    winner_id: null,
    lichess_game_id: null,
    lichess_game_url: null,
    dx_fee: dxFee,
    payout_amount: 0
  });
  
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
  const matches = findAll(db.matches, m => m.status === 'open' && m.creator_id !== req.user.id)
    .map(match => ({
      ...match,
      creator_username: findById(db.users, match.creator_id)?.username,
      creator_lichess: findById(db.users, match.creator_id)?.lichess_username
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  res.json(matches);
});

app.post('/api/matches/accept/:challengeId', authenticateToken, (req, res) => {
  const { challengeId } = req.params;
  
  const match = findOne(db.matches, m => m.challenge_id === challengeId && m.status === 'open');
  
  if (!match) {
    return res.status(404).json({ error: 'Match not found or already accepted' });
  }
  
  if (match.creator_id === req.user.id) {
    return res.status(400).json({ error: 'Cannot accept your own challenge' });
  }
  
  const user = findById(db.users, req.user.id);
  
  if (user.wallet_balance < match.stake_amount) {
    return res.status(400).json({ error: 'Insufficient balance to accept match' });
  }
  
  user.wallet_balance -= match.stake_amount;
  user.locked_balance = (user.locked_balance || 0) + match.stake_amount;
  
  update(db.matches, match.id, {
    opponent_id: req.user.id,
    status: 'pending_game'
  });
  
  const updatedMatch = findById(db.matches, match.id);
  const creator = findById(db.users, updatedMatch.creator_id);
  const opponent = findById(db.users, updatedMatch.opponent_id);
  
  res.json({
    message: 'Match accepted! Players can now play on Lichess.',
    match: {
      ...updatedMatch,
      creator_username: creator?.username,
      creator_lichess: creator?.lichess_username,
      opponent_username: opponent?.username,
      opponent_lichess: opponent?.lichess_username
    },
    instructions: `Both players must play ONE game of ${match.time_control} on Lichess. The first completed game counts.`
  });
});

app.post('/api/matches/submit-result/:matchId', authenticateToken, async (req, res) => {
  const { matchId } = req.params;
  const { lichess_game_id, lichess_game_url } = req.body;
  
  if (!lichess_game_id) {
    return res.status(400).json({ error: 'Lichess game ID is required' });
  }
  
  const match = findById(db.matches, parseInt(matchId));
  
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
    const creator = findById(db.users, match.creator_id);
    const opponent = findById(db.users, match.opponent_id);
    const creatorLichess = (creator?.lichess_username || '').toLowerCase();
    const opponentLichess = (opponent?.lichess_username || '').toLowerCase();
    
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
  
  update(db.matches, match.id, {
    lichess_game_id,
    lichess_game_url: lichess_game_url || `https://lichess.org/${lichess_game_id}`,
    status: finalStatus,
    winner_id: winnerId,
    payout_amount: payout,
    completed_at: new Date().toISOString()
  });
  
  const creator = findById(db.users, match.creator_id);
  const opponent = findById(db.users, match.opponent_id);
  
  if (isDraw) {
    // Refund both
    creator.wallet_balance += match.stake_amount;
    creator.locked_balance -= match.stake_amount;
    creator.matches_draw = (creator.matches_draw || 0) + 1;
    
    opponent.wallet_balance += match.stake_amount;
    opponent.locked_balance -= match.stake_amount;
    opponent.matches_draw = (opponent.matches_draw || 0) + 1;
  } else if (winnerId) {
    const winnerPayout = (match.stake_amount * 2) - match.dx_fee;
    
    if (winnerId === match.creator_id) {
      creator.wallet_balance += winnerPayout;
      creator.locked_balance -= match.stake_amount;
      creator.total_winnings = (creator.total_winnings || 0) + winnerPayout;
      creator.matches_won = (creator.matches_won || 0) + 1;
      
      opponent.locked_balance -= match.stake_amount;
      opponent.matches_lost = (opponent.matches_lost || 0) + 1;
      opponent.total_staked = (opponent.total_staked || 0) + match.stake_amount;
    } else {
      opponent.wallet_balance += winnerPayout;
      opponent.locked_balance -= match.stake_amount;
      opponent.total_winnings = (opponent.total_winnings || 0) + winnerPayout;
      opponent.matches_won = (opponent.matches_won || 0) + 1;
      
      creator.locked_balance -= match.stake_amount;
      creator.matches_lost = (creator.matches_lost || 0) + 1;
      creator.total_staked = (creator.total_staked || 0) + match.stake_amount;
    }
  }
  
  // Platform fee
  insert(db.transactions, {
    user_id: 0,
    type: 'platform_fee',
    amount: match.dx_fee,
    description: 'DX Platform fee from match',
    reference_id: `FEE${match.id}`,
    status: 'completed'
  });
  
  saveDatabase();
  
  res.json({
    message: isDraw ? 'Match resulted in a draw. Stakes refunded.' : 'Match completed! Payout processed.',
    result: isDraw ? 'draw' : 'win',
    winner: winnerId ? (winnerId === match.creator_id ? creator?.username : opponent?.username) : null,
    payout: payout,
    dx_fee: match.dx_fee
  });
});

app.get('/api/matches/my', authenticateToken, (req, res) => {
  const matches = findAll(db.matches, m => m.creator_id === req.user.id || m.opponent_id === req.user.id)
    .map(match => {
      const creator = findById(db.users, match.creator_id);
      const opponent = findById(db.users, match.opponent_id);
      const winner = match.winner_id ? findById(db.users, match.winner_id) : null;
      return {
        ...match,
        creator_username: creator?.username,
        opponent_username: opponent?.username,
        winner_username: winner?.username
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  res.json(matches);
});

// ================== ADMIN ROUTES ==================

app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  const users = db.users.map(u => ({
    ...u,
    password_hash: undefined
  })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(users);
});

app.get('/api/admin/matches', authenticateToken, requireAdmin, (req, res) => {
  const matches = db.matches.map(match => {
    const creator = findById(db.users, match.creator_id);
    const opponent = findById(db.users, match.opponent_id);
    const winner = match.winner_id ? findById(db.users, match.winner_id) : null;
    return {
      ...match,
      creator_username: creator?.username,
      opponent_username: opponent?.username,
      winner_username: winner?.username
    };
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  res.json(matches);
});

app.get('/api/admin/withdrawals', authenticateToken, requireAdmin, (req, res) => {
  const withdrawals = findAll(db.transactions, t => t.type === 'withdrawal' && t.status === 'pending')
    .map(t => {
      const user = findById(db.users, t.user_id);
      return {
        ...t,
        username: user?.username,
        email: user?.email
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  res.json(withdrawals);
});

app.post('/api/admin/withdrawals/:id/approve', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  
  const transaction = findById(db.transactions, parseInt(id));
  
  if (!transaction || transaction.status !== 'pending') {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  
  transaction.status = 'approved';
  saveDatabase();
  
  insert(db.admin_logs, {
    admin_id: req.user.id,
    action: 'approve_withdrawal',
    details: `Approved withdrawal of ₦${transaction.amount} for user ${transaction.user_id}`
  });
  
  res.json({ message: 'Withdrawal approved' });
});

app.post('/api/admin/withdrawals/:id/reject', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  
  const transaction = findById(db.transactions, parseInt(id));
  
  if (!transaction || transaction.status !== 'pending') {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  
  // Refund
  const user = findById(db.users, transaction.user_id);
  if (user) {
    user.wallet_balance += transaction.amount;
  }
  
  transaction.status = 'rejected';
  saveDatabase();
  
  insert(db.admin_logs, {
    admin_id: req.user.id,
    action: 'reject_withdrawal',
    details: `Rejected withdrawal of ₦${transaction.amount} for user ${transaction.user_id}. Refunded.`
  });
  
  res.json({ message: 'Withdrawal rejected and refunded' });
});

app.get('/api/admin/stats', authenticateToken, requireAdmin, (req, res) => {
  const totalUsers = db.users.length;
  const totalMatches = db.matches.length;
  const completedMatches = db.matches.filter(m => m.status === 'completed').length;
  const pendingMatches = db.matches.filter(m => m.status === 'open' || m.status === 'pending_game').length;
  const platformFees = db.transactions
    .filter(t => t.type === 'platform_fee')
    .reduce((sum, t) => sum + (t.amount || 0), 0);
  const totalStaked = db.matches
    .filter(m => m.status === 'completed' || m.status === 'draw')
    .reduce((sum, m) => sum + (m.stake_amount || 0), 0);
  
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

loadDatabase();

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
