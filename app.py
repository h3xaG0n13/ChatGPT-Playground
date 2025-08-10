from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import os
import google.generativeai as genai # For Gemini
from openai import OpenAI # For OpenAI and Groq (using OpenAI client structure)

app = Flask(__name__)

# Load environment variables from .env file
load_dotenv()

# --- Configure LLM Clients ---

# Google Gemini Client
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)
else:
    print("Warning: GOOGLE_API_KEY not found. Gemini API calls may fail.")

# OpenAI Client (for GPT models)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
client_openai = None
if OPENAI_API_KEY:
    client_openai = OpenAI(api_key=OPENAI_API_KEY)
else:
    print("Warning: OPENAI_API_KEY not found. OpenAI GPT calls may fail.")

# Groq Client (using OpenAI client structure with Groq's base URL)
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client_groq = None
if GROQ_API_KEY:
    client_groq = OpenAI(
        api_key=GROQ_API_KEY,
        base_url="https://api.groq.com/openai/v1"
    )
else:
    print("Warning: GROQ_API_KEY not found. Groq calls may fail.")


# Ollama Client (for local models like Llama3)
# Assumes Ollama server is running locally at http://localhost:11434
client_ollama = OpenAI(
    api_key="ollama", # dummy value; Ollama doesn’t require a real API key
    base_url="http://localhost:11434/v1"
)

@app.route("/")
def index():
    """
    Renders the main index.html template for the chat application.
    """
    return render_template("index.html")

@app.route("/ask", methods=["POST"])
def ask():
    """
    Handles POST requests for chatbot queries, selecting the LLM based on user choice.
    """
    data = request.get_json()
    user_message = data.get("message", "")
    selected_model_type = data.get("model_type", "llama3") # Default to llama3

    # Initialize token counts
    prompt_tokens = 0
    completion_tokens = 0
    total_tokens = 0
    reply = ""

    try:
        if selected_model_type == "gemini-flash":
            if not GOOGLE_API_KEY:
                reply = "Error: Google API Key not configured for Gemini-Flash."
            else:
                model = genai.GenerativeModel('gemini-2.5-flash-preview-05-20')
                
                # Fetch the response
                response = model.generate_content(user_message)
                if response.candidates:
                    reply = response.candidates[0].content.parts[0].text
                    
                    # Count tokens for the prompt and response separately
                    prompt_token_count = model.count_tokens(user_message)
                    completion_token_count = model.count_tokens(reply)
                    
                    # Update the token variables
                    prompt_tokens = prompt_token_count.total_tokens
                    completion_tokens = completion_token_count.total_tokens
                    total_tokens = prompt_tokens + completion_tokens
                else:
                    reply = "No response from Gemini model."

        elif selected_model_type == "groq":
            if not client_groq:
                reply = "Error: Groq API Key not configured."
            else:
                # Using llama3-8b-8192 for Groq as it's a common choice
                response = client_groq.chat.completions.create(
                    model="llama3-8b-8192",
                    messages=[{"role": "user", "content": user_message}]
                )
                reply = response.choices[0].message.content
                if response.usage:
                    prompt_tokens = response.usage.prompt_tokens
                    completion_tokens = response.usage.completion_tokens
                    total_tokens = response.usage.total_tokens

        elif selected_model_type == "openai":
            if not client_openai:
                reply = "Error: OpenAI API Key not configured."
            else:
                # Using gpt-4o-mini for OpenAI as an example
                response = client_openai.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": user_message}]
                )
                reply = response.choices[0].message.content
                if response.usage:
                    prompt_tokens = response.usage.prompt_tokens
                    completion_tokens = response.usage.completion_tokens
                    total_tokens = response.usage.total_tokens

        else: # Default to "llama3" (Ollama)
            response = client_ollama.chat.completions.create(
                model="phi3", # Using phi3 as per original app.py for Ollama
                messages=[{"role": "user", "content": user_message}]
            )
            reply = response.choices[0].message.content
            # Ollama via OpenAI client usually doesn't provide usage directly in response.
            # Token counts will remain 0.


    except Exception as e:
        reply = f"Error processing request for {selected_model_type}: {str(e)}"
        print(f"An error occurred for {selected_model_type}: {e}")

    return jsonify({
        "response": reply,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens
    })

if __name__ == "__main__":
    app.run(debug=True)