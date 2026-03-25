import os
import time
import json
import pyautogui
from datetime import datetime
import tkinter as tk
from tkinter import ttk, messagebox

pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.05

BASE_DIR = os.path.join(os.path.expanduser("~"), "Desktop", "depo")
CONFIG_FILE = os.path.join(BASE_DIR, "withdraw_config.json")
WITHDRAW_PENDING_FILE = os.path.join(BASE_DIR, "withdraw_pending.txt")
WITHDRAW_COMPLETED_FILE = os.path.join(BASE_DIR, "withdraw_completed.txt")
LOG_FILE = os.path.join(BASE_DIR, "withdraw_bot_log.txt")

class SetupApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Withdraw Bot Setup")
        self.root.geometry("750x550")
        
        self.config = self.load_config()
        self.setup_ui()
    
    def load_config(self):
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        return {
            "click_button": None,
            "drop_button": None,
            "text_field": None,
            "ok_button": None,
            "wl_button": None,
            "dl_button": None,
            "bgl_button": None,
        }
    
    def save_config(self):
        with open(CONFIG_FILE, "w") as f:
            json.dump(self.config, f, indent=2)
    
    def setup_ui(self):
        main_frame = ttk.Frame(self.root, padding="15")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        title = tk.Label(main_frame, text="WITHDRAW BOT SETUP", font=("Arial", 22, "bold"), fg="#ff2d95")
        title.pack(pady=10)
        
        tk.Label(main_frame, text="Set button locations, then START BOT", font=("Arial", 11)).pack()
        
        ttk.Separator(main_frame).pack(fill='x', pady=15)
        
        tk.Label(main_frame, text="MACRO BUTTONS", font=("Arial", 14, "bold")).pack()
        
        macro_frame = ttk.Frame(main_frame)
        macro_frame.pack(pady=10, fill=tk.X)
        
        self.macro_labels = {}
        for name, label in [("click_button", "CLICK"), ("drop_button", "DROP"), ("text_field", "TEXT FIELD"), ("ok_button", "OK")]:
            frame = tk.Frame(macro_frame, relief=tk.RAISED, borderwidth=3, bg="#2a2a3a")
            frame.pack(side=tk.LEFT, padx=8, pady=5, fill=tk.BOTH, expand=True)
            
            tk.Label(frame, text=label, font=("Arial", 12, "bold"), bg="#2a2a3a", fg="white").pack(pady=5)
            self.macro_labels[f"{name}_status"] = tk.Label(frame, text="NOT SET", fg="red", bg="#2a2a3a", font=("Arial", 10, "bold"), width=12)
            self.macro_labels[f"{name}_status"].pack(pady=5)
            tk.Button(frame, text="SET", bg="#4a4a6a", fg="white", font=("Arial", 10, "bold"),
                     command=lambda n=name: self.set_button(n)).pack(pady=8, ipadx=10)
        
        ttk.Separator(main_frame).pack(fill='x', pady=15)
        
        tk.Label(main_frame, text="ITEM BUTTONS", font=("Arial", 14, "bold")).pack()
        
        items_frame = ttk.Frame(main_frame)
        items_frame.pack(pady=10, fill=tk.X)
        
        self.item_labels = {}
        for name, label in [("wl_button", "WL"), ("dl_button", "DL"), ("bgl_button", "BGL")]:
            frame = tk.Frame(items_frame, relief=tk.RAISED, borderwidth=3, bg="#2a2a3a")
            frame.pack(side=tk.LEFT, padx=15, pady=5, fill=tk.BOTH, expand=True)
            
            tk.Label(frame, text=label, font=("Arial", 14, "bold"), bg="#2a2a3a", fg="#ffd700").pack(pady=5)
            self.item_labels[f"{name}_status"] = tk.Label(frame, text="NOT SET", fg="red", bg="#2a2a3a", font=("Arial", 10, "bold"), width=12)
            self.item_labels[f"{name}_status"].pack(pady=5)
            tk.Button(frame, text="SET LOCATION", bg="#4a4a6a", fg="white", font=("Arial", 10, "bold"),
                     command=lambda n=name: self.set_button(n)).pack(pady=8, ipadx=10)
        
        ttk.Separator(main_frame).pack(fill='x', pady=15)
        
        btn_frame = ttk.Frame(main_frame)
        btn_frame.pack(pady=15)
        
        self.start_btn = tk.Button(btn_frame, text="START BOT", bg="#00cc00", fg="white", font=("Arial", 18, "bold"),
                 command=self.start_bot, width=20, height=2, relief=tk.RAISED, borderwidth=5)
        self.start_btn.pack(side=tk.LEFT, padx=15)
        
        tk.Button(btn_frame, text="SAVE CONFIG", bg="orange", fg="white", font=("Arial", 12),
                 command=self.save_config, width=12).pack(side=tk.LEFT, padx=5)
        
        self.status_label = tk.Label(main_frame, text="", font=("Arial", 11), fg="cyan")
        self.status_label.pack(pady=5)
        
        self.update_status()
    
    def update_status(self):
        required = ["click_button", "drop_button", "text_field", "ok_button"]
        all_required_set = all(self.config.get(r) for r in required)
        
        for name in ["click_button", "drop_button", "text_field", "ok_button"]:
            widget = self.macro_labels.get(f"{name}_status")
            if widget:
                if self.config.get(name):
                    x, y = self.config[name]
                    widget.config(text=f"({x}, {y})", fg="#00ff00", bg="#1a3a1a")
                else:
                    widget.config(text="NOT SET", fg="red", bg="#2a2a3a")
        
        for name in ["wl_button", "dl_button", "bgl_button"]:
            widget = self.item_labels.get(f"{name}_status")
            if widget:
                if self.config.get(name):
                    x, y = self.config[name]
                    widget.config(text=f"({x}, {y})", fg="#00ff00", bg="#1a3a1a")
                else:
                    widget.config(text="NOT SET", fg="red", bg="#2a2a3a")
        
        if all_required_set:
            self.start_btn.config(bg="#00cc00", state="normal")
            self.status_label.config(text="All required buttons set! Click START BOT", fg="#00ff00")
        else:
            missing = [r.replace('_', ' ').upper() for r in required if not self.config.get(r)]
            self.status_label.config(text=f"Missing: {', '.join(missing)}", fg="orange")
    
    def set_button(self, name):
        label = name.replace('_', ' ').upper()
        
        popup = tk.Toplevel(self.root)
        popup.title("Set " + label)
        popup.geometry("400x200")
        popup.transient(self.root)
        popup.grab_set()
        popup.configure(bg="#1a1a2a")
        
        tk.Label(popup, text=f"MOVE MOUSE TO", font=("Arial", 16, "bold"), bg="#1a1a2a", fg="white").pack(pady=15)
        tk.Label(popup, text=label, font=("Arial", 24, "bold"), bg="#1a1a2a", fg="#ffd700").pack()
        tk.Label(popup, text="", bg="#1a1a2a").pack()
        tk.Label(popup, text="Press SPACE to capture position", font=("Arial", 12), bg="#1a1a2a", fg="cyan").pack()
        
        def on_key(e):
            if e.keysym == 'space':
                x, y = pyautogui.position()
                self.config[name] = (x, y)
                self.save_config()
                self.update_status()
                popup.destroy()
                messagebox.showinfo("SAVED", f"{label} set to ({x}, {y})")
        
        popup.bind('<Key>', on_key)
        popup.focus_set()
        
        tk.Button(popup, text="CANCEL", bg="red", fg="white", font=("Arial", 11),
                  command=popup.destroy).pack(pady=15)
    
    def start_bot(self):
        required = ["click_button", "drop_button", "text_field", "ok_button"]
        missing = [r for r in required if not self.config.get(r)]
        
        if missing:
            messagebox.showwarning("Missing", f"Set these buttons first:\n" + "\n".join(missing))
            return
        
        self.save_config()
        self.root.destroy()
        
        bot = WithdrawBot(self.config)
        bot.run()

