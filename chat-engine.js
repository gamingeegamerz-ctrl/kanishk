/**
 * ============================================
 *   ADVANCED CHAT ENGINE v2.0
 *   Enterprise Grade Real-Time Communication
 *   Copyright © 2026 - Kanishk Ghongade
 * ============================================
 */

// Your Firebase Configuration
// REPLACE WITH YOUR ACTUAL FIREBASE CREDENTIALS
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    databaseURL: "YOUR_DATABASE_URL",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Global state
let currentUser = null;
let currentUserId = null;
let currentTypingTimeout = null;
let selectedMessageId = null;

// Initialize chat system
function initializeChat() {
    if (!currentUser) return;
    
    // Load messages
    loadMessages();
    
    // Setup typing indicator
    setupTypingIndicator();
    
    // Setup presence
    setupPresence();
    
    // Mark messages as seen
    markMessagesAsSeen();
}

// ========== MESSAGES ==========
function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (!message || !currentUser) return;
    
    const messageData = {
        userId: currentUserId,
        userName: currentUser,
        text: message,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        seen: false,
        delivered: true,
        edited: false
    };
    
    // Push to Firebase
    database.ref('messages').push(messageData)
        .then(() => {
            input.value = '';
            autoResize(input);
            
            // Clear typing indicator
            stopTyping();
        })
        .catch(error => {
            console.error('Error sending message:', error);
        });
}

function loadMessages() {
    const messagesRef = database.ref('messages');
    
    // Load existing messages
    messagesRef.once('value', (snapshot) => {
        const messages = snapshot.val();
        if (messages) {
            Object.keys(messages).forEach(key => {
                displayMessage(messages[key], key);
            });
        }
    });
    
    // Listen for new messages
    messagesRef.on('child_added', (snapshot) => {
        const message = snapshot.val();
        const messageId = snapshot.key;
        
        // Don't duplicate if already displayed
        if (!document.getElementById(`msg-${messageId}`)) {
            displayMessage(message, messageId);
        }
        
        // Mark as seen if visible
        if (message.userId !== currentUserId) {
            markMessageAsSeen(messageId);
        }
    });
    
    // Listen for message updates (seen, edit, delete)
    messagesRef.on('child_changed', (snapshot) => {
        const message = snapshot.val();
        const messageId = snapshot.key;
        updateMessageDisplay(messageId, message);
    });
    
    // Listen for message deletions
    messagesRef.on('child_removed', (snapshot) => {
        const messageId = snapshot.key;
        removeMessageDisplay(messageId);
    });
}

