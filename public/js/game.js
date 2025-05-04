let token = localStorage.getItem('token');
let ws;
let userData = null;

// Authentication functions
async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (response.ok) {
            const data = await response.json();
            token = data.token;
            localStorage.setItem('token', token);
            userData = data.user;
            showGame();
        } else {
            const error = await response.json();
            alert(error.error);
        }
    } catch (error) {
        alert('Login failed: ' + error.message);
    }
}

async function register() {
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        
        if (response.ok) {
            const data = await response.json();
            token = data.token;
            localStorage.setItem('token', token);
            userData = data.user;
            showGame();
        } else {
            const error = await response.json();
            alert(error.error);
        }
    } catch (error) {
        alert('Registration failed: ' + error.message);
    }
}

function showLogin() {
    document.querySelector('.login-form').style.display = 'block';
    document.querySelector('.register-form').style.display = 'none';
}

function showRegister() {
    document.querySelector('.login-form').style.display = 'none';
    document.querySelector('.register-form').style.display = 'block';
}

function showGame() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'block';
    initializeGame();
}

// Game functions
function initializeGame() {
    connectWebSocket();
    loadUserData();
    startActionTimer();
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onopen = () => console.log('Connected to game server');
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'chat') {
            addChatMessage(data);
        }
    };
    
    ws.onclose = () => {
        console.log('Disconnected from server');
        setTimeout(connectWebSocket, 5000);
    };
}

async function loadUserData() {
    try {
        const response = await fetch('/api/user/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            userData = await response.json();
            updateUI();
        }
    } catch (error) {
        console.error('Failed to load user data:', error);
    }
}

async function performBattle() {
    try {
        const response = await fetch('/api/game/battle', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            updateGameStats(data);
            addBattleLog(data);
        }
    } catch (error) {
        console.error('Battle failed:', error);
    }
}

function updateUI() {
    // Update UI with user data
    if (userData) {
        document.getElementById('playerName').textContent = userData.username;
        document.getElementById('playerLevel').textContent = userData.level;
        document.getElementById('playerGold').textContent = userData.gold;
        document.getElementById('playerAmethyst').textContent = userData.amethyst;
        document.getElementById('playerActions').textContent = userData.actions;
    }
}

function startActionTimer() {
    setInterval(() => {
        // Update action timer
        // Add logic for action regeneration
    }, 1000);
}

// Initialize on page load
window.onload = () => {
    if (token) {
        // Auto-login if token exists
        loadUserData().then(() => {
            showGame();
        }).catch(() => {
            localStorage.removeItem('token');
        });
    }
};
