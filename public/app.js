// DX - Chess Staking Platform Frontend Application (Enhanced)

const API_BASE = '/api';

// State
let currentUser = null;
let authToken = localStorage.getItem('dx_auth_token');

// ================== INITIALIZATION ==================

document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

async function initializeApp() {
  if (authToken) {
    await loadUserProfile();
  }
  
  if (currentUser) {
    showApp();
  } else {
    showAuth();
  }
}

// ================== AUTHENTICATION ==================

async function handleLogin(event) {
  event.preventDefault();
  
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }
    
    authToken = data.token;
    localStorage.setItem('dx_auth_token', authToken);
    currentUser = data.user;
    
    showApp();
    showToast('Login successful!', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleRegister(event) {
  event.preventDefault();
  
  const username = document.getElementById('registerUsername').value;
  const full_name = document.getElementById('registerFullName').value;
  const email = document.getElementById('registerEmail').value;
  const phone = document.getElementById('registerPhone').value;
  const password = document.getElementById('registerPassword').value;
  
  try {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, full_name, email, phone, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    
    authToken = data.token;
    localStorage.setItem('dx_auth_token', authToken);
    currentUser = data.user;
    
    showApp();
    showToast('Account created successfully!', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('dx_auth_token');
  showAuth();
  showToast('Logged out successfully', 'success');
}

async function loadUserProfile() {
  try {
    const response = await fetch(`${API_BASE}/user/profile`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (!response.ok) {
      throw new Error('Failed to load profile');
    }
    
    currentUser = await response.json();
    
    // Check if Lichess account is linked
    if (!currentUser.lichess_username) {
      setTimeout(() => {
        openModal('lichessModal');
      }, 1000);
    }
  } catch (error) {
    console.error('Failed to load profile:', error);
    localStorage.removeItem('dx_auth_token');
    authToken = null;
  }
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
}

// ================== UI NAVIGATION ==================

function showAuth() {
  document.getElementById('authSection').classList.remove('hidden');
  document.getElementById('dashboardSection').classList.add('hidden');
  document.getElementById('challengesSection').classList.add('hidden');
  document.getElementById('send-challengeSection').classList.add('hidden');
  document.getElementById('matchesSection').classList.add('hidden');
  document.getElementById('submitResultSection').classList.add('hidden');
  document.getElementById('appealSection').classList.add('hidden');
  document.getElementById('walletSection').classList.add('hidden');
  document.getElementById('adminSection').classList.add('hidden');
  
  document.querySelector('.navbar').classList.add('hidden');
}

function showApp() {
  document.getElementById('authSection').classList.add('hidden');
  document.querySelector('.navbar').classList.remove('hidden');
  
  // Update navigation
  document.getElementById('dashboardUsername').textContent = currentUser.username;
  document.getElementById('navBalanceValue').textContent = formatNumber(currentUser.wallet_balance);
  
  // Show admin link if admin
  if (currentUser.is_admin) {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
  } else {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }
  
  // Load initial data
  loadDashboard();
}

function showSection(section) {
  // Hide all sections
  document.querySelectorAll('.section-container').forEach(s => s.classList.add('hidden'));
  
  // Update nav links
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelector(`.nav-link[data-section="${section}"]`)?.classList.add('active');
  
  // Show selected section
  const sectionMap = {
    'dashboard': 'dashboardSection',
    'challenges': 'challengesSection',
    'send-challenge': 'send-challengeSection',
    'matches': 'matchesSection',
    'wallet': 'walletSection',
    'admin': 'adminSection'
  };
  
  const sectionId = sectionMap[section];
  if (sectionId) {
    document.getElementById(sectionId).classList.remove('hidden');
  }
  
  // Load section data
  switch (section) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'challenges':
      loadReceivedChallenges();
      loadSentChallenges();
      break;
    case 'send-challenge':
      initChallengeForm();
      break;
    case 'matches':
      loadActiveMatches();
      loadAwaitingMatches();
      loadCompletedMatches();
      break;
    case 'wallet':
      loadWallet();
      break;
    case 'admin':
      loadAdminStats();
      break;
  }
}

// ================== DASHBOARD ==================

async function loadDashboard() {
  if (!currentUser) return;
  
  document.getElementById('walletBalance').textContent = formatNumber(currentUser.wallet_balance);
  document.getElementById('lockedBalance').textContent = formatNumber(currentUser.locked_balance || 0);
  document.getElementById('matchesWon').textContent = currentUser.matches_won || 0;
  document.getElementById('winRate').textContent = currentUser.win_rate || 0;
  
  // Load pending challenges and active matches
  await loadPendingChallenges();
  await loadActiveMatchesForDashboard();
}

async function loadPendingChallenges() {
  try {
    const response = await fetch(`${API_BASE}/challenges/pending`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const challenges = await response.json();
    const container = document.getElementById('pendingChallengesList');
    
    if (challenges.length === 0) {
      container.innerHTML = '<p class="empty-state">No pending challenges</p>';
      return;
    }
    
    container.innerHTML = challenges.map(ch => `
      <div class="challenge-card pending">
        <div class="challenge-header">
          <span class="challenge-creator">${escapeHtml(ch.creator_username)}</span>
          <span class="challenge-stake">₦${formatNumber(ch.stake_amount)}</span>
        </div>
        <div class="challenge-details">
          <span>⏱️ ${ch.time_control}</span>
          <span>${ch.is_rated ? '⭐ Rated' : '⚡ Casual'}</span>
        </div>
        <div class="challenge-actions">
          <button class="btn btn-success btn-sm" onclick="acceptChallenge('${ch.challenge_code}')">Accept</button>
          <button class="btn btn-danger btn-sm" onclick="declineChallenge('${ch.challenge_code}')">Decline</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Failed to load pending challenges:', error);
  }
}

async function loadActiveMatchesForDashboard() {
  try {
    const response = await fetch(`${API_BASE}/matches/active`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const matches = await response.json();
    const container = document.getElementById('activeMatchesList');
    
    if (matches.length === 0) {
      container.innerHTML = '<p class="empty-state">No active matches</p>';
      return;
    }
    
    container.innerHTML = matches.map(m => `
      <div class="match-card active">
        <div class="match-header">
          <span class="opponent">vs ${escapeHtml(m.opponent_username || 'TBD')}</span>
          <span class="match-stake">₦${formatNumber(m.stake_amount)}</span>
        </div>
        <div class="match-details">
          <span>⏱️ ${m.time_control}</span>
          <span>${m.is_rated ? '⭐ Rated' : '⚡ Casual'}</span>
        </div>
        <button class="btn btn-primary btn-block" onclick="showSubmitResult(${m.id})">
          Submit Game Result
        </button>
      </div>
    `).join('');
  } catch (error) {
    console.error('Failed to load active matches:', error);
  }
}

// ================== CHALLENGES ==================

async function loadReceivedChallenges() {
  try {
    const response = await fetch(`${API_BASE}/challenges/pending`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const challenges = await response.json();
    const container = document.getElementById('receivedChallenges');
    
    if (challenges.length === 0) {
      container.innerHTML = '<p class="empty-state">No pending challenges received</p>';
      return;
    }
    
    container.innerHTML = challenges.map(ch => `
      <div class="challenge-card received">
        <div class="challenge-header">
          <span class="challenge-from">From: ${escapeHtml(ch.creator_username)}</span>
          <span class="challenge-stake">₦${formatNumber(ch.stake_amount)}</span>
        </div>
        <div class="challenge-details">
          <span>⏱️ ${ch.time_control}</span>
          <span>${ch.is_rated ? '⭐ Rated' : '⚡ Casual'}</span>
        </div>
        <div class="fee-preview">
          <small>Winner gets: ₦${formatNumber(ch.winner_payout)}</small>
        </div>
        <div class="challenge-actions">
          <button class="btn btn-success" onclick="acceptChallenge('${ch.challenge_code}')">Accept</button>
          <button class="btn btn-outline" onclick="declineChallenge('${ch.challenge_code}')">Decline</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    document.getElementById('receivedChallenges').innerHTML = '<p class="empty-state">Failed to load challenges</p>';
  }
}

async function loadSentChallenges() {
  try {
    const response = await fetch(`${API_BASE}/challenges/sent`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const challenges = await response.json();
    const container = document.getElementById('sentChallenges');
    
    if (challenges.length === 0) {
      container.innerHTML = '<p class="empty-state">No sent challenges</p>';
      return;
    }
    
    container.innerHTML = challenges.map(ch => {
      let statusBadge = '';
      switch (ch.status) {
        case 'pending':
          statusBadge = '<span class="status-badge pending">Pending</span>';
          break;
        case 'accepted':
          statusBadge = '<span class="status-badge completed">Accepted</span>';
          break;
        case 'declined':
          statusBadge = '<span class="status-badge declined">Declined</span>';
          break;
        case 'cancelled':
          statusBadge = '<span class="status-badge">Cancelled</span>';
          break;
        default:
          statusBadge = `<span class="status-badge">${ch.status}</span>`;
      }
      
      return `
        <div class="challenge-card sent">
          <div class="challenge-header">
            <span class="challenge-to">To: ${escapeHtml(ch.opponent_username)}</span>
            <span class="challenge-stake">₦${formatNumber(ch.stake_amount)}</span>
          </div>
          <div class="challenge-details">
            <span>⏱️ ${ch.time_control}</span>
            <span>${ch.is_rated ? '⭐ Rated' : '⚡ Casual'}</span>
          </div>
          <div class="challenge-status">
            ${statusBadge}
          </div>
          ${ch.status === 'pending' ? `
            <button class="btn btn-outline btn-sm" onclick="cancelChallenge('${ch.challenge_code}')">Cancel</button>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (error) {
    document.getElementById('sentChallenges').innerHTML = '<p class="empty-state">Failed to load challenges</p>';
  }
}

function switchChallengeTab(tab) {
  document.querySelectorAll('#challengesSection .tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  
  document.getElementById('receivedChallenges').classList.toggle('hidden', tab !== 'received');
  document.getElementById('sentChallenges').classList.toggle('hidden', tab !== 'sent');
}

async function acceptChallenge(challengeCode) {
  try {
    const response = await fetch(`${API_BASE}/challenges/${challengeCode}/accept`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to accept challenge');
    }
    
    showToast(data.message, 'success');
    loadDashboard();
    loadReceivedChallenges();
    showSection('matches');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function declineChallenge(challengeCode) {
  try {
    const response = await fetch(`${API_BASE}/challenges/${challengeCode}/decline`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}` 
      },
      body: JSON.stringify({})
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to decline challenge');
    }
    
    showToast(data.message, 'success');
    loadReceivedChallenges();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function cancelChallenge(challengeCode) {
  try {
    const response = await fetch(`${API_BASE}/challenges/${challengeCode}/cancel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to cancel challenge');
    }
    
    showToast(data.message, 'success');
    loadSentChallenges();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ================== SEND CHALLENGE ==================

function initChallengeForm() {
  // Add event listeners for fee calculation
  document.getElementById('challengeStake').addEventListener('input', updateChallengeFeePreview);
}

function updateChallengeFeePreview() {
  const stake = parseFloat(document.getElementById('challengeStake').value) || 0;
  const totalPot = stake * 2;
  const fee = (totalPot * 1.5) / 100;
  const winnerPayout = totalPot - fee;
  
  document.getElementById('challengeStakeDisplay').textContent = `₦${formatNumber(stake)}`;
  document.getElementById('challengePotDisplay').textContent = `₦${formatNumber(totalPot)}`;
  document.getElementById('challengeFeeDisplay').textContent = `₦${formatNumber(fee)}`;
  document.getElementById('challengeWinnerDisplay').textContent = `₦${formatNumber(winnerPayout)}`;
}

async function handleSendChallenge(event) {
  event.preventDefault();
  
  const opponent_username = document.getElementById('opponentUsername').value;
  const stake_amount = parseFloat(document.getElementById('challengeStake').value);
  const time_control = document.getElementById('challengeTimeControl').value;
  const is_rated = document.querySelector('input[name="challengeRated"]:checked').value === 'true';
  
  try {
    const response = await fetch(`${API_BASE}/challenges/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ opponent_username, stake_amount, time_control, is_rated })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to send challenge');
    }
    
    showToast(`Challenge sent to ${opponent_username}!`, 'success');
    
    // Reset form
    document.getElementById('sendChallengeForm').reset();
    updateChallengeFeePreview();
    
    // Show challenges section
    showSection('challenges');
    loadSentChallenges();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ================== MATCHES ==================

async function loadActiveMatches() {
  try {
    const response = await fetch(`${API_BASE}/matches/active`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const matches = await response.json();
    const container = document.getElementById('activeMatchesList2');
    
    if (matches.length === 0) {
      container.innerHTML = '<p class="empty-state">No active matches</p>';
      return;
    }
    
    container.innerHTML = matches.map(m => `
      <div class="match-card active">
        <div class="match-header">
          <span class="opponent">vs ${escapeHtml(m.opponent_username || 'TBD')}</span>
          <span class="match-stake">₦${formatNumber(m.stake_amount)}</span>
        </div>
        <div class="match-details">
          <span>⏱️ ${m.time_control}</span>
          <span>${m.is_rated ? '⭐ Rated' : '⚡ Casual'}</span>
        </div>
        <button class="btn btn-primary btn-block" onclick="showSubmitResult(${m.id})">
          Submit Game Result
        </button>
      </div>
    `).join('');
  } catch (error) {
    document.getElementById('activeMatchesList2').innerHTML = '<p class="empty-state">Failed to load matches</p>';
  }
}

async function loadAwaitingMatches() {
  try {
    const response = await fetch(`${API_BASE}/matches/completed`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const matches = await response.json();
    
    // Filter for awaiting_appeal status
    const awaiting = matches.filter(m => m.status === 'awaiting_appeal');
    const container = document.getElementById('awaitingMatchesList');
    
    if (awaiting.length === 0) {
      container.innerHTML = '<p class="empty-state">No matches awaiting appeal</p>';
      return;
    }
    
    container.innerHTML = awaiting.map(m => `
      <div class="match-card awaiting">
        <div class="match-header">
          <span class="opponent">vs ${escapeHtml(m.opponent_username || 'TBD')}</span>
          <span class="match-stake">₦${formatNumber(m.stake_amount)}</span>
        </div>
        <div class="match-details">
          <span>Result: ${m.winner_id ? (m.winner_id === currentUser.id ? 'You Won!' : 'You Lost') : 'Draw'}</span>
          <span>⏰ Appeal deadline: ${formatDate(m.appeal_deadline)}</span>
        </div>
        ${m.status === 'awaiting_appeal' ? `
          <button class="btn btn-warning" onclick="showAppeal(${m.id})">Submit Appeal</button>
        ` : ''}
        ${m.status === 'awaiting_appeal' && new Date(m.appeal_deadline) < new Date() ? `
          <button class="btn btn-success" onclick="processDisbursement(${m.id})">Process Payout</button>
        ` : ''}
      </div>
    `).join('');
  } catch (error) {
    document.getElementById('awaitingMatchesList').innerHTML = '<p class="empty-state">Failed to load matches</p>';
  }
}

async function loadCompletedMatches() {
  try {
    const response = await fetch(`${API_BASE}/matches/completed`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const matches = await response.json();
    
    // Filter for completed/disbursed status
    const completed = matches.filter(m => ['completed', 'disbursed', 'draw'].includes(m.status));
    const container = document.getElementById('completedMatchesList');
    
    if (completed.length === 0) {
      container.innerHTML = '<p class="empty-state">No completed matches</p>';
      return;
    }
    
    container.innerHTML = completed.map(m => {
      let statusClass = m.status === 'draw' ? 'draw' : 'completed';
      return `
        <div class="match-card completed">
          <div class="match-header">
            <span class="opponent">vs ${escapeHtml(m.opponent_username || 'TBD')}</span>
            <span class="status-badge ${statusClass}">${m.status}</span>
          </div>
          <div class="match-details">
            <span>⏱️ ${m.time_control}</span>
            <span>Stake: ₦${formatNumber(m.stake_amount)}</span>
          </div>
          <div class="match-result">
            <strong>${m.winner_id === currentUser.id ? '🏆 You Won!' : m.winner_id ? '❌ You Lost' : '🤝 Draw'}</strong>
            ${m.winner_id === currentUser.id ? `<br>Payout: ₦${formatNumber(m.payout_amount || 0)}` : ''}
          </div>
          ${m.lichess_game_url ? `
            <a href="${m.lichess_game_url}" target="_blank" class="btn btn-outline btn-sm" style="margin-top: 8px;">
              View Game
            </a>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (error) {
    document.getElementById('completedMatchesList').innerHTML = '<p class="empty-state">Failed to load matches</p>';
  }
}

function switchMatchTab(tab) {
  document.querySelectorAll('#matchesSection .tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  
  document.getElementById('activeMatchesPanel').classList.toggle('hidden', tab !== 'active');
  document.getElementById('awaitingMatchesPanel').classList.toggle('hidden', tab !== 'awaiting');
  document.getElementById('completedMatchesPanel').classList.toggle('hidden', tab !== 'completed');
  
  if (tab === 'active') loadActiveMatches();
  else if (tab === 'awaiting') loadAwaitingMatches();
  else if (tab === 'completed') loadCompletedMatches();
}

// ================== SUBMIT RESULT ==================

function showSubmitResult(matchId) {
  document.getElementById('submitMatchId').value = matchId;
  
  // Load match details
  fetch(`${API_BASE}/matches/active`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  })
  .then(res => res.json())
  .then(matches => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;
    
    document.getElementById('matchDetailsPreview').innerHTML = `
      <p><strong>Opponent:</strong> ${escapeHtml(match.opponent_username || 'TBD')}</p>
      <p><strong>Stake:</strong> ₦${formatNumber(match.stake_amount)}</p>
      <p><strong>Time Control:</strong> ${match.time_control}</p>
      <p><strong>Winner Receives:</strong> ₦${formatNumber(match.stake_amount * 2 * 0.985)}</p>
    `;
    
    showSection('submitResult');
  });
}

async function handleSubmitResult(event) {
  event.preventDefault();
  
  const matchId = document.getElementById('submitMatchId').value;
  const lichessGameId = document.getElementById('lichessGameId').value.trim();
  const lichessGameUrl = document.getElementById('lichessGameUrl').value.trim();
  
  try {
    const response = await fetch(`${API_BASE}/matches/${matchId}/submit-result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ 
        lichess_game_id: lichessGameId,
        lichess_game_url: lichessGameUrl || `https://lichess.org/${lichessGameId}`
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to submit result');
    }
    
    showToast(data.message, 'success');
    
    if (data.appeal_deadline) {
      showToast(`Appeal deadline: ${formatDate(data.appeal_deadline)}`, 'warning');
    }
    
    loadDashboard();
    showSection('matches');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ================== APPEAL ==================

function showAppeal(matchId) {
  document.getElementById('appealMatchId').value = matchId;
  document.getElementById('appealSection').classList.remove('hidden');
  document.getElementById('matchesSection').classList.add('hidden');
}

async function handleAppeal(event) {
  event.preventDefault();
  
  const matchId = document.getElementById('appealMatchId').value;
  const reason = document.getElementById('appealReason').value;
  const evidence = document.getElementById('appealEvidence').value;
  
  try {
    const response = await fetch(`${API_BASE}/matches/${matchId}/appeal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ reason, evidence })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to submit appeal');
    }
    
    showToast('Appeal submitted! An admin will review.', 'success');
    document.getElementById('appealForm').reset();
    showSection('matches');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function processDisbursement(matchId) {
  try {
    const response = await fetch(`${API_BASE}/matches/${matchId}/process-disbursement`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to process disbursement');
    }
    
    showToast(data.message, 'success');
    loadDashboard();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ================== WALLET ==================

async function loadWallet() {
  try {
    const response = await fetch(`${API_BASE}/wallet/balance`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const data = await response.json();
    
    document.getElementById('walletBalanceDisplay').textContent = formatNumber(data.available);
    document.getElementById('walletLockedDisplay').textContent = formatNumber(data.locked);
    
    loadTransactions();
  } catch (error) {
    showToast('Failed to load wallet', 'error');
  }
}

async function loadTransactions() {
  try {
    const response = await fetch(`${API_BASE}/wallet/transactions`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const transactions = await response.json();
    const container = document.getElementById('transactionsList');
    
    if (transactions.length === 0) {
      container.innerHTML = '<p class="empty-state">No transactions yet</p>';
      return;
    }
    
    container.innerHTML = transactions.map(tx => `
      <div class="transaction-item">
        <div class="transaction-icon ${tx.type}">
          ${getTransactionIcon(tx.type)}
        </div>
        <div class="transaction-details">
          <div class="transaction-description">${escapeHtml(tx.description)}</div>
          <div class="transaction-date">${formatDate(tx.created_at)}</div>
        </div>
        <div class="transaction-amount ${['deposit', 'winning', 'refund'].includes(tx.type) ? 'positive' : 'negative'}">
          ${['deposit', 'winning', 'refund'].includes(tx.type) ? '+' : '-'}₦${formatNumber(tx.amount)}
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Failed to load transactions:', error);
  }
}

async function handleDeposit(event) {
  event.preventDefault();
  
  const amount = parseFloat(document.getElementById('depositAmount').value);
  
  try {
    const response = await fetch(`${API_BASE}/wallet/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ amount })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Deposit failed');
    }
    
    showToast('Deposit successful!', 'success');
    document.getElementById('depositAmount').value = '';
    loadWallet();
    loadDashboard();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleWithdraw(event) {
  event.preventDefault();
  
  const amount = parseFloat(document.getElementById('withdrawAmount').value);
  
  try {
    const response = await fetch(`${API_BASE}/wallet/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ amount })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Withdrawal failed');
    }
    
    showToast(data.message, 'success');
    document.getElementById('withdrawAmount').value = '';
    loadWallet();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ================== LICHESS ==================

async function handleLinkLichess(event) {
  event.preventDefault();
  
  const lichessUsername = document.getElementById('lichessUsername').value.trim();
  
  try {
    const response = await fetch(`${API_BASE}/user/lichess-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ lichess_username: lichessUsername })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to link Lichess account');
    }
    
    closeModal('lichessModal');
    currentUser.lichess_username = lichessUsername;
    showToast('Lichess account linked!', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ================== ADMIN ==================

async function loadAdminStats() {
  try {
    const response = await fetch(`${API_BASE}/admin/stats`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const stats = await response.json();
    
    document.getElementById('adminTotalUsers').textContent = stats.total_users;
    document.getElementById('adminPendingChallenges').textContent = stats.pending_challenges;
    document.getElementById('adminActiveMatches').textContent = stats.active_matches;
    document.getElementById('adminPlatformFees').textContent = formatNumber(stats.platform_fees_collected);
    
    loadAdminChallenges();
    loadAdminAppeals();
  } catch (error) {
    showToast('Failed to load admin stats', 'error');
  }
}

async function loadAdminChallenges() {
  try {
    const response = await fetch(`${API_BASE}/admin/challenges`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const challenges = await response.json();
    
    document.getElementById('adminChallengesList').innerHTML = challenges.map(ch => `
      <tr>
        <td>${ch.id}</td>
        <td>${escapeHtml(ch.creator_username)}</td>
        <td>${escapeHtml(ch.opponent_username)}</td>
        <td>₦${formatNumber(ch.stake_amount)}</td>
        <td><span class="status-badge ${ch.status}">${ch.status}</span></td>
        <td>${ch.expires_in_minutes ? `${ch.expires_in_minutes}m` : '-'}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Failed to load admin challenges:', error);
  }
}

async function loadAdminAppeals() {
  try {
    const response = await fetch(`${API_BASE}/admin/appeals`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const appeals = await response.json();
    
    if (appeals.length === 0) {
      document.getElementById('adminAppealsList').innerHTML = '<tr><td colspan="6">No pending appeals</td></tr>';
      return;
    }
    
    document.getElementById('adminAppealsList').innerHTML = appeals.map(a => `
      <tr>
        <td>${a.id}</td>
        <td>${escapeHtml(a.username)}</td>
        <td>${a.match?.id || '-'}</td>
        <td>${escapeHtml(a.reason?.substring(0, 30)) || '-'}...</td>
        <td><span class="status-badge ${a.status}">${a.status}</span></td>
        <td>
          ${a.status === 'pending' ? `
            <button class="btn btn-success btn-sm" onclick="resolveAppeal(${a.id}, 'upheld')">Uphold</button>
            <button class="btn btn-danger btn-sm" onclick="resolveAppeal(${a.id}, 'rejected')">Reject</button>
          ` : a.status}
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Failed to load appeals:', error);
  }
}

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden'));
  
  const panelMap = {
    'stats': 'adminStatsPanel',
    'challenges': 'adminChallengesPanel',
    'appeals': 'adminAppealsPanel'
  };
  
  document.getElementById(panelMap[tab])?.classList.remove('hidden');
}

async function resolveAppeal(appealId, decision) {
  try {
    const response = await fetch(`${API_BASE}/admin/appeals/${appealId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ decision })
    });
    
    if (!response.ok) throw new Error('Failed to resolve appeal');
    
    showToast(`Appeal ${decision}`, 'success');
    loadAdminAppeals();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ================== UTILITIES ==================

function formatNumber(num) {
  return Math.floor(num || 0).toLocaleString('en-NG');
}

function formatDate(dateString) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getTransactionIcon(type) {
  const icons = {
    'deposit': '↓',
    'withdrawal': '↑',
    'platform_fee': '💰',
    'winning': '🏆',
    'refund': '↩️',
    'stake': '🎮'
  };
  return icons[type] || '•';
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-message">${escapeHtml(message)}</span>`;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function openModal(modalId) {
  document.getElementById(modalId).classList.remove('hidden');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

// Close modal on outside click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.classList.add('hidden');
  }
});
