const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;
const USERS_FILE = path.join(BASE_DIR, 'users.json');
const SESSIONS_FILE = path.join(BASE_DIR, 'sessions.json');
const DEPOSIT_FILE = path.join(BASE_DIR, 'deposit.json');
const CHAT_FILE = path.join(BASE_DIR, 'chat.json');
const LOG_FILE = path.join(BASE_DIR, 'admin-log.json');
const SETTINGS_FILE = path.join(BASE_DIR, 'settings.json');
const TX_FILE = path.join(BASE_DIR, 'transactions.json');
const ADMIN_FILE = path.join(BASE_DIR, 'admin.json');
const PROMO_FILE = path.join(BASE_DIR, 'promos.json');
const TICKETS_FILE = path.join(BASE_DIR, 'tickets.json');
const WITHDRAWALS_FILE = path.join(BASE_DIR, 'withdrawals.json');
const FAQ_FILE = path.join(BASE_DIR, 'faq.json');
const BOT_COMMANDS_FILE = path.join(BASE_DIR, 'bot_commands.txt');
const WITHDRAW_PENDING_FILE = path.join(BASE_DIR, 'withdraw_pending.txt');

app.use(express.json());
app.use(express.static(__dirname));

// CORS for mobile access
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

let depositQueue = [];
let onlineUsers = new Set();
let chatMessages = [];
const MAX_CHAT_MESSAGES = 100;



let adminConfig = { password: 'munahaju3004' };

// Clean up old chat messages (older than 10 minutes)
function cleanupOldMessages() {
    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
    const before = chatMessages.length;
    chatMessages = chatMessages.filter(m => m.timestamp > tenMinutesAgo);
    if (chatMessages.length < before) {
        console.log(`[CHAT] Cleaned up ${before - chatMessages.length} old messages`);
        writeChat(chatMessages);
    }
}

// Clean up expired withdrawals (3 minutes) and deposits (3 minutes)
function cleanupExpiredRequests() {
    const threeMinutesAgo = Date.now() - (3 * 60 * 1000);
    
    // Re-read withdrawals from file to get latest status (bot may have updated)
    const freshWithdrawals = readFile(WITHDRAWALS_FILE, []);
    
    // Check withdrawals
    let users = readUsers();
    let refundCount = 0;
    let withdrawalChanged = false;
    
    freshWithdrawals.forEach((w, i) => {
        if (w.status === 'pending') {
            const createdTime = new Date(w.createdAt).getTime();
            if (createdTime < threeMinutesAgo) {
                if (users[w.username]) {
                    users[w.username].balance = (users[w.username].balance || 0) + w.amount;
                    addTransaction('refund', w.username, w.amount, { reason: 'Withdrawal expired', withdrawalId: w.id });
                    console.log(`[WITHDRAW] Refunded ${w.amount} to ${w.username} (expired)`);
                    refundCount++;
                }
                freshWithdrawals[i].status = 'expired';
                withdrawalChanged = true;
            }
        }
    });
    
    if (refundCount > 0) {
        writeUsers(users);
        writeFile(WITHDRAWALS_FILE, freshWithdrawals);
        withdrawals = freshWithdrawals;
    }
    
    // Re-read deposits from file
    const freshDeposits = readFile(DEPOSIT_FILE, []);
    let depositCount = 0;
    
    const newQueue = freshDeposits.filter(d => {
        if (d.completed) return true;
        if (d.createdAt < threeMinutesAgo) {
            console.log(`[DEPOSIT] Removed expired deposit for ${d.gtUsername}`);
            depositCount++;
            return false;
        }
        return true;
    });
    
    if (depositCount > 0) {
        writeFile(DEPOSIT_FILE, newQueue);
        depositQueue = newQueue;
    }
}

// Run cleanups - chat every minute, expired requests every 30 seconds
setInterval(cleanupOldMessages, 60000);
setInterval(cleanupExpiredRequests, 30000);

