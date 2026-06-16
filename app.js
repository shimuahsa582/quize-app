/**
 * AuraQuiz - Application Controller
 * Manages UI states, localStorage, Gemini API calling, gameplay logic, timers, and reviews.
 */

// --- STATE MANAGEMENT ---
const state = {
    apiKey: '',
    currentScreen: 'screen-api-key', // 'screen-api-key' | 'screen-dashboard' | 'screen-quiz-player' | 'screen-results'
    quiz: {
        title: '',
        questions: [], // Array of question objects { question, options, correctAnswerIndex, explanation }
        difficulty: 'Easy',
        timerSetting: 30, // seconds per question, 0 for unlimited
    },
    gameplay: {
        currentQuestionIndex: 0,
        score: 0,
        answers: [], // Array of indices selected by user, null if timed out
        timeSpent: 0, // total seconds spent on quiz
        timerRemaining: 0,
        timerInterval: null,
        questionStartTime: 0,
        totalQuizStartTime: 0,
    }
};

// --- DOM ELEMENTS ---
const elements = {
    // Header
    headerActions: document.getElementById('header-actions'),
    btnResetKey: document.getElementById('btn-reset-key'),
    
    // Screens
    screenApiKey: document.getElementById('screen-api-key'),
    screenDashboard: document.getElementById('screen-dashboard'),
    screenQuizPlayer: document.getElementById('screen-quiz-player'),
    screenResults: document.getElementById('screen-results'),
    
    // Key Setup Screen
    apiKeyForm: document.getElementById('api-key-form'),
    apiKeyInput: document.getElementById('api-key-input'),
    btnVerifyKey: document.getElementById('btn-verify-key'),
    btnToggleKeyVisibility: document.getElementById('btn-toggle-key-visibility'),
    apiValidationStatus: document.getElementById('api-validation-status'),
    
    // Dashboard Screen
    quizConfigForm: document.getElementById('quiz-config-form'),
    quizTopic: document.getElementById('quiz-topic'),
    suggestions: document.querySelectorAll('.suggestion-tag'),
    btnGenerateQuiz: document.getElementById('btn-generate-quiz'),
    
    // Loader overlay
    loaderOverlay: document.getElementById('loader-overlay'),
    loaderStatusText: document.getElementById('loader-status-text'),
    
    // Quiz Player Screen
    hudTopicText: document.getElementById('hud-topic-text'),
    hudProgressText: document.getElementById('hud-progress-text'),
    hudTimerText: document.getElementById('hud-timer-text'),
    hudTimerContainer: document.getElementById('hud-timer-container'),
    quizProgressBar: document.getElementById('quiz-progress-bar'),
    quizQuestionText: document.getElementById('quiz-question-text'),
    quizOptionsList: document.getElementById('quiz-options-list'),
    feedbackPanel: document.getElementById('feedback-panel'),
    feedbackText: document.getElementById('feedback-text'),
    btnNextQuestion: document.getElementById('btn-next-question'),
    
    // Results Screen
    resultsHeadline: document.getElementById('results-headline'),
    scoreCircleProgress: document.getElementById('score-circle-progress'),
    resultPercentText: document.getElementById('result-percent-text'),
    resultRatioText: document.getElementById('result-ratio-text'),
    statAccuracy: document.getElementById('stat-accuracy'),
    statTimeSpent: document.getElementById('stat-time-spent'),
    statAvgSpeed: document.getElementById('stat-avg-speed'),
    resultsReviewList: document.getElementById('results-review-list'),
    btnRestartQuiz: document.getElementById('btn-restart-quiz'),
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // 1. Setup API key status
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
        state.apiKey = savedKey;
        elements.apiKeyInput.value = savedKey;
        // Key is available, skip API Key screen
        elements.headerActions.classList.remove('hidden');
        switchScreen('screen-dashboard');
    } else {
        switchScreen('screen-api-key');
    }

    // 2. Setup Events
    setupEventListeners();
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    // Toggle key visibility
    elements.btnToggleKeyVisibility.addEventListener('click', () => {
        const type = elements.apiKeyInput.getAttribute('type') === 'password' ? 'text' : 'password';
        elements.apiKeyInput.setAttribute('type', type);
        
        // Toggle icon style
        const eyeIcon = elements.btnToggleKeyVisibility.querySelector('.icon');
        if (type === 'text') {
            eyeIcon.style.color = 'var(--color-secondary)';
        } else {
            eyeIcon.style.color = 'var(--text-muted)';
        }
    });

    // Handle key verification
    elements.apiKeyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const inputKey = elements.apiKeyInput.value.trim();
        if (!inputKey) return;
        
        await verifyAndSaveApiKey(inputKey);
    });

    // Reset API key from header
    elements.btnResetKey.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset your Gemini API Key?')) {
            localStorage.removeItem('gemini_api_key');
            state.apiKey = '';
            elements.apiKeyInput.value = '';
            elements.headerActions.classList.add('hidden');
            switchScreen('screen-api-key');
        }
    });

    // Topic Suggestions
    elements.suggestions.forEach(tag => {
        tag.addEventListener('click', () => {
            elements.quizTopic.value = tag.textContent;
            elements.quizTopic.focus();
        });
    });

    // Config form submission
    elements.quizConfigForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const topic = elements.quizTopic.value.trim();
        const difficulty = document.querySelector('input[name="difficulty"]:checked').value;
        const numQuestions = parseInt(document.querySelector('input[name="num-questions"]:checked').value);
        const questionType = document.querySelector('input[name="question-type"]:checked').value;
        const timerSetting = parseInt(document.querySelector('input[name="timer-setting"]:checked').value);

        if (!topic) return;

        state.quiz.difficulty = difficulty;
        state.quiz.timerSetting = timerSetting;

        await generateQuizFromAI(topic, difficulty, numQuestions, questionType);
    });

    // Next Question Button
    elements.btnNextQuestion.addEventListener('click', () => {
        handleNextQuestion();
    });

    // Restart Quiz Button (Go back to configurations)
    elements.btnRestartQuiz.addEventListener('click', () => {
        switchScreen('screen-dashboard');
    });
}

