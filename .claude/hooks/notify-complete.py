#!/usr/bin/env python3
"""
Notify when Claude Code task completes.
Sends a macOS notification with sound.
"""

import subprocess
import sys

def notify(title: str, message: str, sound: str = "Glass"):
    """Send macOS notification."""
    script = f'''
    display notification "{message}" with title "{title}" sound name "{sound}"
    '''
    subprocess.run(["osascript", "-e", script], capture_output=True)

def main():
    notify(
        "Claude Code",
        "Task complete - awaiting input",
        "Glass"
    )

if __name__ == "__main__":
    main()