// Process bot commands
function processBotCommands() {
    try {
        // Process deposits
        if (fs.existsSync(BOT_COMMANDS_FILE)) {
            const content = fs.readFileSync(BOT_COMMANDS_FILE, 'utf8');
            const lines = content.split('\n').filter(l => l.trim());
            
            for (const line of lines) {
                const parts = line.split('|');
                if (parts[0] === 'DEPOSIT' && parts[1] && parts[2]) {
                    const gtUsername = parts[1];
                    const amount = parseInt(parts[2]);
                    
                    const deposit = depositQueue.find(d => d.gtUsername === gtUsername && !d.completed);
                    if (deposit) {
                        const users = readUsers();
                        const user = users[deposit.websiteUsername];
                        if (user) {
                            user.balance += amount;
                            writeUsers(users);
                            addTransaction('deposit', deposit.websiteUsername, amount, { gtUsername });
                            console.log(`[BOT] Deposit completed: ${gtUsername} -> ${amount} WL to ${deposit.websiteUsername}`);
                        }
                        deposit.completed = true;
                        deposit.completedAt = Date.now();
                        deposit.amount = amount;
                        writeFile(DEPOSIT_FILE, depositQueue);
                        console.log(`[DEPOSIT] Marked as completed: ${deposit.gtUsername}`);
                    }
                }
            }
            fs.writeFileSync(BOT_COMMANDS_FILE, '');
        }
        
        // Process completed withdrawals - re-read from file each time
        const WITHDRAW_COMPLETED_FILE = BASE_DIR + '\\withdraw_completed.txt';
        if (fs.existsSync(WITHDRAW_COMPLETED_FILE)) {
            const content = fs.readFileSync(WITHDRAW_COMPLETED_FILE, 'utf8');
            const lines = content.split('\n').filter(l => l.trim());
            
            if (lines.length > 0) {
                // Re-read withdrawals from file
                const freshWithdrawals = readFile(WITHDRAWALS_FILE, []);
                let changed = false;
                
                for (const line of lines) {
                    const parts = line.split('|');
                    if (parts[0] === 'COMPLETED' && parts[1]) {
                        const withdrawalId = parts[1].trim();
                        const withdrawal = freshWithdrawals.find(w => String(w.id) === withdrawalId);
                        
                        if (withdrawal && withdrawal.status === 'pending') {
                            withdrawal.status = 'completed';
                            withdrawal.completedAt = new Date().toISOString();
                            changed = true;
                        }
                    }
                }
                
                if (changed) {
                    writeFile(WITHDRAWALS_FILE, freshWithdrawals);
                    withdrawals = freshWithdrawals;
                }
            }
            
            fs.writeFileSync(WITHDRAW_COMPLETED_FILE, '');
        }
    } catch (err) {
        console.error('[BOT] Error processing commands:', err.message);
    }
}

// Check bot commands every 100ms
setInterval(processBotCommands, 100);

// Check for broadcast messages
function processBroadcast() {
    try {
        const BROADCAST_FILE = BASE_DIR + '\\broadcast.txt';
        if (fs.existsSync(BROADCAST_FILE)) {
            const message = fs.readFileSync(BROADCAST_FILE, 'utf8').trim();
            if (message) {
                const msg = { type: 'broadcast', username: 'SYSTEM', message: message, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), timestamp: Date.now() };
                chatMessages.push(msg);
                if (chatMessages.length > MAX_CHAT_MESSAGES) chatMessages = chatMessages.slice(-MAX_CHAT_MESSAGES);
                writeChat(chatMessages);
                console.log('[BROADCAST] Sent to chat:', message);
            }
            fs.unlinkSync(BROADCAST_FILE);
        }
    } catch (err) {
        console.error('[BROADCAST] Error:', err.message);
    }
}

// Check broadcast every 5 seconds
setInterval(processBroadcast, 5000);

let settings = {
    games: {
        DICE: { enabled: true, rtp: 99, volatility: 'adjustable', category: 'dice', provider: 'Growblock', minBet: 1, maxBet: 1000000 },
        BLACKJACK: { enabled: true, rtp: 99, volatility: 'low', category: 'cards', provider: 'Growblock' },
        LIMBO: { enabled: true, rtp: 99, volatility: 'high', category: 'crash', provider: 'Growblock' }
    },
    limits: { minBet: 1, maxBet: 1000000 },
    promoCodes: {
        'WELCOME100': { bonus: 100, type: 'fixed', uses: 1 },
        'DEPOSIT50': { bonus: 50, type: 'percent', uses: 100, maxBonus: 500 }
    }
};

let adminLogs = [], transactions = [], tickets = [], withdrawals = [];
let faq = [
    { q: 'How do I deposit?', a: 'Go to the Deposit page, enter your Growtopia username, and you will receive a world to drop your locks in.' },
    { q: 'How do I withdraw?', a: 'Go to Withdrawals, enter your Growtopia username and amount. Admin will process your request.' },
    { q: 'What is the minimum bet?', a: 'Minimum bet is 1 WL.' },
    { q: 'How do promo codes work?', a: 'Enter a promo code in the Promo section to receive bonus funds.' }
];

function readFile(filePath, defaultVal = {}) {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {}
    return defaultVal;
}

function writeFile(filePath, data) { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); }

