const handSVG = `
<svg viewBox="0 0 100 100" class="hand-svg">
    <path d="M73.2,85.2H41.8c-5.5,0-10-4.5-10-10V41.8c0-5.5,4.5-10,10-10h31.5c5.5,0,10,4.5,10,10v33.5C83.2,80.7,78.7,85.2,73.2,85.2z" />
    <path class="thumb" d="M41.8,31.8v-8.5c0-5.5,4.5-10,10-10h0c5.5,0,10,4.5,10,10v26.5" />
</svg>`;

// --- DOM Elements ---
const playerScoreEl = document.getElementById('player-score');
const cpuScoreEl = document.getElementById('cpu-score');
const cpuHandLeftEl = document.getElementById('cpu-hand-left');
const cpuHandRightEl = document.getElementById('cpu-hand-right');
const playerHandLeftEl = document.getElementById('player-hand-left');
const playerHandRightEl = document.getElementById('player-hand-right');
const turnIndicator = document.getElementById('turn-indicator');
const chantText = document.getElementById('chant-text');
const cpuCallText = document.getElementById('cpu-call-text');
const playButton = document.getElementById('play-button');
const controlsArea = document.getElementById('controls-area');
const thumbsControls = document.getElementById('thumbs-controls');
const callControls = document.getElementById('call-controls');
const gameOverScreen = document.getElementById('game-over-screen');
const gameOverText = document.getElementById('game-over-text');
const restartButton = document.getElementById('restart-button');
const thumbsButtons = document.querySelectorAll('.thumbs-btn');
const callButtons = document.querySelectorAll('.call-btn');

// --- Game State ---
let playerScore = 0;
let cpuScore = 0;
let playerChoice = { thumbs: null, call: null };
let gameState = 'playing'; // 'playing', 'revealing', 'gameover'
let currentTurn = 'player'; // 'player' or 'cpu'

// --- Initialize Game ---
function init() {
    playerHandLeftEl.innerHTML = handSVG;
    playerHandRightEl.innerHTML = handSVG;
    cpuHandLeftEl.innerHTML = handSVG;
    cpuHandRightEl.innerHTML = handSVG;
    resetRound();
}

// --- Update UI based on current turn and hands ---
function updateTurnUI() {
    if (currentTurn === 'player') {
        turnIndicator.textContent = '【あなたの番】';
        chantText.textContent = '指をあげて、合計数をコール！';
    } else { // CPU's turn
        turnIndicator.textContent = '【CPUの番】';
        chantText.textContent = '指をあげてください';
    }
}

function updateControlsAndHands() {
    const playerHands = 2 - playerScore;
    const cpuHands = 2 - cpuScore;

    // Update visible hands
    playerHandRightEl.style.visibility = playerHands > 1 ? 'visible' : 'hidden';
    playerHandLeftEl.style.visibility = playerHands > 0 ? 'visible' : 'hidden';
    cpuHandRightEl.style.visibility = cpuHands > 1 ? 'visible' : 'hidden';
    cpuHandLeftEl.style.visibility = cpuHands > 0 ? 'visible' : 'hidden';

    // Update controls visibility based on turn
    if(playerHands > 0) {
        thumbsControls.style.display = 'block';
        callControls.style.display = currentTurn === 'player' ? 'block' : 'none';
    } else {
        thumbsControls.style.display = 'none';
        callControls.style.display = 'none';
    }

    // Update available thumb buttons for player
    thumbsButtons.forEach(btn => {
        const value = parseInt(btn.dataset.value);
        btn.style.display = value > playerHands ? 'none' : 'inline-block';
    });

    // Update available call buttons
    const maxTotalThumbs = playerHands + cpuHands;
    callButtons.forEach(btn => {
        const value = parseInt(btn.dataset.value);
        btn.style.display = value > maxTotalThumbs ? 'none' : 'inline-block';
    });
}

// --- Reset for New Round ---
function resetRound() {
    updateTurnUI();
    updateControlsAndHands();
    chantText.classList.remove('result-reveal');
    cpuCallText.classList.add('opacity-0');

    // Reset hands to fists
    document.querySelectorAll('.hand-svg').forEach(hand => {
        hand.classList.remove('thumb-up', 'shake');
    });

    playerChoice = { thumbs: null, call: null };
    thumbsButtons.forEach(btn => btn.classList.remove('selected'));
    callButtons.forEach(btn => btn.classList.remove('selected'));

    playButton.disabled = true;
    controlsArea.style.display = 'block';
}

// --- Player Input Handlers ---
thumbsButtons.forEach(button => {
    button.addEventListener('click', () => {
        if (gameState !== 'playing') return;
        playerChoice.thumbs = parseInt(button.dataset.value);
        thumbsButtons.forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
        updatePlayerHands(playerChoice.thumbs);
        checkCanPlay();
    });
});