// --- SCREEN SWITCHING ---
function switchScreen(screenId) {
    const screens = [elements.screenApiKey, elements.screenDashboard, elements.screenQuizPlayer, elements.screenResults];
    
    screens.forEach(screen => {
        if (screen.id === screenId) {
            screen.classList.add('active');
        } else {
            screen.classList.remove('active');
        }
    });
    
    state.currentScreen = screenId;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- API KEY VALIDATION ---
async function verifyAndSaveApiKey(key) {
    showValidationLoading(true);
    
    // Call Gemini with a tiny placeholder request to test key validity
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: 'Hi' }] }],
                generationConfig: { maxOutputTokens: 5 }
            })
        });

        if (response.ok) {
            // Key is valid! Save it.
            localStorage.setItem('gemini_api_key', key);
            state.apiKey = key;
            
            showValidationStatus('API Key verified successfully! Redirecting...', 'success');
            
            setTimeout(() => {
                showValidationLoading(false);
                elements.headerActions.classList.remove('hidden');
                switchScreen('screen-dashboard');
                // Reset form state
                elements.apiValidationStatus.classList.add('hidden');
            }, 1200);
        } else {
            const errData = await response.json();
            const message = errData.error?.message || 'API verification failed. Please try again.';
            throw new Error(message);
        }
    } catch (error) {
        console.error('API Verification error:', error);
        showValidationLoading(false);
        showValidationStatus(`Error: ${error.message}. Please double check your key.`, 'error');
    }
}

function showValidationLoading(isLoading) {
    const btnText = elements.btnVerifyKey.querySelector('.btn-text');
    const spinner = elements.btnVerifyKey.querySelector('.spinner');
    
    if (isLoading) {
        elements.btnVerifyKey.disabled = true;
        btnText.textContent = 'Verifying key...';
        spinner.classList.remove('hidden');
    } else {
        elements.btnVerifyKey.disabled = false;
        btnText.textContent = 'Verify & Continue';
        spinner.classList.add('hidden');
    }
}

function showValidationStatus(message, type) {
    elements.apiValidationStatus.textContent = message;
    elements.apiValidationStatus.className = 'alert'; // reset classes
    
    if (type === 'success') {
        elements.apiValidationStatus.classList.add('alert-success');
    } else {
        elements.apiValidationStatus.classList.add('alert-error');
    }
    
    elements.apiValidationStatus.classList.remove('hidden');
}