function readUsers() { return readFile(USERS_FILE, {}); }
function writeUsers(users) { writeFile(USERS_FILE, users); }
function readSessions() { return readFile(SESSIONS_FILE, {}); }
function writeSessions(sessions) { writeFile(SESSIONS_FILE, sessions); }
function readChat() { return readFile(CHAT_FILE, []); }
function writeChat(messages) { writeFile(CHAT_FILE, messages); }
function readSettings() { const s = readFile(SETTINGS_FILE, settings); settings = { ...settings, ...s }; return settings; }
function writeSettings(s) { writeFile(SETTINGS_FILE, s); }
function readAdminConfig() {
    if (!fs.existsSync(ADMIN_FILE)) writeFile(ADMIN_FILE, adminConfig);
    const config = readFile(ADMIN_FILE, adminConfig);
    adminConfig = { ...adminConfig, ...config };
    return adminConfig;
}
function writeAdminConfig(c) { writeFile(ADMIN_FILE, c); }
function readLogs() { return readFile(LOG_FILE, []); }
function writeLogs(logs) { writeFile(LOG_FILE, logs); }
function readTransactions() { return readFile(TX_FILE, []); }
function writeTransactions(txs) { writeFile(TX_FILE, txs); }
function readPromos() { return readFile(PROMO_FILE, settings.promoCodes || {}); }
function writePromos(p) { writeFile(PROMO_FILE, p); settings.promoCodes = p; }
function readTickets() { tickets = readFile(TICKETS_FILE, []); return tickets; }
function writeTickets(t) { writeFile(TICKETS_FILE, t); tickets = t; }
function readWithdrawals() { withdrawals = readFile(WITHDRAWALS_FILE, []); return withdrawals; }
function writeWithdrawals(w) { writeFile(WITHDRAWALS_FILE, w); withdrawals = w; }
function readFAQ() { return readFile(FAQ_FILE, faq); }

function initFiles() {
    chatMessages = readChat();
    settings = readSettings();
    adminLogs = readLogs();
    transactions = readTransactions();
    readAdminConfig();
    readTickets();
    readWithdrawals();
    depositQueue = readFile(DEPOSIT_FILE, []);
    
    // Expire any stale pending deposits from previous session
    const now = Date.now();
    const threeMinutesAgo = now - (3 * 60 * 1000);
    let depositChanged = false;
    
    depositQueue = depositQueue.map(d => {
        if (!d.completed && d.createdAt < threeMinutesAgo) {
            d.completed = true; // Mark as removed
            d.expired = true;
            depositChanged = true;
            console.log(`[STARTUP] Expired stale deposit for ${d.gtUsername}`);
        }
        return d;
    });
    
    if (depositChanged) {
        writeFile(DEPOSIT_FILE, depositQueue);
    }
    
    // Expire any stale pending withdrawals from previous session
    let withdrawalChanged = false;
    
    withdrawals = withdrawals.map(w => {
        if (w.status === 'pending' && new Date(w.createdAt).getTime() < threeMinutesAgo) {
            w.status = 'expired';
            withdrawalChanged = true;
            // Refund balance
            const users = readUsers();
            if (users[w.username]) {
                users[w.username].balance = (users[w.username].balance || 0) + w.amount;
                writeUsers(users);
            }
            console.log(`[STARTUP] Expired stale withdrawal: ${w.id} for ${w.username}`);
        }
        return w;
    });
    
    if (withdrawalChanged) {
        writeWithdrawals(withdrawals);
    }
}
initFiles();

function hashPassword(password) { return crypto.createHash('sha256').update(password).digest('hex'); }
function generateToken() { return crypto.randomBytes(32).toString('hex'); }

function authenticate(req, res, callback) {
    const token = req.headers['authorization'];
    if (!token) { res.status(401).json({ error: 'Unauthorized' }); return false; }
    const sessions = readSessions();
    const session = sessions[token];
    if (!session) { res.status(401).json({ error: 'Invalid session' }); return false; }
    req.user = session;
    callback();
    return true;
}

function addLog(admin, action, details) {
    const log = { admin, action, details, timestamp: new Date().toISOString() };
    adminLogs.push(log);
    if (adminLogs.length > 1000) adminLogs = adminLogs.slice(-500);
    writeLogs(adminLogs);
    console.log(`[ADMIN ${admin}] ${action}: ${JSON.stringify(details)}`);
}

function addTransaction(type, username, amount, details = {}) {
    const tx = { type, username, amount, details, timestamp: new Date().toISOString() };
    transactions.push(tx);
    if (transactions.length > 1000) transactions = transactions.slice(-500);
    writeTransactions(transactions);
}

