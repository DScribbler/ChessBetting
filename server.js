// DX - Peer-to-Peer Chess Staking Platform (MVP)
// Enhanced with Challenge System, Lichess API & Appeal Period

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

// Configuration
const CONFIG = {
  MIN_STAKE: 500,
  PLATFORM_FEE_PERCENTAGE: 1.5,
  LICHESS_API_BASE: 'https://lichess.org/api',
  LICHESS_API_TOKEN: process.env.LICHESS_API_TOKEN || '', // Optional: for authenticated requests
  APPEAL_PERIOD_MINUTES: 5,
  MIN_PHONE_LENGTH: 10,
  MAX_PHONE_LENGTH: 15
};

// ================== DATABASE (JSON FILE-BASED) ==================

let db = {
  users: [],
  challenges: [],
  matches: [],
  transactions: [],
  admin_logs: [],
  appeals: []
};

function loadDatabase() {
  const DATA_DIR = path.join(__dirname, 'data');
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const DB_FILE = path.join(DATA_DIR, 'db.json');
  if (fs.existsSync(DB_FILE)) {
    try {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(data);
    } catch (e) {
      console.error('Failed to load database:', e);
    }
  }
}

function saveDatabase() {
  const DATA_DIR = path.join(__dirname, 'data');
  const DB_FILE = path.join(DATA_DIR, 'db.json');
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function generateId(arr) {
  return arr.length > 0 ? Math.max(...arr.map(i => i.id)) + 1 : 1;
}

function findById(arr, id) {
  return arr.find(i => i.id === id);
}

function findOne(arr, predicate) {
  return arr.find(predicate);
}

function findAll(arr, predicate = () => true) {
  return arr.filter(predicate);
}

function insert(arr, item) {
  item.id = generateId(arr);
  item.created_at = new Date().toISOString();
  arr.push(item);
  saveDatabase();
  return item;
}

function update(arr, id, updates) {
  const index = arr.findIndex(i => i.id === id);
  if (index !== -1) {
    arr[index] = { ...arr[index], ...updates, updated_at: new Date().toISOString() };
    saveDatabase();
    return arr[index];
  }
  return null;
}

// ================== HELPER FUNCTIONS ==================

function generateChallengeCode() {
  return 'DX' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
}

function generateLichessGameId() {
  return Math.random().toString(36).substring(2, 12);
}

function validatePhone(phone) {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= CONFIG.MIN_PHONE_LENGTH && cleaned.length <= CONFIG.MAX_PHONE_LENGTH;
}

function validateUsername(username) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

function validateFullName(name) {
  return name.trim().length >= 2 && name.trim().length <= 100;
}

async function createLichessGame(creatorLichess, opponentLichess, timeControl, rated, color = 'random') {
  try {
    // Lichess API challenge creation
    const endpoint = `${CONFIG.LICHESS_API_BASE}/challenge`;
    
    const payload = {
      rated: rated,
      clock: timeControl,
      color: color,
      variant: 'standard',
      timeout: 30
    };
    
    const headers = {
      'Authorization': `Bearer ${CONFIG.LICHESS_API_TOKEN}`,
      'Content-Type': 'application/json'
    };
    
    // Note: Without API token, we'll generate a game ID and let users create it manually
    // In production with API token, this would create a real challenge
    
    // For MVP, we'll create a simulated game reference
    const gameId = generateLichessGameId();
    
    return {
      success: true,
      gameId: gameId,
      gameUrl: `https://lichess.org/${gameId}`,
      message: 'Game reference created. Players should play on Lichess and submit result.'
    };
  } catch (error) {
    console.error('Lichess API error:', error.message);
    return { success: false, error: error.message };
  }
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

function calculateFee(stakeAmount) {
  const totalPot = stakeAmount * 2;
  return {
    totalPot,
    fee: (totalPot * CONFIG.PLATFORM_FEE_PERCENTAGE) / 100,
    winnerPayout: totalPot - (totalPot * CONFIG.PLATFORM_FEE_PERCENTAGE) / 100
  };
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
    const { username, email, password, phone, full_name } = req.body;
    
    // Validation
    if (!username || !email || !password || !phone || !full_name) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    if (!validateUsername(username)) {
      return res.status(400).json({ error: 'Username must be 3-20 alphanumeric characters or underscores' });
    }
    
    if (!validatePhone(phone)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }
    
    if (!validateFullName(full_name)) {
      return res.status(400).json({ error: 'Full name must be 2-100 characters' });
    }
    
    // Check unique constraints
    const existingUser = findOne(db.users, u => 
      u.username === username || u.email === email || u.phone === phone
    );
    
    if (existingUser) {
      if (existingUser.username === username) {
        return res.status(400).json({ error: 'Username already taken' });
      }
      if (existingUser.email === email) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      if (existingUser.phone === phone) {
        return res.status(400).json({ error: 'Phone number already registered' });
      }
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    
    const user = insert(db.users, {
      username,
      email,
      password_hash: passwordHash,
      phone,
      full_name,
      phone_verified: 0,
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
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        full_name: user.full_name
      }
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
        phone: user.phone,
        full_name: user.full_name,
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
  
  res.json({
    ...user,
    password_hash: undefined,
    total_matches: totalMatches,
    win_rate: winRate
  });
});

app.post('/api/user/lichess-link', authenticateToken, (req, res) => {
  const { lichess_username } = req.body;
  
  if (!lichess_username) {
    return res.status(400).json({ error: 'Lichess username required' });
  }
  
  if (!validateUsername(lichess_username)) {
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
  const { amount, bank_details } = req.body;
  
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
    status: 'pending',
    bank_details: bank_details || null
  });
  
  res.json({ message: 'Withdrawal request submitted for approval' });
});

// ================== CHALLENGE ROUTES ==================

// Send challenge to specific user
app.post('/api/challenges/send', authenticateToken, (req, res) => {
  const { opponent_username, stake_amount, time_control, is_rated } = req.body;
  
  // Validation
  if (!opponent_username) {
    return res.status(400).json({ error: 'Opponent username required' });
  }
  
  if (stake_amount < CONFIG.MIN_STAKE) {
    return res.status(400).json({ error: `Minimum stake is ₦${CONFIG.MIN_STAKE}` });
  }
  
  // Check if opponent exists
  const opponent = findOne(db.users, u => u.username === opponent_username);
  if (!opponent) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (opponent.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot challenge yourself' });
  }
  
  const user = findById(db.users, req.user.id);
  
  if (user.wallet_balance < stake_amount) {
    return res.status(400).json({ error: 'Insufficient wallet balance' });
  }
  
  // Check for existing pending challenges between these users
  const existingChallenge = findOne(db.challenges, c => 
    c.creator_id === req.user.id && 
    c.opponent_id === opponent.id &&
    c.status === 'pending' &&
    new Date(c.expires_at) > new Date()
  );
  
  if (existingChallenge) {
    return res.status(400).json({ error: 'You already have a pending challenge to this user' });
  }
  
  // Create challenge
  const challengeCode = generateChallengeCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry
  
  const { totalPot, fee, winnerPayout } = calculateFee(stake_amount);
  
  const challenge = insert(db.challenges, {
    challenge_code: challengeCode,
    creator_id: req.user.id,
    creator_username: user.username,
    creator_lichess: user.lichess_username,
    opponent_id: opponent.id,
    opponent_username: opponent.username,
    opponent_lichess: opponent.lichess_username,
    stake_amount,
    time_control,
    is_rated: is_rated ? 1 : 0,
    status: 'pending',
    expires_at: expiresAt.toISOString(),
    total_pot: totalPot,
    dx_fee: fee,
    winner_payout: winnerPayout
  });
  
  res.status(201).json({
    message: 'Challenge sent successfully',
    challenge: {
      ...challenge,
      fee_breakdown: {
        stake_per_player: stake_amount,
        total_pot: totalPot,
        dx_fee: fee,
        winner_payout: winnerPayout
      }
    }
  });
});

// Get pending challenges (received)
app.get('/api/challenges/pending', authenticateToken, (req, res) => {
  const challenges = findAll(db.challenges, c => 
    c.opponent_id === req.user.id && 
    c.status === 'pending' &&
    new Date(c.expires_at) > new Date()
  ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  res.json(challenges);
});

// Get sent challenges
app.get('/api/challenges/sent', authenticateToken, (req, res) => {
  const challenges = findAll(db.challenges, c => 
    c.creator_id === req.user.id
  ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  res.json(challenges);
});

// Accept challenge
app.post('/api/challenges/:code/accept', authenticateToken, (req, res) => {
  const { code } = req.params;
  
  const challenge = findOne(db.challenges, c => 
    c.challenge_code === code && 
    c.status === 'pending' &&
    c.opponent_id === req.user.id
  );
  
  if (!challenge) {
    return res.status(404).json({ error: 'Challenge not found or expired' });
  }
  
  if (new Date(challenge.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Challenge has expired' });
  }
  
  const opponent = findById(db.users, req.user.id);
  
  if (opponent.wallet_balance < challenge.stake_amount) {
    return res.status(400).json({ error: 'Insufficient balance to accept challenge' });
  }
  
  // Debit opponent
  opponent.wallet_balance -= challenge.stake_amount;
  opponent.locked_balance = (opponent.locked_balance || 0) + challenge.stake_amount;
  
  // Debit creator
  const creator = findById(db.users, challenge.creator_id);
  creator.locked_balance = (creator.locked_balance || 0) + challenge.stake_amount;
  
  // Update challenge status
  update(db.challenges, challenge.id, {
    status: 'accepted',
    accepted_at: new Date().toISOString()
  });
  
  // Create match record
  const { totalPot, fee, winnerPayout } = calculateFee(challenge.stake_amount);
  
  const match = insert(db.matches, {
    challenge_id: challenge.id,
    creator_id: challenge.creator_id,
    opponent_id: challenge.opponent_id,
    stake_amount: challenge.stake_amount,
    time_control: challenge.time_control,
    is_rated: challenge.is_rated,
    status: 'in_progress',
    lichess_game_id: null,
    lichess_game_url: null,
    dx_fee: fee,
    payout_amount: 0,
    appeal_deadline: null,
    appeal_submitted: 0
  });
  
  saveDatabase();
  
  res.json({
    message: 'Challenge accepted! Both players have been debited.',
    challenge,
    match,
    instructions: `Both players must play one ${challenge.time_control} game on Lichess. The first completed game counts.`
  });
});

// Decline challenge
app.post('/api/challenges/:code/decline', authenticateToken, (req, res) => {
  const { code } = req.params;
  const { reason } = req.body;
  
  const challenge = findOne(db.challenges, c => 
    c.challenge_code === code && 
    c.status === 'pending'
  );
  
  if (!challenge) {
    return res.status(404).json({ error: 'Challenge not found' });
  }
  
  if (challenge.opponent_id !== req.user.id && challenge.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  
  update(db.challenges, challenge.id, {
    status: 'declined',
    declined_at: new Date().toISOString(),
    decline_reason: reason || null
  });
  
  res.json({ message: 'Challenge declined' });
});

// Cancel challenge (by creator)
app.post('/api/challenges/:code/cancel', authenticateToken, (req, res) => {
  const { code } = req.params;
  
  const challenge = findOne(db.challenges, c => 
    c.challenge_code === code && 
    c.status === 'pending' &&
    c.creator_id === req.user.id
  );
  
  if (!challenge) {
    return res.status(404).json({ error: 'Challenge not found or cannot be cancelled' });
  }
  
  update(db.challenges, challenge.id, {
    status: 'cancelled',
    cancelled_at: new Date().toISOString()
  });
  
  res.json({ message: 'Challenge cancelled' });
});

// ================== MATCH & GAME ROUTES ==================

// Get active matches
app.get('/api/matches/active', authenticateToken, (req, res) => {
  const matches = findAll(db.matches, m => 
    (m.creator_id === req.user.id || m.opponent_id === req.user.id) &&
    m.status === 'in_progress'
  ).map(m => {
    const creator = findById(db.users, m.creator_id);
    const opponent = findById(db.users, m.opponent_id);
    return {
      ...m,
      creator_username: creator?.username,
      opponent_username: opponent?.username
    };
  });
  
  res.json(matches);
});

// Get completed matches
app.get('/api/matches/completed', authenticateToken, (req, res) => {
  const matches = findAll(db.matches, m => 
    (m.creator_id === req.user.id || m.opponent_id === req.user.id) &&
    ['completed', 'appealed', 'disbursed'].includes(m.status)
  ).map(m => {
    const creator = findById(db.users, m.creator_id);
    const opponent = findById(db.users, m.opponent_id);
    const winner = m.winner_id ? findById(db.users, m.winner_id) : null;
    return {
      ...m,
      creator_username: creator?.username,
      opponent_username: opponent?.username,
      winner_username: winner?.username
    };
  }).sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at));
  
  res.json(matches);
});

// Submit game result
app.post('/api/matches/:id/submit-result', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { lichess_game_id, lichess_game_url } = req.body;
  
  if (!lichess_game_id) {
    return res.status(400).json({ error: 'Lichess game ID required' });
  }
  
  const match = findById(db.matches, parseInt(id));
  
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }
  
  if (match.creator_id !== req.user.id && match.opponent_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  
  if (match.status !== 'in_progress') {
    return res.status(400).json({ error: 'Match is not in progress' });
  }
  
  // Verify game on Lichess
  const gameData = await fetchLichessGame(lichess_game_id);
  
  if (!gameData) {
    return res.status(400).json({ error: 'Could not verify game on Lichess' });
  }
  
  // Determine winner
  let winnerId = null;
  let isDraw = gameData.winner === null;
  
  if (!isDraw) {
    const creator = findById(db.users, match.creator_id);
    const opponent = findById(db.users, match.opponent_id);
    const creatorLichess = (creator?.lichess_username || '').toLowerCase();
    const opponentLichess = (opponent?.lichess_username || '').toLowerCase();
    
    const whitePlayer = (gameData.white?.username || '').toLowerCase();
    const blackPlayer = (gameData.black?.username || '').toLowerCase();
    
    if (gameData.winner === 'white') {
      if (whitePlayer === creatorLichess) {
        winnerId = match.creator_id;
      } else if (whitePlayer === opponentLichess) {
        winnerId = match.opponent_id;
      }
    } else if (gameData.winner === 'black') {
      if (blackPlayer === creatorLichess) {
        winnerId = match.creator_id;
      } else if (blackPlayer === opponentLichess) {
        winnerId = match.opponent_id;
      }
    }
  }
  
  // Set appeal deadline (5 minutes from now)
  const appealDeadline = new Date(Date.now() + CONFIG.APPEAL_PERIOD_MINUTES * 60 * 1000);
  
  update(db.matches, match.id, {
    lichess_game_id,
    lichess_game_url: lichess_game_url || `https://lichess.org/${lichess_game_id}`,
    status: isDraw ? 'draw' : 'awaiting_appeal',
    winner_id: winnerId,
    appeal_deadline: appealDeadline.toISOString(),
    completed_at: new Date().toISOString()
  });
  
  res.json({
    message: isDraw 
      ? 'Game submitted. Result: Draw. Stakes will be refunded after appeal period.' 
      : `Game submitted. Winner determined. You have ${CONFIG.APPEAL_PERIOD_MINUTES} minutes to appeal.`,
    result: isDraw ? 'draw' : 'win',
    winner: winnerId ? (winnerId === match.creator_id ? 'creator' : 'opponent') : null,
    appeal_deadline: appealDeadline.toISOString()
  });
});

// Submit appeal
app.post('/api/matches/:id/appeal', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { reason, evidence } = req.body;
  
  const match = findById(db.matches, parseInt(id));
  
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }
  
  if (match.creator_id !== req.user.id && match.opponent_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  
  if (match.status !== 'awaiting_appeal') {
    return res.status(400).json({ error: 'Match is not awaiting appeal' });
  }
  
  if (new Date(match.appeal_deadline) < new Date()) {
    return res.status(400).json({ error: 'Appeal deadline has passed' });
  }
  
  // Check if user already appealed
  const existingAppeal = findOne(db.appeals, a => 
    a.match_id === match.id && a.user_id === req.user.id
  );
  
  if (existingAppeal) {
    return res.status(400).json({ error: 'You have already submitted an appeal' });
  }
  
  insert(db.appeals, {
    match_id: match.id,
    user_id: req.user.id,
    reason: reason || 'Disputed result',
    evidence: evidence || null,
    status: 'pending'
  });
  
  update(db.matches, match.id, {
    status: 'appealed'
  });
  
  res.json({ message: 'Appeal submitted. Admin will review.' });
});

// Process match disbursement (called by cron/admin)
app.post('/api/matches/:id/process-disbursement', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const match = findById(db.matches, parseInt(id));
  
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }
  
  if (!['awaiting_appeal', 'draw'].includes(match.status)) {
    return res.status(400).json({ error: 'Match is not ready for disbursement' });
  }
  
  // Check if appeal deadline has passed
  if (match.status === 'awaiting_appeal' && match.appeal_deadline) {
    if (new Date(match.appeal_deadline) > new Date()) {
      return res.status(400).json({ error: 'Appeal deadline has not passed yet' });
    }
    
    // Check for pending appeals
    const pendingAppeals = findAll(db.appeals, a => a.match_id === match.id && a.status === 'pending');
    if (pendingAppeals.length > 0) {
      return res.status(400).json({ error: 'There are pending appeals for this match' });
    }
  }
  
  const creator = findById(db.users, match.creator_id);
  const opponent = findById(db.users, match.opponent_id);
  
  if (match.status === 'draw') {
    // Refund both players
    creator.wallet_balance += match.stake_amount;
    creator.locked_balance -= match.stake_amount;
    creator.matches_draw = (creator.matches_draw || 0) + 1;
    
    opponent.wallet_balance += match.stake_amount;
    opponent.locked_balance -= match.stake_amount;
    opponent.matches_draw = (opponent.matches_draw || 0) + 1;
    
    // Record transactions
    insert(db.transactions, {
      user_id: creator.id,
      type: 'refund',
      amount: match.stake_amount,
      description: 'Draw - stake refunded',
      reference_id: `REF${match.id}`
    });
    
    insert(db.transactions, {
      user_id: opponent.id,
      type: 'refund',
      amount: match.stake_amount,
      description: 'Draw - stake refunded',
      reference_id: `REF${match.id}`
    });
  } else if (match.winner_id) {
    // Pay winner
    const winner = findById(db.users, match.winner_id);
    const loser = winner.id === match.creator_id ? opponent : creator;
    
    winner.wallet_balance += match.winner_payout || match.payout_amount;
    winner.locked_balance -= match.stake_amount;
    winner.total_winnings = (winner.total_winnings || 0) + (match.winner_payout || match.payout_amount);
    winner.matches_won = (winner.matches_won || 0) + 1;
    
    loser.locked_balance -= match.stake_amount;
    loser.matches_lost = (loser.matches_lost || 0) + 1;
    loser.total_staked = (loser.total_staked || 0) + match.stake_amount;
    
    // Record transactions
    insert(db.transactions, {
      user_id: winner.id,
      type: 'winning',
      amount: match.winner_payout || match.payout_amount,
      description: `Match winnings (minus ₦${match.dx_fee} fee)`,
      reference_id: `WIN${match.id}`
    });
    
    // Platform fee
    insert(db.transactions, {
      user_id: 0,
      type: 'platform_fee',
      amount: match.dx_fee,
      description: 'DX Platform fee',
      reference_id: `FEE${match.id}`
    });
  }
  
  update(db.matches, match.id, {
    status: 'disbursed',
    disbursed_at: new Date().toISOString()
  });
  
  saveDatabase();
  
  res.json({ message: 'Disbursement processed successfully' });
});