// --- AI QUIZ GENERATION ---
async function generateQuizFromAI(topic, difficulty, numQuestions, questionType) {
    showLoader(true, 'Connecting to Gemini AI...');
    
    // Cycle messages to keep user engaged during generation
    const loadingMessages = [
        'Connecting to Gemini AI...',
        'Curating optimal questions...',
        'Formulating plausible distractors...',
        'Ensuring factual and conceptual accuracy...',
        'Reviewing academic standards...',
        'Injecting detailed explanations...',
        'Formatting final layout...'
    ];
    let messageIndex = 0;
    const messageInterval = setInterval(() => {
        messageIndex = (messageIndex + 1) % loadingMessages.length;
        elements.loaderStatusText.textContent = loadingMessages[messageIndex];
    }, 2000);

    // Build the Prompt
    const typeDescription = questionType === 'True/False' 
        ? 'questions MUST be True/False questions only. They should have exactly 2 options: "True" and "False".' 
        : 'questions MUST be multiple choice with exactly 4 options.';

    const systemPrompt = `You are an expert academic tutor and quiz generator.
Your job is to generate a premium quality quiz based on the user's preferences.
Format of options: JSON list. Ensure options are distinct and only ONE option is correct.
Always provide a detailed explanation of why the correct option is indeed correct. Keep the explanation educational and complete.
Do not use markdown inside the quiz question text, keep it plain text.`;

    const userPrompt = `Generate a ${numQuestions}-question quiz.
Topic: "${topic}"
Difficulty Level: ${difficulty}
Question Type: ${questionType}.
${typeDescription}

Provide the quiz title and questions in the requested JSON structure.`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${state.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            title: { type: "STRING" },
                            questions: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        question: { type: "STRING" },
                                        options: {
                                            type: "ARRAY",
                                            items: { type: "STRING" }
                                        },
                                        correctAnswerIndex: { type: "INTEGER", description: "0-based index of the correct option" },
                                        explanation: { type: "STRING", description: "Comprehensive educational explanation of why the correct answer is correct" }
                                    },
                                    required: ["question", "options", "correctAnswerIndex", "explanation"]
                                }
                            }
                        },
                        required: ["title", "questions"]
                    }
                }
            })
        });

        clearInterval(messageInterval);

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || 'Failed to generate quiz.');
        }

        const data = await response.json();
        
        // Extract raw JSON text from Gemini response structure
        const rawJsonText = data.candidates[0].content.parts[0].text;
        const quizData = JSON.parse(rawJsonText);
        
        if (!quizData.questions || quizData.questions.length === 0) {
            throw new Error("No questions returned in the payload.");
        }

        // Save generated quiz to state
        state.quiz.title = quizData.title || `${topic} Quiz`;
        state.quiz.questions = quizData.questions;

        showLoader(false);
        startQuizSession();

    } catch (error) {
        clearInterval(messageInterval);
        showLoader(false);
        console.error('Quiz Generation failed:', error);
        alert(`Failed to generate quiz: ${error.message}\n\nPlease check your topic or try again in a moment.`);
    }
}

function showLoader(show, message = '') {
    if (show) {
        elements.loaderStatusText.textContent = message;
        elements.loaderOverlay.classList.remove('hidden');
    } else {
        elements.loaderOverlay.classList.add('hidden');
    }
}

// --- QUIZ GAMEPLAY SESSION ---
function startQuizSession() {
    // Reset Gameplay State
    state.gameplay.currentQuestionIndex = 0;
    state.gameplay.score = 0;
    state.gameplay.answers = [];
    state.gameplay.timeSpent = 0;
    state.gameplay.totalQuizStartTime = Date.now();
    
    // Set up HUD
    elements.hudTopicText.textContent = state.quiz.title;
    
    // Show first question
    renderCurrentQuestion();
    switchScreen('screen-quiz-player');
}