// Auth
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Username must be 3-20 characters' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Invalid characters' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
    
    const users = readUsers();
    if (users[username]) return res.status(400).json({ error: 'Username already exists' });
    
    users[username] = {
        password: hashPassword(password),
        balance: 0,
        dlBalance: 0,
        bglBalance: 0,
        bonusBalance: 0,
        banned: false,
        depositDisabled: false,
        withdrawDisabled: false,
        createdAt: new Date().toISOString(),
        stats: { totalBet: 0, totalWin: 0, gamesPlayed: 0, timeSpent: 0, loginTime: Date.now() }
    };
    writeUsers(users);
    addTransaction('register', username, 0);
    res.json({ success: true });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    const users = readUsers();
    const user = users[username];
    if (!user || user.password !== hashPassword(password)) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.banned) return res.status(403).json({ error: 'Account banned' });
    
    // Initialize stats if missing
    if (!user.stats) user.stats = { totalBet: 0, totalWin: 0, gamesPlayed: 0, timeSpent: 0 };
    if (user.depositDisabled === undefined) user.depositDisabled = false;
    if (user.withdrawDisabled === undefined) user.withdrawDisabled = false;
    if (user.dlBalance === undefined) user.dlBalance = 0;
    if (user.bglBalance === undefined) user.bglBalance = 0;
    user.stats.loginTime = Date.now();
    user.stats.timeSpent = (user.stats.timeSpent || 0);
    writeUsers(users);
    
    const token = generateToken();
    const sessions = readSessions();
    sessions[token] = { username, loginAt: new Date().toISOString(), lastActivity: Date.now() };
    writeSessions(sessions);
    onlineUsers.add(username);
    res.json({ success: true, token, username, balance: user.balance || 0, bonusBalance: user.bonusBalance || 0 });
});

app.post('/logout', (req, res) => {
    const token = req.headers['authorization'];
    if (token) {
        const sessions = readSessions();
        const session = sessions[token];
        if (session) {
            const users = readUsers();
            if (users[session.username]) {
                users[session.username].stats.timeSpent = (users[session.username].stats.timeSpent || 0) + (Date.now() - (users[session.username].stats.loginTime || Date.now()));
                writeUsers(users);
            }
            onlineUsers.delete(session.username);
        }
        delete sessions[token];
        writeSessions(sessions);
    }
    res.json({ success: true });
});

// User endpoints
app.get('/balance', (req, res) => {
    authenticate(req, res, () => {
        const sessions = readSessions();
        if (sessions[req.headers['authorization']]) {
            sessions[req.headers['authorization']].lastActivity = Date.now();
            writeSessions(sessions);
        }
        const users = readUsers();
        const user = users[req.user.username];
        // Unified balance in WL
        const wlBalance = user?.balance || 0;
        const dlBalance = (user?.dlBalance || 0) * 100;
        const bglBalance = (user?.bglBalance || 0) * 10000;
        res.json({ 
            balance: wlBalance + dlBalance + bglBalance,
            bonusBalance: user?.bonusBalance || 0
        });
    });
});

app.post('/updateBalance', (req, res) => {
    authenticate(req, res, () => {
        const { amount, currency } = req.body;
        if (amount === undefined || isNaN(amount)) return res.status(400).json({ error: 'Invalid amount' });
        
        const users = readUsers();
        const user = users[req.user.username];
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        // Convert to WL value
        let wlAmount = parseInt(amount);
        if (currency === 'dl') wlAmount = parseInt(amount) * 100;
        if (currency === 'bgl') wlAmount = parseInt(amount) * 10000;
        
        const oldBalance = user.balance || 0;
        user.balance = oldBalance + wlAmount;
        if (user.balance < 0) return res.status(400).json({ error: 'Insufficient balance' });
        
        user.stats = user.stats || {};
        user.stats.totalBet = (user.stats.totalBet || 0) + (amount < 0 ? Math.abs(amount) : 0);
        user.stats.totalWin = (user.stats.totalWin || 0) + (amount > 0 ? amount : 0);
        user.stats.gamesPlayed = (user.stats.gamesPlayed || 0) + 1;
        writeUsers(users);
        
        console.log(`[BALANCE] ${req.user.username}: ${oldBalance} + ${wlAmount} = ${user.balance} (${amount > 0 ? 'win' : 'loss'})`);
        
        addTransaction(amount > 0 ? 'win' : 'bet', req.user.username, wlAmount, { currency });
        res.json({ balance: user.balance });
    });
});

app.get('/me', (req, res) => {
    authenticate(req, res, () => {
        const users = readUsers();
        const user = users[req.user.username];
        res.json({
            username: req.user.username,
            balance: user?.balance || 0,
            bonusBalance: user?.bonusBalance || 0,
            createdAt: user?.createdAt,
            stats: user?.stats || {}
        });
    });
});

app.get('/stats', (req, res) => {
    authenticate(req, res, () => {
        const users = readUsers();
        const user = users[req.user.username];
        const userTxs = transactions.filter(t => t.username === req.user.username);
        res.json({
            stats: user?.stats || {},
            recentTx: userTxs.slice(-20).reverse(),
            netProfit: (user?.stats?.totalWin || 0) - (user?.stats?.totalBet || 0)
        });
    });
});