callButtons.forEach(button => {
    button.addEventListener('click', () => {
        if (gameState !== 'playing') return;
        playerChoice.call = parseInt(button.dataset.value);
        callButtons.forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
        checkCanPlay();
    });
});

function checkCanPlay() {
    const playerHands = 2 - playerScore;
    if (playerHands <= 0) {
        playButton.disabled = true;
        return;
    }

    if (currentTurn === 'player') {
        playButton.disabled = playerChoice.thumbs === null || playerChoice.call === null;
    } else { // CPU's turn
        playButton.disabled = playerChoice.thumbs === null;
    }
}

// --- Update Visual Hands ---
function updatePlayerHands(count) {
    playerHandLeftEl.querySelector('.hand-svg').classList.toggle('thumb-up', count >= 1);
    playerHandRightEl.querySelector('.hand-svg').classList.toggle('thumb-up', count === 2);
}

function updateCpuHands(count) {
    cpuHandLeftEl.querySelector('.hand-svg').classList.toggle('thumb-up', count >= 1);
    cpuHandRightEl.querySelector('.hand-svg').classList.toggle('thumb-up', count === 2);
}

// --- Main Game Logic ---
playButton.addEventListener('click', () => {
    if (gameState !== 'playing' || playButton.disabled) return;
    gameState = 'revealing';
    controlsArea.style.display = 'none';

    // Current hand counts
    const playerHands = 2 - playerScore;
    const cpuHands = 2 - cpuScore;

    // CPU decides its thumbs
    const cpuThumbs = Math.floor(Math.random() * (cpuHands + 1));

    // Calls are decided by the current turn's player
    let playerCall, cpuCall;
    if (currentTurn === 'player') {
        playerCall = playerChoice.call;
        cpuCall = null;
    } else { // CPU's turn
        playerCall = null;
        // Simple AI for CPU's call
        let possibleCalls = [0, 1, 2, 3, 4];
        possibleCalls = possibleCalls.filter(n => n >= cpuThumbs && n <= cpuThumbs + playerHands);
        cpuCall = possibleCalls[Math.floor(Math.random() * possibleCalls.length)];
    }

    // Animation sequence
    turnIndicator.textContent = '';
    chantText.textContent = 'いっせーのー...';
    document.querySelectorAll('.hand-svg').forEach(hand => hand.classList.add('shake'));

    setTimeout(() => {
        chantText.textContent = 'せ！';
        document.querySelectorAll('.hand-svg').forEach(hand => hand.classList.remove('shake'));

        // Reveal thumbs
        updateCpuHands(cpuThumbs);

        // Reveal calls
        if (cpuCall !== null) {
            cpuCallText.querySelector('span').textContent = cpuCall;
            cpuCallText.classList.remove('opacity-0');
        }

        // Calculate result
        const totalThumbs = playerChoice.thumbs + cpuThumbs;
        const playerGuessed = playerCall === totalThumbs;
        const cpuGuessed = cpuCall === totalThumbs;

        // Determine winner
        let resultMessage = `合計は ${totalThumbs} 本！`;
        let roundWinner = null;

        if (playerGuessed) {
            resultMessage += '<br>あなたの勝ち！';
            roundWinner = 'player';
        } else if (cpuGuessed) {
            resultMessage += '<br>CPUの勝ち！';
            roundWinner = 'cpu';
        } else {
            resultMessage += '<br>はずれ！';
        }

        chantText.innerHTML = resultMessage;
        chantText.classList.add('result-reveal');

        // Update score
        if (roundWinner === 'player') {
            playerScore++;
        } else if (roundWinner === 'cpu') {
            cpuScore++;
        }
        playerScoreEl.textContent = playerScore;
        cpuScoreEl.textContent = cpuScore;

        setTimeout(() => {
            if (playerScore >= 2 || cpuScore >= 2) {
                endGame();
            } else {
                // Switch turns
                currentTurn = (currentTurn === 'player') ? 'cpu' : 'player';
                gameState = 'playing';
                resetRound();
            }
        }, 2500);

    }, 1000);
});

// --- End Game ---
function endGame() {
    gameState = 'gameover';
    updateControlsAndHands(); // Hide hands of winner
    if (playerScore >= 2) {
        gameOverText.textContent = 'あなたの勝利！';
    } else {
        gameOverText.textContent = 'あなたの負け...';
    }
    gameOverScreen.classList.remove('hidden');
}

// --- Restart Game ---
restartButton.addEventListener('click', () => {
    playerScore = 0;
    cpuScore = 0;
    playerScoreEl.textContent = playerScore;
    cpuScoreEl.textContent = cpuScore;
    currentTurn = 'player';
    gameState = 'playing';
    resetRound();
    gameOverScreen.classList.add('hidden');
});

// --- Start ---
init();
