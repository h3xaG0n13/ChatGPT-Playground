document.addEventListener("DOMContentLoaded", () => {
    const chatForm = document.getElementById("chat-form");
    const userInput = document.getElementById("userInput");
    const chatContainer = document.getElementById("chat");
    const sendBtn = document.getElementById("sendBtn");
    const previousPromptsList = document.getElementById("previousPromptsList");
    const promptTokensSpan = document.getElementById("promptTokens");
    const completionTokensSpan = document.getElementById("completionTokens");
    const totalTokensSpan = document.getElementById("totalTokens");
    const tokenChartCanvas = document.getElementById("tokenChart");
    const modelSelect = document.getElementById("modelSelect");
    const clearHistoryBtn = document.getElementById("clearHistoryBtn");
    const stopBtn = document.getElementById("stopBtn");

    // Resizer elements
    const leftPanel = document.getElementById("left-panel");
    const chatboxSection = document.getElementById("chatbox-section");
    const verticalResizer = document.getElementById("vertical-resizer");
    const dashboardSection = document.getElementById("dashboard-section");
    const promptsSection = document.getElementById("prompts-section");
    const horizontalResizer = document.getElementById("horizontal-resizer");

    // Initialize token counts (these are for display, actual come from backend)
    let currentPromptTokens = 0;
    let currentCompletionTokens = 0;
    let currentTotalTokens = 0;

    // Array to store token usage history for the chart
    let tokenUsageHistory = [];
    let tokenChart; // Variable to hold the Chart.js instance

    // AbortController for stopping fetch requests
    let abortController = null;

    // --- Ollama Server Status Check ---
    async function checkOllamaStatus() {
        const ollamaOption = modelSelect.querySelector('option[value="llama3"]');
        const statusMessage = document.createElement('span');
        statusMessage.id = 'ollama-status';
        statusMessage.classList.add('ml-2', 'text-xs', 'font-medium');

        try {
            const response = await fetch('http://localhost:11434', { method: 'GET', mode: 'no-cors' });
            if (response.type === 'opaque' || response.ok) {
                statusMessage.textContent = 'Ollama: Online ✅';
                statusMessage.classList.add('text-green-600');
                ollamaOption.disabled = false;
            } else {
                throw new Error('Server returned non-OK response');
            }
        } catch (error) {
            statusMessage.textContent = 'Ollama: Offline ❌';
            statusMessage.classList.add('text-red-600');
            ollamaOption.disabled = true;
            if (modelSelect.value === 'llama3') {
                modelSelect.value = 'openai'; // Default to another working model
            }
            console.warn("Ollama server at http://localhost:11434 is not reachable. Llama3 option disabled.");
        } finally {
            const existingStatus = document.getElementById('ollama-status');
            if (existingStatus) {
                existingStatus.remove();
            }
            modelSelect.parentNode.insertBefore(statusMessage, modelSelect.nextSibling);
        }
    }

    // --- Resizing Logic (Unchanged) ---
    const setInitialLayout = () => {
        const totalWidth = window.innerWidth - (4 * 16) - verticalResizer.offsetWidth;
        const leftWidth = totalWidth * 0.5;
        const rightWidth = totalWidth * 0.5;

        leftPanel.style.width = `${leftWidth}px`;
        chatboxSection.style.width = `${rightWidth}px`;

        const initialDashboardHeight = Math.max(250, leftPanel.offsetHeight * 0.3);
        dashboardSection.style.height = `${initialDashboardHeight}px`;
        promptsSection.style.height = `${leftPanel.offsetHeight - initialDashboardHeight - horizontalResizer.offsetHeight - (4*4)}px`;
        promptsSection.style.flexGrow = '1';

        if (tokenChart) tokenChart.resize();
    };

    let isResizingVertical = false;
    let isResizingHorizontal = false;

    verticalResizer.addEventListener("mousedown", (e) => {
        isResizingVertical = true;
        document.body.style.cursor = "ew-resize";
        const initialX = e.clientX;
        const initialLeftPanelWidth = leftPanel.offsetWidth;
        const initialChatboxWidth = chatboxSection.offsetWidth;

        function onMouseMove(e) {
            if (!isResizingVertical) return;
            const dx = e.clientX - initialX;

            let newLeftWidth = initialLeftPanelWidth + dx;
            let newRightWidth = initialChatboxWidth - dx;

            const minLeftWidth = parseFloat(window.getComputedStyle(leftPanel).minWidth);
            const minRightWidth = parseFloat(window.getComputedStyle(chatboxSection).minWidth);

            if (newLeftWidth < minLeftWidth) {
                newLeftWidth = minLeftWidth;
                newRightWidth = initialLeftPanelWidth + initialChatboxWidth - minLeftWidth;
            }
            if (newRightWidth < minRightWidth) {
                newRightWidth = minRightWidth;
                newLeftWidth = initialLeftPanelWidth + initialChatboxWidth - minRightWidth;
            }

            leftPanel.style.width = `${newLeftWidth}px`;
            chatboxSection.style.width = `${newRightWidth}px`;
        }

        function onMouseUp() {
            isResizingVertical = false;
            document.body.style.cursor = "default";
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            if (tokenChart) tokenChart.resize();
        }

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    });

    horizontalResizer.addEventListener("mousedown", (e) => {
        isResizingHorizontal = true;
        document.body.style.cursor = "ns-resize";
        const initialY = e.clientY;
        const initialDashboardHeight = dashboardSection.offsetHeight;
        const initialPromptsHeight = promptsSection.offsetHeight;

        function onMouseMove(e) {
            if (!isResizingHorizontal) return;
            const dy = e.clientY - initialY;

            let newDashboardHeight = initialDashboardHeight + dy;
            let newPromptsHeight = initialPromptsHeight - dy;

            const minDashboardHeight = 100;
            const minPromptsHeight = 150;

            if (newDashboardHeight < minDashboardHeight) {
                newDashboardHeight = minDashboardHeight;
                const totalLeftPanelHeight = leftPanel.offsetHeight;
                newPromptsHeight = totalLeftPanelHeight - newDashboardHeight - horizontalResizer.offsetHeight - (4*4);
            }
            if (newPromptsHeight < minPromptsHeight) {
                newPromptsHeight = minPromptsHeight;
                const totalLeftPanelHeight = leftPanel.offsetHeight;
                newDashboardHeight = totalLeftPanelHeight - newPromptsHeight - horizontalResizer.offsetHeight - (4*4);
            }

            dashboardSection.style.height = `${newDashboardHeight}px`;
            promptsSection.style.height = `${newPromptsHeight}px`;
            promptsSection.style.flexGrow = '0';
        }

        function onMouseUp() {
            isResizingHorizontal = false;
            document.body.style.cursor = "default";
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            if (promptsSection.style.height === '') {
                 promptsSection.style.flexGrow = '1';
            }
            if (tokenChart) tokenChart.resize();
        }

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    });

    // --- Chatbot, Token Display, and Chart Logic ---

    // Function to get the full name of the selected model for display
    function getModelDisplayName() {
        const selectedOption = modelSelect.options[modelSelect.selectedIndex];
        return selectedOption.text;
    }

    // Function to add a message to the chat display
    function addMessage(sender, message, isTypingEffect = false) {
        const messageDiv = document.createElement("div");
        messageDiv.classList.add("flex", "items-start", "gap-3", "p-2", "rounded-lg");

        const avatarDiv = document.createElement("div");
        avatarDiv.classList.add("flex-shrink-0", "w-8", "h-8", "rounded-full", "flex", "items-center", "justify-center", "text-white", "font-bold");

        const contentDiv = document.createElement("div");
        contentDiv.classList.add("flex-grow", "min-w-0", "p-3", "rounded-lg", "break-words", "whitespace-pre-wrap");

        if (sender === "user") {
            messageDiv.classList.add("justify-end");
            avatarDiv.classList.add("bg-blue-500");
            avatarDiv.innerText = "You";
            contentDiv.classList.add("bg-blue-100", "text-gray-800");
            contentDiv.innerText = message;
        } else { // sender === "ai"
            messageDiv.classList.add("justify-start");
            // Use different color based on model for AI avatar
            let avatarColorClass = "bg-purple-500"; // Default for Llama3 (Ollama)
            if (modelSelect.value === "groq") {
                avatarColorClass = "bg-green-500";
            } else if (modelSelect.value === "openai") {
                avatarColorClass = "bg-blue-600";
            } else if (modelSelect.value === "gemini-flash") {
                avatarColorClass = "bg-red-500";
            }
            avatarDiv.classList.add(avatarColorClass);
            avatarDiv.innerText = getModelDisplayName().charAt(0); // First letter of model name
            contentDiv.classList.add("bg-gray-100", "text-gray-800");
            if (isTypingEffect) {
                contentDiv.classList.add("typing-effect"); // Add a class for typing effect
            }
            contentDiv.innerText = message;
        }

        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(contentDiv);
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight; // Scroll to bottom
        return contentDiv; // Return the content div for typing effect
    }

    // Function to add a system message to the chat display
    function addSystemMessage(message) {
        const messageDiv = document.createElement("div");
        messageDiv.classList.add("system-message", "text-center", "text-sm", "text-gray-500", "italic", "p-2", "rounded-lg");
        messageDiv.textContent = message;
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight; // Scroll to bottom
    }

    // Function to simulate typing effect
    async function typeMessage(element, text) {
        element.innerText = ""; // Clear existing content
        for (let i = 0; i < text.length; i++) {
            element.innerText += text.charAt(i);
            chatContainer.scrollTop = chatContainer.scrollHeight; // Keep scrolling
            await new Promise(resolve => setTimeout(resolve, 10)); // Adjust typing speed here (ms per character)
        }
        element.classList.remove("typing-effect"); // Remove typing class after completion
    }

    // Function to initialize the token usage chart
    function initializeTokenChart() {
        tokenChart = new Chart(tokenChartCanvas, {
            type: 'line',
            data: {
                labels: [], // X-axis: Prompt progression (e.g., "Prompt 0", "Prompt 1")
                datasets: [{
                    label: 'Prompt Tokens',
                    data: [],
                    borderColor: 'rgb(59, 130, 246)', // Tailwind blue-500
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    tension: 0.1,
                    fill: false,
                    pointRadius: 5,
                    pointHoverRadius: 8
                }, {
                    label: 'Completion Tokens',
                    data: [],
                    borderColor: 'rgb(34, 197, 94)', // Tailwind green-500
                    backgroundColor: 'rgba(34, 197, 94, 0.2)',
                    tension: 0.1,
                    fill: false,
                    pointRadius: 5,
                    pointHoverRadius: 8
                }, {
                    label: 'Total Tokens',
                    data: [],
                    borderColor: 'rgb(168, 85, 247)', // Tailwind purple-500
                    backgroundColor: 'rgba(168, 85, 247, 0.2)',
                    tension: 0.1,
                    fill: false,
                    pointRadius: 5,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Prompt Number',
                            color: '#4B5563'
                        },
                        ticks: {
                            color: '#4B5563'
                        },
                        grid: {
                            color: 'rgba(209, 213, 219, 0.3)'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Tokens',
                            color: '#4B5563'
                        },
                        ticks: {
                            color: '#4B5563',
                            min: 0,
                            max: 10000,
                            stepSize: 1000
                        },
                        grid: {
                            color: 'rgba(209, 213, 219, 0.3)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#4B5563'
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                }
            }
        });
    }

    // Function to update token display and chart
    function updateTokenDisplayAndChart(tokens) {
        promptTokensSpan.innerText = tokens.prompt;
        completionTokensSpan.innerText = tokens.completion;
        totalTokensSpan.innerText = tokens.total;

        // Add current token usage to history
        tokenUsageHistory.push({
            prompt: `Prompt ${tokenUsageHistory.length}`, // Corrected to start from Prompt 0
            promptTokens: tokens.prompt,
            completionTokens: tokens.completion,
            totalTokens: tokens.total
        });

        // Update Chart.js data
        tokenChart.data.labels = tokenUsageHistory.map(entry => entry.prompt);
        tokenChart.data.datasets[0].data = tokenUsageHistory.map(entry => entry.promptTokens);
        tokenChart.data.datasets[1].data = tokenUsageHistory.map(entry => entry.completionTokens);
        tokenChart.data.datasets[2].data = tokenUsageHistory.map(entry => entry.totalTokens);
        tokenChart.update(); // Redraw the chart
    }

    // Function to load and display previous prompts from localStorage
    function loadPreviousPrompts() {
        const prompts = JSON.parse(localStorage.getItem("chatPrompts") || "[]");
        previousPromptsList.innerHTML = ""; // Clear existing list

        if (prompts.length === 0) {
            const noPrompts = document.createElement("li");
            noPrompts.classList.add("text-gray-500", "italic", "text-sm", "py-2");
            noPrompts.innerText = "No previous prompts.";
            previousPromptsList.appendChild(noPrompts);
        } else {
            prompts.forEach((prompt, index) => {
                const li = document.createElement("li");
                li.classList.add(
                    "bg-gray-50", "hover:bg-gray-100", "p-3", "rounded-md", "cursor-pointer",
                    "transition-colors", "text-gray-700", "text-sm", "truncate"
                );
                li.innerText = prompt;
                // Allow clicking on a previous prompt to load it into the input
                li.addEventListener("click", () => {
                    userInput.value = prompt;
                    userInput.focus();
                });
                previousPromptsList.prepend(li); // Add to the top of the list
            });
        }
    }

    // Function to save a new prompt to localStorage
    function savePrompt(prompt) {
        const prompts = JSON.parse(localStorage.getItem("chatPrompts") || "[]");
        prompts.push(prompt);
        // Keep only the last 10 prompts to prevent excessive storage
        if (prompts.length > 10) {
            prompts.shift(); // Remove the oldest prompt
        }
        localStorage.setItem("chatPrompts", JSON.stringify(prompts));
        loadPreviousPrompts(); // Reload the list to show the new prompt
    }

    // --- Clear History Functionality ---
    clearHistoryBtn.addEventListener("click", () => {
        const userConfirmed = window.confirm("Are you sure you want to clear all previous prompts? This cannot be undone.");
        if (userConfirmed) {
            localStorage.removeItem("chatPrompts");
            loadPreviousPrompts(); // Reload to show empty state
            addSystemMessage("Chat history cleared.");
            // Reset token history and chart
            tokenUsageHistory = [];
            tokenChart.data.labels = [];
            tokenChart.data.datasets[0].data = [];
            tokenChart.data.datasets[1].data = [];
            tokenChart.data.datasets[2].data = [];
            tokenChart.update();
            promptTokensSpan.innerText = '0';
            completionTokensSpan.innerText = '0';
            totalTokensSpan.innerText = '0';
        }
    });

    // Handle form submission
    chatForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const userMessage = userInput.value.trim();
        if (!userMessage) return;

        addMessage("user", userMessage);
        savePrompt(userMessage);

        userInput.value = "";
        sendBtn.disabled = true;
        sendBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        stopBtn.disabled = false;

        const aiMessageElement = addMessage("ai", "", true);

        const selectedModelType = modelSelect.value;

        abortController = new AbortController();
        const signal = abortController.signal;

        try {
            const res = await fetch("/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMessage, model_type: selectedModelType }),
                signal: signal
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ response: "An unknown server error occurred." }));
                throw new Error(errorData.response || `HTTP error! status: ${res.status}`);
            }

            const data = await res.json();
            const aiResponse = data.response;

            currentPromptTokens = data.prompt_tokens || 0;
            currentCompletionTokens = data.completion_tokens || 0;
            currentTotalTokens = data.total_tokens || 0;
            updateTokenDisplayAndChart({
                prompt: currentPromptTokens,
                completion: currentCompletionTokens,
                total: currentTotalTokens
            });

            await typeMessage(aiMessageElement, aiResponse);

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Fetch aborted by user.');
                aiMessageElement.innerText = `AI response stopped by user.`;
            } else {
                console.error("Error:", error);
                aiMessageElement.innerText = `Error: Could not get a response. ${error.message}`;
            }
            aiMessageElement.classList.remove("typing-effect");
        } finally {
            sendBtn.disabled = false;
            sendBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');
            stopBtn.disabled = true;
            chatContainer.scrollTop = chatContainer.scrollHeight;
            abortController = null;
        }
    });

    // --- Stop Button Functionality ---
    stopBtn.addEventListener("click", () => {
        if (abortController) {
            abortController.abort();
            stopBtn.disabled = true;
            stopBtn.innerText = "Stopping...";
        }
    });

    // --- Model Selection Change Listener ---
    modelSelect.addEventListener("change", () => {
        const newModelDisplayName = getModelDisplayName();
        addSystemMessage(`Model changed to ${newModelDisplayName}.`);
    });

    // Initial load of previous prompts, token display, and chart initialization
    loadPreviousPrompts();
    initializeTokenChart();
    // Initialize with 0s for tokens
    updateTokenDisplayAndChart({ prompt: 0, completion: 0, total: 0 }); 

    window.addEventListener('resize', setInitialLayout);
    setInitialLayout();
    checkOllamaStatus();

    // Set initial welcome message based on default selected model
    // This will appear as the first "system" message in the chat.
    addSystemMessage(`Welcome! Chatting with ${getModelDisplayName()}. This is Prompt 0.`);
});