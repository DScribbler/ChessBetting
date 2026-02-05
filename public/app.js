// DX - Chess Staking Platform Frontend Application

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
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;
  
  try {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
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
  document.getElementById('createSection').classList.add('hidden');
  document.getElementById('matchesSection').classList.add('hidden');
  document.getElementById('my-matchesSection').classList.add('hidden');
  document.getElementById('submitResultSection').classList.add('hidden');
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
    'create': 'createSection',
    'matches': 'matchesSection',
    'my-matches': 'my-matchesSection',
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
    case 'matches':
      loadOpenMatches();
      break;
    case 'my-matches':
      loadMyMatches('pending');
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
  
  // Load active matches
  await loadMyMatches('pending');
}

// ================== MATCHES ==================

async function loadOpenMatches() {
  try {
    const response = await fetch(`${API_BASE}/matches/open`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const matches = await response.json();
    const container = document.getElementById('openMatchesList');
    
    if (matches.length === 0) {
      container.innerHTML = '<p class="empty-state">No open challenges available</p>';
      return;
    }
    
    container.innerHTML = matches.map(match => `
      <div class="match-card">
        <div class="match-header">
          <span class="match-creator">${escapeHtml(match.creator_username)}</span>
          <span class="match-stake">₦${formatNumber(match.stake_amount)}</span>
        </div>
        <div class="match-details">
          <span>⏱️ ${match.time_control}</span>
          <span>${match.is_rated ? '⭐ Rated' : '⚡ Casual'}</span>
        </div>
        <div class="match-actions">
          <button class="btn btn-primary btn-sm" onclick="acceptMatch('${match.challenge_id}')">
            Accept Challenge
          </button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    showToast('Failed to load matches', 'error');
  }
}

async function acceptMatch(challengeId) {
  try {
    const response = await fetch(`${API_BASE}/matches/accept/${challengeId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to accept match');
    }
    
    showToast(data.message, 'success');
    showSection('my-matches');
    loadDashboard();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadMyMatches(status) {
  try {
    const response = await fetch(`${API_BASE}/matches/my`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const matches = await response.json();
    
    // Filter by status
    const filtered = status === 'pending' 
      ? matches.filter(m => m.status === 'open' || m.status === 'pending_game')
      : matches.filter(m => m.status === 'completed' || m.status === 'draw');
    
    const container = document.getElementById('myMatchesList');
    
    if (filtered.length === 0) {
      container.innerHTML = `<p class="empty-state">No ${status} matches</p>`;
      return;
    }
    
    container.innerHTML = filtered.map(match => {
      const isCreator = match.creator_id === currentUser.id;
      const opponent = isCreator ? match.opponent_username : match.creator_username;
      const opponentLichess = isCreator ? match.opponent_lichess : match.creator_lichess;
      
      return `
        <div class="match-card">
          <div class="match-header">
            <span class="match-stake">₦${formatNumber(match.stake_amount)}</span>
            <span class="status-badge ${match.status}">${match.status.replace('_', ' ')}</span>
          </div>
          <div class="match-details">
            <span>⏱️ ${match.time_control}</span>
            <span>${match.is_rated ? '⭐ Rated' : '⚡ Casual'}</span>
          </div>
          ${match.status === 'pending_game' ? `
            <p style="margin: 12px 0; font-size: 14px;">
              <strong>Opponent:</strong> ${escapeHtml(opponent || 'Waiting...')}<br>
              ${opponentLichess ? `<span style="color: var(--text-muted);">Lichess: ${escapeHtml(opponentLichess)}</span>` : ''}
            </p>
            <p style="margin: 12px 0; font-size: 13px; color: var(--text-secondary);">
              Play your ${match.time_control} game on Lichess, then submit the result below.
            </p>
            <button class="btn btn-primary btn-block" onclick="showSubmitResult(${match.id})">
              Submit Game Result
            </button>
          ` : ''}
          ${match.status === 'completed' || match.status === 'draw' ? `
            <p style="margin: 12px 0; font-size: 14px;">
              <strong>Winner:</strong> ${match.winner_id === currentUser.id ? 'You' : escapeHtml(match.winner_username || 'N/A')}<br>
              <strong>Payout:</strong> ₦${formatNumber(match.payout_amount || 0)}
            </p>
            ${match.lichess_game_url ? `
              <a href="${match.lichess_game_url}" target="_blank" class="btn btn-outline btn-sm" style="margin-top: 8px;">
                View Game
              </a>
            ` : ''}
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (error) {
    showToast('Failed to load your matches', 'error');
  }
}

function switchMatchTab(status) {
  document.querySelectorAll('#my-matchesSection .tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  loadMyMatches(status);
}

// ================== CREATE MATCH ==================

function handleCreateMatch(event) {
  event.preventDefault();
  
  const stakeAmount = parseFloat(document.getElementById('stakeAmount').value);
  const timeControl = document.getElementById('timeControl').value;
  const isRated = document.querySelector('input[name="isRated"]:checked').value === 'true';
  
  // Update fee breakdown preview
  const totalPot = stakeAmount * 2;
  const fee = (totalPot * 1.5) / 100;
  const winnerPayout = totalPot - fee;
  
  document.getElementById('breakdownStake').textContent = `₦${formatNumber(stakeAmount)}`;
  document.getElementById('breakdownPot').textContent = `₦${formatNumber(totalPot)}`;
  document.getElementById('breakdownFee').textContent = `₦${formatNumber(fee)}`;
  document.getElementById('breakdownWinner').textContent = `₦${formatNumber(winnerPayout)}`;
  
  // Submit match creation
  createMatch(stakeAmount, timeControl, isRated);
}

async function createMatch(stakeAmount, timeControl, isRated) {
  try {
    const response = await fetch(`${API_BASE}/matches/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ stake_amount: stakeAmount, time_control: timeControl, is_rated: isRated })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to create match');
    }
    
    showToast('Match challenge created!', 'success');
    showSection('my-matches');
    loadDashboard();
    
    // Reset form
    document.getElementById('createMatchForm').reset();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ================== SUBMIT RESULT ==================

function showSubmitResult(matchId) {
  // Find match details
  fetch(`${API_BASE}/matches/my`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  })
  .then(res => res.json())
  .then(matches => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;
    
    document.getElementById('submitMatchId').value = matchId;
    
    const isCreator = match.creator_id === currentUser.id;
    const opponent = isCreator ? match.opponent_username : match.creator_username;
    
    document.getElementById('matchDetailsPreview').innerHTML = `
      <p><strong>Stake:</strong> ₦${formatNumber(match.stake_amount)}</p>
      <p><strong>Time Control:</strong> ${match.time_control}</p>
      <p><strong>Opponent:</strong> ${escapeHtml(opponent || 'TBD')}</p>
      <p><strong>Winner Receives:</strong> ₦${formatNumber((match.stake_amount * 2) - match.dx_fee)}</p>
    `;
    
    showSection('submitResultSection');
  });
}

async function handleSubmitResult(event) {
  event.preventDefault();
  
  const matchId = document.getElementById('submitMatchId').value;
  const lichessGameId = document.getElementById('lichessGameId').value.trim();
  const lichessGameUrl = document.getElementById('lichessGameUrl').value.trim();
  
  try {
    const response = await fetch(`${API_BASE}/matches/submit-result/${matchId}`, {
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
    loadDashboard();
    showSection('my-matches');
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
    
    // Load transactions
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
        <div class="transaction-amount ${tx.type === 'deposit' || tx.type === 'winning' ? 'positive' : 'negative'}">
          ${tx.type === 'deposit' || tx.type === 'winning' ? '+' : '-'}₦${formatNumber(tx.amount)}
        </div>
      </div>
    `).join('');
  } catch (error) {
    showToast('Failed to load transactions', 'error');
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
      body: JSON.stringify({ amount, payment_method: 'manual' })
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
    loadDashboard();
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
    document.getElementById('adminTotalMatches').textContent = stats.total_matches;
    document.getElementById('adminPlatformFees').textContent = formatNumber(stats.platform_fees_collected);
    document.getElementById('adminTotalVolume').textContent = formatNumber(stats.total_volume);
    
    // Load other admin data
    loadAdminUsers();
    loadAdminMatches();
    loadAdminWithdrawals();
  } catch (error) {
    showToast('Failed to load admin stats', 'error');
  }
}

async function loadAdminUsers() {
  try {
    const response = await fetch(`${API_BASE}/admin/users`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const users = await response.json();
    
    document.getElementById('adminUsersList').innerHTML = users.map(user => `
      <tr>
        <td>${user.id}</td>
        <td>${escapeHtml(user.username)}</td>
        <td>${escapeHtml(user.email)}</td>
        <td>${escapeHtml(user.lichess_username || '-')}</td>
        <td>₦${formatNumber(user.wallet_balance)}</td>
        <td>${user.matches_won + user.matches_lost + user.matches_draw}</td>
        <td>${user.is_admin ? 'Admin' : 'User'}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Failed to load users:', error);
  }
}

async function loadAdminMatches() {
  try {
    const response = await fetch(`${API_BASE}/admin/matches`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const matches = await response.json();
    
    document.getElementById('adminMatchesList').innerHTML = matches.map(match => `
      <tr>
        <td>${match.id}</td>
        <td>${escapeHtml(match.creator_username)}</td>
        <td>${escapeHtml(match.opponent_username || '-')}</td>
        <td>₦${formatNumber(match.stake_amount)}</td>
        <td><span class="status-badge ${match.status}">${match.status}</span></td>
        <td>${formatDate(match.created_at)}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Failed to load matches:', error);
  }
}

async function loadAdminWithdrawals() {
  try {
    const response = await fetch(`${API_BASE}/admin/withdrawals`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const withdrawals = await response.json();
    
    if (withdrawals.length === 0) {
      document.getElementById('adminWithdrawalsList').innerHTML = '<tr><td colspan="5">No pending withdrawals</td></tr>';
      return;
    }
    
    document.getElementById('adminWithdrawalsList').innerHTML = withdrawals.map(w => `
      <tr>
        <td>${w.id}</td>
        <td>${escapeHtml(w.username)}</td>
        <td>₦${formatNumber(w.amount)}</td>
        <td>${formatDate(w.created_at)}</td>
        <td>
          <button class="btn btn-success btn-sm" onclick="approveWithdrawal(${w.id})">Approve</button>
          <button class="btn btn-danger btn-sm" onclick="rejectWithdrawal(${w.id})">Reject</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Failed to load withdrawals:', error);
  }
}

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden'));
  
  const panelMap = {
    'stats': 'adminStatsPanel',
    'users': 'adminUsersPanel',
    'matchadmin': 'adminMatchadminPanel',
    'withdrawals': 'adminWithdrawalsPanel'
  };
  
  document.getElementById(panelMap[tab])?.classList.remove('hidden');
}

async function approveWithdrawal(id) {
  try {
    const response = await fetch(`${API_BASE}/admin/withdrawals/${id}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (!response.ok) throw new Error('Failed to approve');
    
    showToast('Withdrawal approved', 'success');
    loadAdminWithdrawals();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function rejectWithdrawal(id) {
  try {
    const response = await fetch(`${API_BASE}/admin/withdrawals/${id}/reject`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (!response.ok) throw new Error('Failed to reject');
    
    showToast('Withdrawal rejected', 'success');
    loadAdminWithdrawals();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ================== UTILITIES ==================

function formatNumber(num) {
  return Math.floor(num).toLocaleString('en-NG');
}

function formatDate(dateString) {
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