// Promo codes
app.post('/redeemPromo', (req, res) => {
    authenticate(req, res, () => {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'Code required' });
        
        const promos = readPromos();
        const promo = promos[code.toUpperCase()];
        if (!promo) return res.status(404).json({ error: 'Invalid promo code' });
        
        if (promo.uses !== undefined && promo.usedBy?.includes(req.user.username)) {
            return res.status(400).json({ error: 'Code already used' });
        }
        
        const users = readUsers();
        const user = users[req.user.username];
        
        let bonus = promo.bonus;
        if (promo.type === 'percent') {
            bonus = Math.min(promo.bonus, promo.maxBonus || 1000);
        }
        
        user.balance = (user.balance || 0) + bonus;
        if (!promo.usedBy) promo.usedBy = [];
        promo.usedBy.push(req.user.username);
        writePromos(promos);
        writeUsers(users);
        
        addTransaction('promo', req.user.username, bonus, { promoCode: code });
        res.json({ success: true, bonus, newBalance: user.balance });
    });
});

// Games
app.get('/games', (req, res) => {
    const { provider, volatility, category, rtpMin } = req.query;
    readSettings();
    let games = Object.entries(settings.games).map(([name, data]) => ({ name, ...data }));
    
    if (provider) games = games.filter(g => g.provider === provider);
    if (volatility) games = games.filter(g => g.volatility === volatility);
    if (category) games = games.filter(g => g.category === category);
    if (rtpMin) games = games.filter(g => g.rtp >= parseInt(rtpMin));
    
    res.json({ games, providers: [...new Set(games.map(g => g.provider))] });
});

app.post('/requestDeposit', (req, res) => {
    authenticate(req, res, () => {
        const users = readUsers();
        const user = users[req.user.username];
        
        if (user && user.depositDisabled) {
            return res.status(403).json({ error: 'Deposits are disabled for your account' });
        }
        
        const { gtUsername } = req.body;
        if (!gtUsername || gtUsername.length < 3) return res.status(400).json({ error: 'Invalid username' });
        
        const worldName = "8osocl";
        const depositRequest = { gtUsername, websiteUsername: req.user.username, worldName, createdAt: Date.now() };
        
        depositQueue.push(depositRequest);
        writeFile(DEPOSIT_FILE, depositQueue);
        
        res.json({ success: true, worldName });
    });
});

// Bot: Complete deposit (called by Growtopia bot)
app.post('/completeDeposit', (req, res) => {
    const { gtUsername, amount } = req.body;
    if (!gtUsername || !amount) return res.status(400).json({ error: 'Missing data' });
    
    const deposit = depositQueue.find(d => d.gtUsername === gtUsername && !d.completed);
    if (!deposit) return res.status(404).json({ error: 'No pending deposit found' });
    
    const users = readUsers();
    const user = users[deposit.websiteUsername];
    if (user) {
        user.balance += parseInt(amount);
        users[deposit.websiteUsername] = user;
        writeUsers(users);
        
        addTransaction('deposit', deposit.websiteUsername, parseInt(amount), { gtUsername });
    }
    
    deposit.completed = true;
    deposit.completedAt = Date.now();
    deposit.amount = parseInt(amount);
    writeFile(DEPOSIT_FILE, depositQueue);
    
    res.json({ success: true, balance: user?.balance });
});

// Bot: Get pending withdrawals
app.get('/pendingWithdrawals', (req, res) => {
    const pending = withdrawals.filter(w => w.status === 'pending');
    res.json({ withdrawals: pending });
});

// Bot: Complete withdrawal
app.post('/completeWithdrawal', (req, res) => {
    const { withdrawalId } = req.body;
    if (!withdrawalId) return res.status(400).json({ error: 'Missing ID' });
    
    const w = withdrawals.find(w => w.id === withdrawalId);
    if (!w) return res.status(404).json({ error: 'Withdrawal not found' });
    
    w.status = 'completed';
    w.completedAt = Date.now();
    writeWithdrawals(withdrawals);
    
    // Clear active withdraw
    activeWithdraw = null;
    
    // Process next in queue
    const next = withdrawWaitQueue.find(w => w.status === 'pending');
    if (next) {
        activeWithdraw = next;
        fs.writeFileSync(WITHDRAW_PENDING_FILE, `WITHDRAW|${next.gtUsername}|${next.amount}|${next.id}\n`);
        console.log(`[WITHDRAW] Next in queue: ${next.gtUsername}`);
    } else {
        fs.writeFileSync(WITHDRAW_PENDING_FILE, '');
    }
    
    res.json({ success: true });
});