function renderCurrentQuestion() {
    const qIndex = state.gameplay.currentQuestionIndex;
    const questions = state.quiz.questions;
    const currentQuestion = questions[qIndex];
    
    // Clear previous question state
    elements.btnNextQuestion.disabled = true;
    elements.feedbackPanel.classList.add('hidden');
    elements.feedbackPanel.className = 'feedback-panel hidden'; // reset class
    
    // Progress texts
    elements.hudProgressText.textContent = `${qIndex + 1} / ${questions.length}`;
    
    // Progress bar percent
    const progressPercent = ((qIndex) / questions.length) * 100;
    elements.quizProgressBar.style.width = `${progressPercent}%`;
    
    // Question text
    elements.quizQuestionText.textContent = currentQuestion.question;
    
    // Clear and render option buttons
    elements.quizOptionsList.innerHTML = '';
    
    currentQuestion.options.forEach((option, idx) => {
        const optionBtn = document.createElement('button');
        optionBtn.className = 'option-card';
        
        // Letter mapping (A, B, C, D)
        const letter = String.fromCharCode(65 + idx);
        
        optionBtn.innerHTML = `
            <span class="option-letter">${letter}</span>
            <span class="option-text">${escapeHtml(option)}</span>
            <span class="option-status-icon"></span>
        `;
        
        optionBtn.addEventListener('click', () => handleOptionSelected(idx));
        elements.quizOptionsList.appendChild(optionBtn);
    });
    
    // Start question timer
    startQuestionTimer();
}

// --- TIMER FUNCTIONALITY ---
function startQuestionTimer() {
    clearInterval(state.gameplay.timerInterval);
    
    const limit = state.quiz.timerSetting;
    state.gameplay.questionStartTime = Date.now();
    
    if (limit === 0) {
        // No timer limit
        elements.hudTimerContainer.classList.add('hidden');
        return;
    }
    
    elements.hudTimerContainer.classList.remove('hidden');
    state.gameplay.timerRemaining = limit;
    updateTimerUI();
    
    state.gameplay.timerInterval = setInterval(() => {
        state.gameplay.timerRemaining--;
        updateTimerUI();
        
        if (state.gameplay.timerRemaining <= 0) {
            clearInterval(state.gameplay.timerInterval);
            handleQuestionTimeout();
        }
    }, 1000);
}

function updateTimerUI() {
    const rem = state.gameplay.timerRemaining;
    elements.hudTimerText.textContent = `${rem}s`;
    
    // Dynamic timer color warnings
    elements.hudTimerText.className = 'hud-value'; // reset classes
    if (rem <= 5) {
        elements.hudTimerText.classList.add('timer-danger');
    } else if (rem <= 12) {
        elements.hudTimerText.classList.add('timer-warn');
    } else {
        elements.hudTimerText.classList.add('timer-alert');
    }
}

// --- SELECTION & TIMEOUT HANDLING ---
function handleOptionSelected(selectedIdx) {
    // Stop Timer
    clearInterval(state.gameplay.timerInterval);
    
    const qIndex = state.gameplay.currentQuestionIndex;
    const question = state.quiz.questions[qIndex];
    const correctIdx = question.correctAnswerIndex;
    
    // Store user selection
    state.gameplay.answers.push(selectedIdx);
    
    const isCorrect = (selectedIdx === correctIdx);
    if (isCorrect) {
        state.gameplay.score++;
    }
    
    // Visual Feedback: Disable cards and style them
    const cards = elements.quizOptionsList.querySelectorAll('.option-card');
    cards.forEach((card, idx) => {
        card.disabled = true;
        
        if (idx === correctIdx) {
            card.classList.add('correct');
            card.querySelector('.option-status-icon').textContent = '✓';
        } else if (idx === selectedIdx && !isCorrect) {
            card.classList.add('incorrect');
            card.querySelector('.option-status-icon').textContent = '✗';
        }
    });
    
    // Bottom Feedback Panel
    if (isCorrect) {
        elements.feedbackText.textContent = 'Correct! Outstanding job.';
        elements.feedbackPanel.classList.add('correct-feedback');
    } else {
        elements.feedbackText.textContent = `Incorrect. The correct answer was ${String.fromCharCode(65 + correctIdx)}.`;
        elements.feedbackPanel.classList.add('incorrect-feedback');
    }
    elements.feedbackPanel.classList.remove('hidden');
    
    // Enable Next Question Button
    elements.btnNextQuestion.disabled = false;
}