class WithdrawBot:
    def __init__(self, config):
        self.config = config
        self.processed = set()
        self.running = True
        self.log("Withdraw Bot Started")
    
    def log(self, msg):
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"[{ts}] {msg}")
        with open(LOG_FILE, "a") as f:
            f.write(f"[{ts}] {msg}\n")
    
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
            time.sleep(0.2)
            return True
        return False
    
    def wait_for_player(self, player, timeout=120):
        self.log(f"Waiting for {player} to join world...")
        start = time.time()
        while time.time() - start < timeout:
            ready_file = os.path.join(BASE_DIR, f"player_{player}.ready")
            if os.path.exists(ready_file):
                os.remove(ready_file)
                self.log(f"Player {player} joined!")
                time.sleep(1)
                return True
            time.sleep(0.3)
        self.log(f"Timeout waiting for {player}")
        return False
    
    def get_item_type(self, amount):
        if amount > 10000:
            return "BGL"
        elif amount > 100:
            return "DL"
        return "WL"
    
    def process_withdrawal(self, amount, wid, player):
        self.log(f"=== Processing {amount} WL for {player} ===")
        
        # Wait for player to join first
        if not self.wait_for_player(player):
            self.log(f"Player {player} did not join in time")
            return False
        
        # Calculate how many of each item to drop
        # 1 BGL = 100 DL = 10000 WL
        # 1 DL = 100 WL
        
        total_dl = amount / 100
        
        bgl_count = int(total_dl // 100)
        remainder_dl = int(total_dl % 100)
        wl_remainder = amount % 100
        
        dl_count = remainder_dl
        
        self.log(f"Need: {bgl_count} BGL, {dl_count} DL, {wl_remainder} WL")
        
        # Drop BGLs (all at once if needed)
        if bgl_count > 0:
            btn_name = "bgl_button"
            if not self.config.get(btn_name):
                self.log("Warning: BGL button not set!")
            else:
                self.log(f"Dropping {bgl_count} BGL")
                x, y = self.config[btn_name]
                pyautogui.click(x, y)
                time.sleep(0.2)
                self.click_btn("drop_button")
                self.click_btn("text_field")
                pyautogui.press('backspace')
                time.sleep(0.01)
                pyautogui.press('backspace')
                time.sleep(0.01)
                pyautogui.press('backspace')
                time.sleep(0.01)
                pyautogui.typewrite(str(bgl_count), interval=0.1)
                time.sleep(0.01)
                self.click_btn("ok_button")
        
        # Drop DLs (all at once if needed)
        if dl_count > 0:
            btn_name = "dl_button"
            if not self.config.get(btn_name):
                self.log("Warning: DL button not set!")
            else:
                self.log(f"Dropping {dl_count} DL")
                x, y = self.config[btn_name]
                pyautogui.click(x, y)
                time.sleep(0.2)
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
        
        # Drop WLs
        if wl_remainder > 0:
            btn_name = "wl_button"
            if not self.config.get(btn_name):
                self.log("Warning: WL button not set!")
            else:
                self.log(f"Dropping {wl_remainder} WL")
                x, y = self.config[btn_name]
                pyautogui.click(x, y)
                time.sleep(0.2)
                self.click_btn("drop_button")
                self.click_btn("text_field")
                pyautogui.press('backspace')
                time.sleep(0.01)
                pyautogui.press('backspace')
                time.sleep(0.01)
                pyautogui.press('backspace')
                time.sleep(0.01)
                pyautogui.typewrite(str(wl_remainder), interval=0.1)
                time.sleep(0.01)
                self.click_btn("ok_button")
        
        self.log("=== Drop complete ===")
        
        self.mark_completed(wid)
        self.log(f"=== Done - {wid} ===")
        return True
    
    def run(self):
        self.log("=== Bot Running ===")
        self.log("Press Ctrl+C to stop")
        self.log("Waiting for players to join world before executing...")
        print("\n=== WITHDRAW BOT RUNNING ===")
        print("Waiting for players to join before dropping...\n")
        
        try:
            while self.running:
                try:
                    pending = self.get_pending()
                    for w in pending:
                        if w["id"] not in self.processed:
                            self.processed.add(w["id"])
                            self.process_withdrawal(w["amount"], w["id"], w["player"])
                    time.sleep(0.2)
                except Exception as e:
                    self.log(f"Error: {e}")
                    time.sleep(1)
        except KeyboardInterrupt:
            self.log("Bot stopped")

def main():
    root = tk.Tk()
    app = SetupApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()