// Withdrawals
app.post('/withdraw', (req, res) => {
    authenticate(req, res, () => {
        const users = readUsers();
        const user = users[req.user.username];
        
        if (user && user.withdrawDisabled) {
            return res.status(403).json({ error: 'Withdrawals are disabled for your account' });
        }
        
        const { gtUsername, amount, type } = req.body;
        if (!gtUsername || !amount) return res.status(400).json({ error: 'Username and amount required' });
        
        if (user.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });
        
        user.balance -= amount;
        writeUsers(users);
        
        const w = { id: Date.now().toString(), username: req.user.username, gtUsername, amount, type: type || 'wl', status: 'pending', createdAt: new Date().toISOString() };
        withdrawals.push(w);
        writeWithdrawals(withdrawals);
        addTransaction('withdraw', req.user.username, -amount, { gtUsername, type });
        
        fs.writeFileSync(WITHDRAW_PENDING_FILE, `WITHDRAW|${gtUsername}|${amount}|${w.id}\n`);
        
        res.json({ success: true, message: 'Withdrawal requested', withdrawalId: w.id, worldName: '8osocl' });
    });
});

app.get('/withdrawals', (req, res) => {
    authenticate(req, res, () => {
        const userWithdrawals = withdrawals.filter(w => w.username === req.user.username);
        res.json({ withdrawals: userWithdrawals.reverse() });
    });
});

// Tip
app.post('/tip', (req, res) => {
    authenticate(req, res, () => {
        const { to, amount } = req.body;
        if (!to || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid data' });
        
        const users = readUsers();
        const sender = users[req.user.username];
        const receiver = users[to];
        
        if (!sender) return res.status(404).json({ error: 'Sender not found' });
        if (!receiver) return res.status(404).json({ error: 'User not found' });
        if (sender.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });
        if (req.user.username.toLowerCase() === to.toLowerCase()) return res.status(400).json({ error: 'Cannot tip yourself' });
        
        sender.balance -= amount;
        receiver.balance += amount;
        writeUsers(users);
        
        addTransaction('tip_sent', req.user.username, -amount, { to });
        addTransaction('tip_received', to, amount, { from: req.user.username });
        
        console.log(`[TIP] ${req.user.username} tipped ${amount} WL to ${to}`);
        res.json({ success: true, newBalance: sender.balance });
    });
});

// Transactions
app.get('/transactions', (req, res) => {
    authenticate(req, res, () => {
        const userTxs = transactions.filter(t => t.username === req.user.username);
        res.json({ transactions: userTxs.reverse() });
    });
});

// Transaction (for game logging)
app.post('/transaction', authenticate, (req, res) => {
    const { type, username, amount, details } = req.body;
    const tx = {
        type,
        username,
        amount,
        details,
        createdAt: new Date().toISOString()
    };
    transactions.push(tx);
    if (transactions.length > 10000) transactions = transactions.slice(-5000);
    res.json({ success: true });
});

// Profile
app.get('/profile', authenticate, (req, res) => {
    const users = readUsers();
    const user = users[req.user.username];
    console.log('[PROFILE] Request from:', req.user.username, 'User found:', !!user);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
        username: req.user.username,
        createdAt: user.createdAt,
        stats: user.stats || {}
    });
});

app.post('/changePassword', authenticate, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const users = readUsers();
    const user = users[req.user.username];
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const currentHash = crypto.createHash('sha256').update(currentPassword).digest('hex');
    if (user.password !== currentHash) return res.status(400).json({ error: 'Current password is incorrect' });
    
    user.password = crypto.createHash('sha256').update(newPassword).digest('hex');
    writeUsers(users);
    
    console.log(`[AUTH] Password changed for ${req.user.username}`);
    res.json({ success: true });
});

app.post('/deleteAccount', authenticate, (req, res) => {
    const users = readUsers();
    if (!users[req.user.username]) return res.status(404).json({ error: 'User not found' });
    
    delete users[req.user.username];
    writeUsers(users);
    
    // Delete sessions
    Object.keys(sessions).forEach(token => {
        if (sessions[token].username === req.user.username) delete sessions[token];
    });
    writeSessions(sessions);
    
    console.log(`[AUTH] Account deleted: ${req.user.username}`);
    res.json({ success: true });
});

// Chat
app.get('/getChat', (req, res) => {
    chatMessages = readChat();
    res.json({ messages: chatMessages.slice(-50), online: onlineUsers.size });
});

app.post('/sendChat', (req, res) => {
    authenticate(req, res, () => {
        const { message } = req.body;
        if (!message || message.length > 200) return res.status(400).json({ error: 'Invalid message' });
        
        const cleanMessage = message.replace(/[<>]/g, '').substring(0, 200);
        const msg = { type: 'chat', username: req.user.username, message: cleanMessage, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), timestamp: Date.now() };
        chatMessages.push(msg);
        if (chatMessages.length > MAX_CHAT_MESSAGES) chatMessages = chatMessages.slice(-MAX_CHAT_MESSAGES);
        writeChat(chatMessages);
        res.json({ success: true, newMessage: msg });
    });
});

