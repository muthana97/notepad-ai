import os

def bundle_prompt():
    # Define the file paths
    # Update these if your main.rs is in a different subdirectory (e.g., 'src-tauri/src/main.rs')
    main_rs_path = 'src-tauri/src/main.rs' 
    app_tsx_path = 'src/app.tsx'

    # Get user input for the task
    task_input = input("Enter the TASK for the AI: ")

    try:
        # Read main.rs
        with open(main_rs_path, 'r') as f:
            main_rs_content = f.read()

        # Read app.tsx
        with open(app_tsx_path, 'r') as f:
            app_tsx_content = f.read()

        # Construct the template
        prompt = f"""TASK: '{task_input}' please make necessary changes to the codes main.rs and app.tsx to perform the task only.
RULE: "DO NOT make changes other than those I have proposed. if you have concerns feel free to raise them."
CONTEXT: 
"This is a notepad project built on typescript and Rust I will share the main files below:
main.rs:
{main_rs_content}

/Users/muthana/Documents/Projects/notepad-ai/src/app.tsx:
{app_tsx_content}"
"""

        # Output the result
        print("\n" + "="*20 + " GENERATED PROMPT " + "="*20 + "\n")
        print(prompt)
        
        # Optional: Copy to clipboard (requires pyperclip: pip install pyperclip)
        # import pyperclip
        # pyperclip.copy(prompt)
        # print("--- Prompt copied to clipboard! ---")

    except FileNotFoundError as e:
        print(f"Error: Could not find file {e.filename}. Please check your file paths in the script.")

if __name__ == "__main__":
    bundle_prompt()