// ================== ADMIN ROUTES ==================

app.get('/api/admin/stats', authenticateToken, requireAdmin, (req, res) => {
  const totalUsers = db.users.length;
  const pendingChallenges = db.challenges.filter(c => c.status === 'pending').length;
  const activeMatches = db.matches.filter(m => m.status === 'in_progress').length;
  const awaitingAppeal = db.matches.filter(m => m.status === 'awaiting_appeal').length;
  const platformFees = db.transactions
    .filter(t => t.type === 'platform_fee')
    .reduce((sum, t) => sum + (t.amount || 0), 0);
  
  res.json({
    total_users: totalUsers,
    pending_challenges: pendingChallenges,
    active_matches: activeMatches,
    awaiting_appeal: awaitingAppeal,
    platform_fees_collected: platformFees
  });
});

app.get('/api/admin/challenges', authenticateToken, requireAdmin, (req, res) => {
  const challenges = db.challenges.map(c => ({
    ...c,
    expires_in_minutes: Math.max(0, Math.ceil((new Date(c.expires_at) - new Date()) / 60000))
  })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(challenges);
});

app.get('/api/admin/appeals', authenticateToken, requireAdmin, (req, res) => {
  const appeals = db.appeals.map(a => {
    const match = findById(db.matches, a.match_id);
    const user = findById(db.users, a.user_id);
    return {
      ...a,
      match,
      username: user?.username
    };
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(appeals);
});

app.post('/api/admin/appeals/:id/resolve', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { decision } = req.body;
  
  const appeal = findById(db.appeals, parseInt(id));
  
  if (!appeal) {
    return res.status(404).json({ error: 'Appeal not found' });
  }
  
  update(db.appeals, appeal.id, {
    status: decision === 'upheld' ? 'upheld' : 'rejected',
    resolved_at: new Date().toISOString(),
    resolved_by: req.user.id
  });
  
  // If upheld, need admin intervention
  if (decision === 'upheld') {
    update(db.matches, appeal.match_id, {
      status: 'disputed',
      admin_review: 1
    });
  }
  
  res.json({ message: 'Appeal resolved' });
});

// ================== PUBLIC ROUTES ==================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================== START ==================

loadDatabase();

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║                                                ║
║   DX - Chess Staking Platform                 ║
║   Enhanced MVP with Challenge System          ║
║                                                ║
║   Server: http://localhost:${PORT}              ║
║   API:     http://localhost:${PORT}/api         ║
║                                                ║
║   Platform Fee: ${CONFIG.PLATFORM_FEE_PERCENTAGE}%                         ║
║   Min Stake:   ₦${CONFIG.MIN_STAKE}                        ║
║   Appeal Period: ${CONFIG.APPEAL_PERIOD_MINUTES} minutes                    ║
║                                                ║
╚════════════════════════════════════════════════╝
  `);
});

module.exports = app;
