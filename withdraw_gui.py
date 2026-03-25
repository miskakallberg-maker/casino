import os
import time
import json
import pyautogui
from datetime import datetime
import tkinter as tk
from tkinter import scrolledtext, messagebox

pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.05

BASE_DIR = os.path.join(os.path.expanduser("~"), "Desktop", "depo")
CONFIG_FILE = os.path.join(BASE_DIR, "withdraw_config.json")
WITHDRAW_PENDING_FILE = os.path.join(BASE_DIR, "withdraw_pending.txt")
WITHDRAW_COMPLETED_FILE = os.path.join(BASE_DIR, "withdraw_completed.txt")

class WithdrawBotApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Withdraw Bot")
        self.root.geometry("600x500")
        self.root.configure(bg="#1a1a2a")
        
        self.config = self.load_config()
        self.running = False
        self.processed = set()
        
        self.setup_ui()
    
    def load_config(self):
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        return {}
    
    def setup_ui(self):
        title = tk.Label(self.root, text="WITHDRAW BOT", font=("Arial", 24, "bold"), 
                        bg="#1a1a2a", fg="#ff2d95")
        title.pack(pady=15)
        
        status_frame = tk.Frame(self.root, bg="#1a1a2a")
        status_frame.pack(fill=tk.X, padx=20)
        
        tk.Label(status_frame, text="Status:", font=("Arial", 12), 
                bg="#1a1a2a", fg="white").pack(side=tk.LEFT)
        
        self.status_label = tk.Label(status_frame, text="STOPPED", font=("Arial", 14, "bold"),
                                   bg="#1a1a2a", fg="#ff4444")
        self.status_label.pack(side=tk.LEFT, padx=10)
        
        self.pending_label = tk.Label(status_frame, text="Pending: 0", font=("Arial", 11),
                                    bg="#1a1a2a", fg="#ffd700")
        self.pending_label.pack(side=tk.RIGHT)
        
        btn_frame = tk.Frame(self.root, bg="#1a1a2a")
        btn_frame.pack(pady=15)
        
        self.start_btn = tk.Button(btn_frame, text="START", font=("Arial", 14, "bold"),
                                  bg="#00cc00", fg="white", width=12, height=2,
                                  command=self.start_bot)
        self.start_btn.pack(side=tk.LEFT, padx=10)
        
        self.stop_btn = tk.Button(btn_frame, text="STOP", font=("Arial", 14, "bold"),
                                 bg="#cc0000", fg="white", width=12, height=2,
                                 command=self.stop_bot, state=tk.DISABLED)
        self.stop_btn.pack(side=tk.LEFT, padx=10)
        
        log_frame = tk.LabelFrame(self.root, text="Bot Log", font=("Arial", 12, "bold"),
                                  bg="#2a2a3a", fg="#ffd700", padx=10, pady=5)
        log_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)
        
        self.log_text = scrolledtext.ScrolledText(log_frame, height=15, width=65,
                                                  bg="#1a1a2a", fg="#00ff00",
                                                  font=("Courier", 10))
        self.log_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.root.after(500, self.check_loop)
    
    def log(self, msg):
        ts = datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] {msg}\n"
        self.log_text.insert(tk.END, line)
        self.log_text.see(tk.END)
    
    def start_bot(self):
        self.running = True
        self.status_label.config(text="RUNNING", fg="#00ff00")
        self.start_btn.config(state=tk.DISABLED, bg="#666666")
        self.stop_btn.config(state=tk.NORMAL, bg="#cc0000")
        self.log("Bot started!")
    
    def stop_bot(self):
        self.running = False
        self.status_label.config(text="STOPPED", fg="#ff4444")
        self.start_btn.config(state=tk.NORMAL, bg="#00cc00")
        self.stop_btn.config(state=tk.DISABLED, bg="#666666")
        self.log("Bot stopped!")
    
    def check_loop(self):
        if self.running:
            self.process_withdrawals()
        
        if os.path.exists(WITHDRAW_PENDING_FILE):
            with open(WITHDRAW_PENDING_FILE, "r") as f:
                content = f.read()
            pending = len([l for l in content.strip().split("\n") if l.strip() and l.startswith("WITHDRAW|")])
            self.pending_label.config(text=f"Pending: {pending}")
        
        self.root.after(500, self.check_loop)
    
    def get_pending(self):
        if not os.path.exists(WITHDRAW_PENDING_FILE):
            return []
        with open(WITHDRAW_PENDING_FILE, "r") as f:
            content = f.read()
        lines = [l for l in content.strip().split("\n") if l.strip()]
        result = []
        for line in lines:
            parts = line.split("|")
            if len(parts) >= 4 and parts[0] == "WITHDRAW":
                result.append({
                    "player": parts[1],
                    "amount": int(parts[2]),
                    "id": parts[3]
                })
        return result
    
    def mark_completed(self, wid):
        with open(WITHDRAW_COMPLETED_FILE, "a") as f:
            f.write(f"COMPLETED|{wid}\n")
    
    def click_btn(self, name):
        if self.config.get(name):
            x, y = self.config[name]
            self.log(f"Clicking {name}...")
            pyautogui.click(x, y)
            time.sleep(0.5)
            return True
        return False
    
    def wait_for_player(self, player, timeout=120):
        self.log(f"Waiting for {player}...")
        start = time.time()
        while time.time() - start < timeout:
            ready_file = os.path.join(BASE_DIR, f"player_{player}.ready")
            if os.path.exists(ready_file):
                os.remove(ready_file)
                self.log(f"{player} joined!")
                time.sleep(1)
                return True
            time.sleep(0.3)
        self.log(f"Timeout waiting for {player}")
        return False
    
    def process_withdrawals(self):
        if not os.path.exists(WITHDRAW_PENDING_FILE):
            return
        
        with open(WITHDRAW_PENDING_FILE, "r") as f:
            content = f.read()
        
        lines = [l for l in content.strip().split("\n") if l.strip()]
        
        for line in lines:
            parts = line.split("|")
            if len(parts) >= 4 and parts[0] == "WITHDRAW":
                wid = parts[3]
                if wid not in self.processed:
                    self.processed.add(wid)
                    amount = int(parts[2])
                    player = parts[1]
                    self.process_withdrawal(amount, wid, player)
    
    def process_withdrawal(self, amount, wid, player):
        self.log(f"=== Processing {amount} WL for {player} ===")
        
        if not self.wait_for_player(player):
            self.log(f"Player did not join!")
            return
        
        # Starting delay
        self.log("Starting in 2 seconds...")
        time.sleep(2)
        
        total_dl = amount / 100
        bgl_count = int(total_dl // 100)
        dl_count = int(total_dl % 100)
        wl_count = amount % 100
        
        self.log(f"Dropping: {bgl_count} BGL, {dl_count} DL, {wl_count} WL")
        
        # Drop BGLs
        if bgl_count > 0:
            if not self.config.get("bgl_button"):
                self.log("Warning: BGL button not set!")
            else:
                self.log(f"Dropping {bgl_count} BGL...")
                # CLICK first
                self.click_btn("click_button")
                # Click BGL
                x, y = self.config["bgl_button"]
                pyautogui.click(x, y)
                time.sleep(0.5)
                # DROP
                self.click_btn("drop_button")
                # TEXT FIELD
                self.click_btn("text_field")
                # BACKSPACE x3
                pyautogui.press('backspace')
                time.sleep(0.01)
                pyautogui.press('backspace')
                time.sleep(0.01)
                pyautogui.press('backspace')
                time.sleep(0.01)
                # TYPE AMOUNT
                pyautogui.typewrite(str(bgl_count), interval=0.1)
                time.sleep(0.01)
                # OK
                self.click_btn("ok_button")
                # CLICK last
                self.click_btn("click_button")
        
        # Drop DLs
        if dl_count > 0:
            if not self.config.get("dl_button"):
                self.log("Warning: DL button not set!")
            else:
                self.log(f"Dropping {dl_count} DL...")
                self.click_btn("click_button")
                x, y = self.config["dl_button"]
                pyautogui.click(x, y)
                time.sleep(0.5)
                self.click_btn("drop_button")
                self.click_btn("text_field")
                pyautogui.press('backspace')
                time.sleep(0.01)
                pyautogui.press('backspace')
                time.sleep(0.01)
                pyautogui.press('backspace')
                time.sleep(0.01)
                pyautogui.typewrite(str(dl_count), interval=0.1)
                time.sleep(0.01)
                self.click_btn("ok_button")
                self.click_btn("click_button")
        
        # Drop WLs
        if wl_count > 0:
            if not self.config.get("wl_button"):
                self.log("Warning: WL button not set!")
            else:
                self.log(f"Dropping {wl_count} WL...")
                self.click_btn("click_button")
                x, y = self.config["wl_button"]
                pyautogui.click(x, y)
                time.sleep(0.5)
                self.click_btn("drop_button")
                self.click_btn("text_field")
                pyautogui.press('backspace')
                time.sleep(0.01)
                pyautogui.press('backspace')
                time.sleep(0.01)
                pyautogui.press('backspace')
                time.sleep(0.01)
                pyautogui.typewrite(str(wl_count), interval=0.1)
                time.sleep(0.01)
                self.click_btn("ok_button")
                self.click_btn("click_button")
        
        self.mark_completed(wid)
        self.log(f"=== Done! ===\n")
    
    def run(self):
        self.root.mainloop()

def main():
    app = WithdrawBotApp()
    app.run()

if __name__ == "__main__":
    main()