app.post('/broadcastBet', (req, res) => {
    const { game, username, amount, result } = req.body;
    if (!game || !username) return res.json({ success: false });
    
    const cleanUsername = username.replace(/[<>]/g, '').substring(0, 20);
    const msg = { type: 'bet', username: cleanUsername, message: `${cleanUsername} ${result}`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), timestamp: Date.now() };
    chatMessages.push(msg);
    if (chatMessages.length > MAX_CHAT_MESSAGES) chatMessages = chatMessages.slice(-MAX_CHAT_MESSAGES);
    writeChat(chatMessages);
    res.json({ success: true });
});

// Tickets
app.post('/ticket', (req, res) => {
    authenticate(req, res, () => {
        const { subject, message } = req.body;
        if (!subject || !message) return res.status(400).json({ error: 'Subject and message required' });
        
        const ticket = {
            id: crypto.randomBytes(8).toString('hex'),
            username: req.user.username,
            subject: subject.substring(0, 100),
            message: message.substring(0, 1000),
            status: 'open',
            createdAt: new Date().toISOString()
        };
        tickets.push(ticket);
        writeTickets(tickets);
        res.json({ success: true, ticketId: ticket.id });
    });
});

app.get('/tickets', (req, res) => {
    authenticate(req, res, () => {
        const userTickets = tickets.filter(t => t.username === req.user.username);
        res.json({ tickets: userTickets.reverse() });
    });
});

// FAQ
app.get('/faq', (req, res) => {
    res.json({ faq: readFAQ() });
});

// Admin endpoints
app.post('/adminVerify', (req, res) => {
    const { password } = req.body;
    const config = readAdminConfig();
    if (password === config.password) res.json({ success: true });
    else res.status(401).json({ error: 'Invalid password' });
});

app.get('/admin/stats', (req, res) => {
    const { password } = req.headers;
    if (password !== readAdminConfig().password) { res.status(401).json({ error: 'Unauthorized' }); return; }
    
    const users = readUsers();
    const txs = readTransactions();
    const stats = {
        totalUsers: Object.keys(users).length,
        totalBalance: Object.values(users).reduce((s, u) => s + (u.balance || 0), 0),
        onlineUsers: onlineUsers.size,
        totalDeposits: txs.filter(t => t.type === 'deposit').reduce((s, t) => s + t.amount, 0),
        totalWins: txs.filter(t => t.type === 'win').reduce((s, t) => s + t.amount, 0),
        houseProfit: txs.filter(t => t.type === 'deposit').reduce((s, t) => s + t.amount, 0) - txs.filter(t => t.type === 'win').reduce((s, t) => s + t.amount, 0),
        pendingWithdrawals: withdrawals.filter(w => w.status === 'pending').length
    };
    res.json(stats);
});

app.get('/admin/users', (req, res) => {
    const { password } = req.headers;
    if (password !== readAdminConfig().password) { res.status(401).json({ error: 'Unauthorized' }); return; }
    
    const users = readUsers();
    const userList = Object.entries(users).map(([username, data]) => ({
        username,
        balance: data.balance || 0,
        bonusBalance: data.bonusBalance || 0,
        banned: data.banned || false,
        createdAt: data.createdAt,
        stats: data.stats || {},
        online: [...onlineUsers].includes(username)
    }));
    res.json({ users: userList.sort((a, b) => b.balance - a.balance) });
});

app.post('/admin/user/ban', (req, res) => {
    const { password } = req.headers;
    if (password !== readAdminConfig().password) { res.status(401).json({ error: 'Unauthorized' }); return; }
    
    const { username, banned } = req.body;
    const users = readUsers();
    if (users[username]) {
        users[username].banned = banned;
        if (banned) onlineUsers.delete(username);
        writeUsers(users);
        res.json({ success: true });
    } else res.status(404).json({ error: 'User not found' });
});

app.post('/admin/user/toggleDeposit', (req, res) => {
    const { password } = req.headers;
    if (password !== readAdminConfig().password) { res.status(401).json({ error: 'Unauthorized' }); return; }
    
    const { username, disabled } = req.body;
    const users = readUsers();
    if (users[username]) {
        users[username].depositDisabled = disabled;
        writeUsers(users);
        addLog('admin', 'TOGGLE_DEPOSIT', { username, disabled });
        res.json({ success: true, depositDisabled: users[username].depositDisabled });
    } else res.status(404).json({ error: 'User not found' });
});

app.post('/admin/user/toggleWithdraw', (req, res) => {
    const { password } = req.headers;
    if (password !== readAdminConfig().password) { res.status(401).json({ error: 'Unauthorized' }); return; }
    
    const { username, disabled } = req.body;
    const users = readUsers();
    if (users[username]) {
        users[username].withdrawDisabled = disabled;
        writeUsers(users);
        addLog('admin', 'TOGGLE_WITHDRAW', { username, disabled });
        res.json({ success: true, withdrawDisabled: users[username].withdrawDisabled });
    } else res.status(404).json({ error: 'User not found' });
});

