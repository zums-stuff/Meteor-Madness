import os, threading, webbrowser, time
from app1 import app

def open_browser(port=8000):
    time.sleep(1.5)
    webbrowser.open(f"http://127.0.0.1:{port}/")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    t = threading.Thread(target=open_browser, args=(port,), daemon=True)
    t.start()
    app.run(host="127.0.0.1", port=port)
