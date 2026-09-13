#!/usr/bin/env python3
"""
Creative Artist UI Agent Setup Script
Installs dependencies and configures the agent for creative workflows
"""

import subprocess
import sys
import os

def install_dependencies():
    """Install required Python packages for creative integrations"""
    packages = [
        "requests",           # API calls to design tools
        "Pillow",             # Image processing
        "numpy",              # Numerical computations
        "opencv-python",      # Computer vision for sketch recognition
        "matplotlib",         # Visualization
        "selenium",           # Browser automation for design tools
        "websockets",         # Real-time collaboration
    ]
    
    print("Installing creative artist dependencies...")
    for package in packages:
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", package])
            print(f"��✓ Installed {package}")
        except subprocess.CalledProcessError:
            print(f"��✗ Failed to install {package}")

def configure_toolsets():
    """Configure Hermes toolsets for creative work"""
    print("\nConfiguring Hermes toolsets...")
    # This would typically be done via hermes tools enable commands
    # For now, we'll document what needs to be enabled
    
    toolsets = [
        "web",           # For researching design trends
        "browser",       # For interacting with web-based design tools
        "terminal",      # For running creative software CLI tools
        "file",          # For managing design assets
        "vision",        # For analyzing sketches and mockups
        "image_gen",     # For generating design variations
    ]
    
    print("To enable these toolsets, run:")
    for ts in toolsets:
        print(f"  hermes tools enable {ts}")

def create_agent_config():
    """Create sample configuration for the creative artist agent"""
    config = """
# Creative Artist Agent Configuration
model:
  provider: openrouter
  default: anthropic/claude-sonnet-4
  temperature: 0.7

agent:
  max_turns: 120
  tool_use_enforcement: true

display:
  skin: creative-artist
  show_reasoning: true
  tool_progress: unicode

memory:
  memory_enabled: true
  user_profile_enabled: true
  provider: honcho

terminal:
  backend: local
  cwd: ~/creative-workspace
  timeout: 300

delegation:
  max_concurrent_children: 3
  max_spawn_depth: 2
"""
    
    with open("creative-artist-config.yaml", "w") as f:
        f.write(config)
    
    print("\n��✓ Created creative-artist-config.yaml")
    print("  To use: hermes -p creative-artist chat")

if __name__ == "__main__":
    print("=== Creative Artist UI Agent Setup ===\n")
    
    install_dependencies()
    configure_toolsets()
    create_agent_config()
    
    print("\n=== Setup Complete ===")
    print("Next steps:")
    print("1. Install: pip install -r requirements.txt")
    print("2. Configure API keys for design tools (Figma, Adobe)")
    print("3. Start agent: hermes -p creative-artist chat")
    print("4. Use slash commands: /design/board, /style/guide")