function displayMessage(message, messageId) {
    const container = document.getElementById('messagesContainer');
    const isSelf = message.userId === currentUserId;
    
    const messageWrapper = document.createElement('div');
    messageWrapper.className = `message-wrapper ${isSelf ? 'self' : 'other'}`;
    messageWrapper.id = `msg-${messageId}`;
    
    const time = message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';
    
    const messageHTML = `
        <div class="message-bubble">
            ${!isSelf ? `<div class="message-sender">${message.userName || 'User'}</div>` : ''}
            <div class="message-text">${escapeHTML(message.text)}</div>
            <div class="message-meta">
                <span class="message-time">${time}</span>
                ${isSelf ? `
                    <span class="message-status">
                        ${message.seen ? '<i class="fas fa-check-double seen" title="Seen"></i>' : '<i class="fas fa-check" title="Delivered"></i>'}
                    </span>
                ` : ''}
            </div>
            <div class="message-actions">
                <button class="message-action-btn" onclick="replyToMessage('${messageId}')" title="Reply">
                    <i class="fas fa-reply"></i>
                </button>
                ${isSelf ? `
                    <button class="message-action-btn" onclick="editMessage('${messageId}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="message-action-btn delete" onclick="deleteMessage('${messageId}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : ''}
            </div>
        </div>
    `;
    
    messageWrapper.innerHTML = messageHTML;
    container.appendChild(messageWrapper);
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

function updateMessageDisplay(messageId, message) {
    const messageElement = document.getElementById(`msg-${messageId}`);
    if (!messageElement) return;
    
    const time = message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';
    const messageBubble = messageElement.querySelector('.message-bubble');
    
    if (message.deleted) {
        messageBubble.innerHTML = `
            <div class="message-text" style="font-style: italic; color: var(--neutral-500);">
                <i class="fas fa-trash"></i> This message was deleted
            </div>
        `;
    } else if (message.edited) {
        const textElement = messageBubble.querySelector('.message-text');
        textElement.innerHTML = escapeHTML(message.text) + ' <span style="font-size: 0.75rem; opacity: 0.7;">(edited)</span>';
        
        const statusElement = messageBubble.querySelector('.message-status');
        if (statusElement && message.seen) {
            statusElement.innerHTML = '<i class="fas fa-check-double seen" title="Seen"></i>';
        }
    } else {
        const statusElement = messageBubble.querySelector('.message-status');
        if (statusElement && message.seen) {
            statusElement.innerHTML = '<i class="fas fa-check-double seen" title="Seen"></i>';
        }
    }
}

function removeMessageDisplay(messageId) {
    const messageElement = document.getElementById(`msg-${messageId}`);
    if (messageElement) {
        messageElement.remove();
    }
}

// ========== MESSAGE ACTIONS ==========
function deleteMessage(messageId) {
    if (confirm('Delete this message?')) {
        database.ref(`messages/${messageId}`).update({
            deleted: true,
            text: '[Deleted]'
        });
    }
}

function editMessage(messageId) {
    const messageElement = document.getElementById(`msg-${messageId}`);
    const messageText = messageElement.querySelector('.message-text').innerText;
    
    const newText = prompt('Edit message:', messageText);
    if (newText && newText.trim() !== '') {
        database.ref(`messages/${messageId}`).update({
            text: newText.trim(),
            edited: true,
            editTimestamp: firebase.database.ServerValue.TIMESTAMP
        });
    }
}

function replyToMessage(messageId) {
    const messageElement = document.getElementById(`msg-${messageId}`);
    const messageText = messageElement.querySelector('.message-text').innerText;
    
    // Set reply in input
    const input = document.getElementById('messageInput');
    input.value = `↪️ ${messageText.substring(0, 30)}...\n`;
    input.focus();
    autoResize(input);
}

// ========== TYPING INDICATOR ==========
function setupTypingIndicator() {
    const input = document.getElementById('messageInput');
    
    input.addEventListener('input', () => {
        if (!currentUser) return;
        
        // Clear previous timeout
        if (currentTypingTimeout) {
            clearTimeout(currentTypingTimeout);
        }
        
        // Set typing status
        database.ref('typing/' + currentUserId).set({
            isTyping: true,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Set timeout to stop typing
        currentTypingTimeout = setTimeout(() => {
            stopTyping();
        }, 2000);
    });
    
    // Listen for other user's typing
    const otherUserId = currentUserId === 'user1' ? 'user2' : 'user1';
    database.ref('typing/' + otherUserId).on('value', (snapshot) => {
        const typing = snapshot.val();
        const indicator = document.getElementById('typingIndicator');
        
        if (typing && typing.isTyping) {
            const timeDiff = Date.now() - (typing.timestamp || 0);
            if (timeDiff < 3000) {
                indicator.style.display = 'flex';
            } else {
                indicator.style.display = 'none';
            }
        } else {
            indicator.style.display = 'none';
        }
    });
}

function stopTyping() {
    if (currentUserId) {
        database.ref('typing/' + currentUserId).set({
            isTyping: false,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    }
}

// ========== SEEN/READ RECEIPTS ==========
function markMessageAsSeen(messageId) {
    database.ref(`messages/${messageId}`).update({
        seen: true,
        seenTimestamp: firebase.database.ServerValue.TIMESTAMP
    });
}

function markMessagesAsSeen() {
    const messagesRef = database.ref('messages');
    
    messagesRef.once('value', (snapshot) => {
        const messages = snapshot.val();
        if (messages) {
            Object.keys(messages).forEach(key => {
                const msg = messages[key];
                if (msg.userId !== currentUserId && !msg.seen) {
                    database.ref(`messages/${key}`).update({
                        seen: true,
                        seenTimestamp: firebase.database.ServerValue.TIMESTAMP
                    });
                }
            });
        }
    });
}

// ========== PRESENCE SYSTEM ==========
function setupPresence() {
    if (!currentUserId) return;
    
    const userStatusRef = database.ref('status/' + currentUserId);
    
    userStatusRef.set({
        online: true,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
    
    // Set offline on page unload
    window.addEventListener('beforeunload', () => {
        userStatusRef.set({
            online: false,
            lastSeen: firebase.database.ServerValue.TIMESTAMP
        });
    });
}

// ========== UTILITIES ==========
function escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== ROMANTIC SURPRISE ==========
function sendRomanticMessage() {
    const romanticMessages = [
        "✨ Thinking of you during my research break...",
        "📚 This chapter reminds me of you - beautiful and complex",
        "💕 Collaboration has never felt this special",
        "🎓 You're the best part of my academic journey",
        "💫 Every algorithm leads back to you"
    ];
    
    const randomMsg = romanticMessages[Math.floor(Math.random() * romanticMessages.length)];
    
    const input = document.getElementById('messageInput');
    input.value = randomMsg;
    autoResize(input);
}

// Export functions to global scope
window.sendMessage = sendMessage;
window.deleteMessage = deleteMessage;
window.editMessage = editMessage;
window.replyToMessage = replyToMessage;
window.sendRomanticMessage = sendRomanticMessage;
window.initializeChat = initializeChat;