function handleQuestionTimeout() {
    const qIndex = state.gameplay.currentQuestionIndex;
    const question = state.quiz.questions[qIndex];
    const correctIdx = question.correctAnswerIndex;
    
    // Record timeout answer
    state.gameplay.answers.push(null);
    
    // Alert user visually
    const cards = elements.quizOptionsList.querySelectorAll('.option-card');
    cards.forEach((card, idx) => {
        card.disabled = true;
        if (idx === correctIdx) {
            card.classList.add('correct');
            card.querySelector('.option-status-icon').textContent = '✓';
        }
    });
    
    elements.feedbackText.textContent = `Time's up! The correct answer was ${String.fromCharCode(65 + correctIdx)}.`;
    elements.feedbackPanel.classList.add('incorrect-feedback');
    elements.feedbackPanel.classList.remove('hidden');
    
    elements.btnNextQuestion.disabled = false;
}

function handleNextQuestion() {
    state.gameplay.currentQuestionIndex++;
    
    const totalQuestions = state.quiz.questions.length;
    if (state.gameplay.currentQuestionIndex < totalQuestions) {
        renderCurrentQuestion();
    } else {
        // Finished Quiz! Calculate final total time spent
        state.gameplay.timeSpent = Math.round((Date.now() - state.gameplay.totalQuizStartTime) / 1000);
        renderQuizResults();
    }
}

// --- RESULTS GENERATION ---
function renderQuizResults() {
    const score = state.gameplay.score;
    const totalQ = state.quiz.questions.length;
    const accuracy = Math.round((score / totalQ) * 100);
    
    // Update progress bar to 100% on results load
    elements.quizProgressBar.style.width = '100%';
    
    // 1. Set Score Title Headline
    let headline = 'Excellent achievement! You nailed it.';
    if (accuracy === 100) {
        headline = 'Perfect Score! You are an absolute genius. 🏆';
    } else if (accuracy >= 80) {
        headline = 'Amazing Job! You have a deep understanding here. 🌟';
    } else if (accuracy >= 50) {
        headline = 'Good Effort! With a little practice, you will master it.';
    } else {
        headline = 'Keep Learning! Read the AI reviews below to improve.';
    }
    elements.resultsHeadline.textContent = headline;

    // 2. Animate Circular Progress Gauge
    // Circumference of our circle is ~100
    elements.scoreCircleProgress.setAttribute('stroke-dasharray', `${accuracy}, 100`);
    elements.resultPercentText.textContent = `${accuracy}%`;
    elements.resultRatioText.textContent = `${score} / ${totalQ} Correct`;
    
    // 3. Analytics stats
    elements.statAccuracy.textContent = `${accuracy}%`;
    elements.statTimeSpent.textContent = formatTime(state.gameplay.timeSpent);
    
    const avgSpeed = Math.round(state.gameplay.timeSpent / totalQ);
    elements.statAvgSpeed.textContent = `${avgSpeed}s`;

    // 4. Render Accordion review items
    elements.resultsReviewList.innerHTML = '';
    
    state.quiz.questions.forEach((q, idx) => {
        const userAnswerIdx = state.gameplay.answers[idx];
        const correctIdx = q.correctAnswerIndex;
        const isCorrect = (userAnswerIdx === correctIdx);
        
        const reviewItem = document.createElement('div');
        reviewItem.className = `review-item ${isCorrect ? 'correct' : 'incorrect'}`;
        
        const letterUser = userAnswerIdx !== null ? String.fromCharCode(65 + userAnswerIdx) : 'None (Timed Out)';
        const letterCorrect = String.fromCharCode(65 + correctIdx);
        
        reviewItem.innerHTML = `
            <div class="review-item-header">
                <span class="review-status-indicator">${isCorrect ? '✓' : '✗'}</span>
                <span class="review-question-title">${idx + 1}. ${escapeHtml(q.question)}</span>
                <svg class="icon review-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </div>
            <div class="review-item-body">
                <p class="review-user-answer">
                    <strong>Your Answer:</strong> ${letterUser} ${isCorrect ? '(Correct)' : `- Correct Answer: ${letterCorrect}`}
                </p>
                <div class="explanation-box">
                    <h5>AI Explanation</h5>
                    <p>${escapeHtml(q.explanation)}</p>
                </div>
            </div>
        `;
        
        // Setup accordion click
        const header = reviewItem.querySelector('.review-item-header');
        header.addEventListener('click', () => {
            reviewItem.classList.toggle('expanded');
        });
        
        elements.resultsReviewList.appendChild(reviewItem);
    });

    switchScreen('screen-results');
}

// --- HELPER UTILITIES ---
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