app.post('/admin/user/balance', (req, res) => {
    const { password } = req.headers;
    if (password !== readAdminConfig().password) { res.status(401).json({ error: 'Unauthorized' }); return; }
    
    const { username, amount, action, wallet } = req.body;
    const users = readUsers();
    if (users[username]) {
        if (wallet === 'bonus') {
            users[username].bonusBalance = action === 'set' ? amount : (users[username].bonusBalance || 0) + amount;
        } else {
            if (action === 'set') users[username].balance = amount;
            else if (action === 'add') users[username].balance += amount;
            else users[username].balance -= amount;
        }
        writeUsers(users);
        addLog('admin', 'BALANCE_ADJUST', { username, amount, action, wallet });
        res.json({ success: true, balance: users[username].balance });
    } else res.status(404).json({ error: 'User not found' });
});

app.get('/admin/withdrawals', (req, res) => {
    const { password } = req.headers;
    if (password !== readAdminConfig().password) { res.status(401).json({ error: 'Unauthorized' }); return; }
    res.json({ withdrawals: withdrawals.reverse() });
});

app.post('/admin/withdrawal/approve', (req, res) => {
    const { password } = req.headers;
    if (password !== readAdminConfig().password) { res.status(401).json({ error: 'Unauthorized' }); return; }
    
    const { id } = req.body;
    const w = withdrawals.find(w => w.id === id);
    if (w) { w.status = 'approved'; writeWithdrawals(withdrawals); }
    res.json({ success: true });
});

app.post('/admin/withdrawal/reject', (req, res) => {
    const { password } = req.headers;
    if (password !== readAdminConfig().password) { res.status(401).json({ error: 'Unauthorized' }); return; }
    
    const { id } = req.body;
    const w = withdrawals.find(w => w.id === id);
    if (w) {
        w.status = 'rejected';
        const users = readUsers();
        if (users[w.username]) {
            users[w.username].balance += w.amount;
            writeUsers(users);
        }
        writeWithdrawals(withdrawals);
    }
    res.json({ success: true });
});

app.get('/admin/tickets', (req, res) => {
    const { password } = req.headers;
    if (password !== readAdminConfig().password) { res.status(401).json({ error: 'Unauthorized' }); return; }
    res.json({ tickets: tickets.reverse() });
});

app.post('/admin/ticket/respond', (req, res) => {
    const { password } = req.headers;
    if (password !== readAdminConfig().password) { res.status(401).json({ error: 'Unauthorized' }); return; }
    
    const { id, response } = req.body;
    const t = tickets.find(t => t.id === id);
    if (t) { t.status = 'resolved'; t.response = response; writeTickets(tickets); }
    res.json({ success: true });
});

app.get('/admin/games', (req, res) => {
    const { password } = req.headers;
    if (password !== readAdminConfig().password) { res.status(401).json({ error: 'Unauthorized' }); return; }
    readSettings();
    res.json({ games: settings.games, limits: settings.limits });
});

app.post('/admin/games/update', (req, res) => {
    const { password } = req.headers;
    if (password !== readAdminConfig().password) { res.status(401).json({ error: 'Unauthorized' }); return; }
    
    const { games, limits } = req.body;
    if (games) settings.games = { ...settings.games, ...games };
    if (limits) settings.limits = { ...settings.limits, ...limits };
    writeSettings(settings);
    res.json({ success: true });
});

app.get('/admin/promos', (req, res) => {
    const { password } = req.headers;
    if (password !== readAdminConfig().password) { res.status(401).json({ error: 'Unauthorized' }); return; }
    res.json({ promos: readPromos() });
});

app.post('/admin/promo/create', (req, res) => {
    const { password } = req.headers;
    if (password !== readAdminConfig().password) { res.status(401).json({ error: 'Unauthorized' }); return; }
    
    const { code, bonus, type, uses, maxBonus } = req.body;
    const promos = readPromos();
    promos[code.toUpperCase()] = { bonus, type, uses: uses || 0, maxBonus };
    writePromos(promos);
    res.json({ success: true });
});

app.post('/admin/changePassword', (req, res) => {
    const { password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
    const config = readAdminConfig();
    config.password = password;
    writeAdminConfig(config);
    res.json({ success: true });
});

app.get('/admin/logs', (req, res) => {
    const { password } = req.headers;
    if (password !== readAdminConfig().password) { res.status(401).json({ error: 'Unauthorized' }); return; }
    res.json({ logs: adminLogs.reverse() });
});

app.get('/admin/transactions', (req, res) => {
    const { password } = req.headers;
    if (password !== readAdminConfig().password) { res.status(401).json({ error: 'Unauthorized' }); return; }
    res.json({ transactions: transactions.reverse() });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Admin: http://localhost:${PORT}/admin.html (password: munahaju3004)`);
});
