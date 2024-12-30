import os
import subprocess
from typing import Optional, List, Dict
import sys
import time

class GitHubHelper:
    def __init__(self):
        self.current_branch = ""
        self.is_git_repo = self._check_git_repo()
        
    def _check_git_repo(self) -> bool:
        """檢查當前目錄是否為 Git 倉庫"""
        try:
            subprocess.run(['git', 'rev-parse', '--is-inside-work-tree'], 
                         capture_output=True, text=True, check=True)
            return True
        except subprocess.CalledProcessError:
            return False
            
    def _run_command(self, command: List[str]) -> tuple[bool, str]:
        """執行 Git 命令並返回結果"""
        try:
            # 設置環境變量以處理中文
            my_env = os.environ.copy()
            my_env["PYTHONIOENCODING"] = "utf-8"
            my_env["LANG"] = "zh_TW.UTF-8"
            
            # 使用 utf-8 編碼執行命令
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                env=my_env,
                check=True
            )
            return True, result.stdout
        except subprocess.CalledProcessError as e:
            return False, e.stderr if e.stderr else str(e)
            
    def _get_current_branch(self) -> str:
        """獲取當前分支名稱"""
        success, output = self._run_command(['git', 'branch', '--show-current'])
        return output.strip() if success else ""

    def init_repository(self):
        """初始化 Git 倉庫"""
        if not self.is_git_repo:
            success, output = self._run_command(['git', 'init'])
            if success:
                print("✅ Git 倉庫初始化成功")
                self.is_git_repo = True
            else:
                print(f"❌ Git 倉庫初始化失敗：{output}")
        else:
            print("⚠️ 當前目錄已經是 Git 倉庫")

    def check_status(self):
        """檢查倉庫狀態"""
        if not self.is_git_repo:
            print("❌ 當前目錄不是 Git 倉庫")
            return
            
        success, output = self._run_command(['git', 'status'])
        if success:
            print("\n=== Git 狀態 ===")
            print(output)
        else:
            print(f"❌ 獲取狀態失敗：{output}")

    def add_files(self, files: Optional[List[str]] = None):
        """添加文件到暫存區"""
        if not self.is_git_repo:
            print("❌ 當前目錄不是 Git 倉庫")
            return
            
        command = ['git', 'add']
        if files:
            command.extend(files)
        else:
            command.append('.')
            
        success, output = self._run_command(command)
        if success:
            print("✅ 文件添加成功")
        else:
            print(f"❌ 文件添加失敗：{output}")

    def commit_changes(self, message: str, description: str = None):
        """提交更改，支援兩段式提交信息"""
        if not self.is_git_repo:
            print("❌ 當前目錄不是 Git 倉庫")
            return
            
        command = ['git', 'commit', '-m', message]
        if description:
            command.extend(['-m', description])
            
        success, output = self._run_command(command)
        if success:
            print("✅ 更改提交成功")
            print(output)
        else:
            print(f"❌ 提交失敗：{output}")

    def push_changes(self, branch: Optional[str] = None):
        """推送更改到遠端"""
        if not self.is_git_repo:
            print("❌ 當前目錄不是 Git 倉庫")
            return
            
        if not branch:
            branch = self._get_current_branch()
            
        success, output = self._run_command(['git', 'push', 'origin', branch])
        if success:
            print(f"✅ 更改已推送到 {branch} 分支")
        else:
            print(f"❌ 推送失敗：{output}")

    def create_branch(self, branch_name: str):
        """創建新分支"""
        if not self.is_git_repo:
            print("❌ 當前目錄不是 Git 倉庫")
            return
            
        success, output = self._run_command(['git', 'checkout', '-b', branch_name])
        if success:
            print(f"✅ 分支 {branch_name} 創建成功")
            self.current_branch = branch_name
        else:
            print(f"❌ 分支創建失敗：{output}")

    def switch_branch(self, branch_name: str):
        """切換分支"""
        if not self.is_git_repo:
            print("❌ 當前目錄不是 Git 倉庫")
            return
            
        success, output = self._run_command(['git', 'checkout', branch_name])
        if success:
            print(f"✅ 已切換到分支 {branch_name}")
            self.current_branch = branch_name
        else:
            print(f"❌ 分支切換失敗：{output}")

    def pull_changes(self):
        """拉取遠端更改"""
        if not self.is_git_repo:
            print("❌ 當前目錄不是 Git 倉庫")
            return
            
        success, output = self._run_command(['git', 'pull'])
        if success:
            print("✅ 遠端更改拉取成功")
        else:
            print(f"❌ 拉取失敗：{output}")

    def show_commit_history(self, num_commits: int = 5):
        """顯示提交歷史"""
        if not self.is_git_repo:
            print("❌ 當前目錄不是 Git 倉庫")
            return
            
        success, output = self._run_command(['git', 'log', f'-{num_commits}', '--oneline'])
        if success:
            print("\n=== 最近的提交 ===")
            print(output)
        else:
            print(f"❌ 獲取提交歷史失敗：{output}")

    def interactive_menu(self):
        """互動式選單"""
        while True:
            print("\n=== GitHub 操作助手 ===")
            print("1. 初始化 Git 倉庫")
            print("2. 檢查倉庫狀態")
            print("3. 添加文件")
            print("4. 提交更改")
            print("5. 推送更改")
            print("6. 創建新分支")
            print("7. 切換分支")
            print("8. 拉取更改")
            print("9. 查看提交歷史")
            print("0. 退出")
            
            choice = input("\n請選擇操作 (0-9): ")
            
            if choice == "0":
                print("感謝使用！再見！")
                break
                
            elif choice == "1":
                self.init_repository()
                
            elif choice == "2":
                self.check_status()
                
            elif choice == "3":
                files_input = input("請輸入要添加的文件（多個文件用空格分隔，直接按 Enter 添加所有文件）：")
                files = files_input.split() if files_input.strip() else None
                self.add_files(files)
                
            elif choice == "4":
                print("\n=== 提交信息格式說明 ===")
                print("第一行格式：[類別]主要改動")
                print("第二行格式：1.詳細說明1 2.詳細說明2 ...")
                print("例如：")
                print("[工具]新增GitHub助手")
                print("1.新增互動式工具 2.支援基礎操作 3.完整中文化\n")
                
                message = input("請輸入第一行提交信息：")
                if message.strip():
                    description = input("請輸入第二行提交信息（可選）：")
                    self.commit_changes(message, description if description.strip() else None)
                else:
                    print("❌ 提交信息不能為空")
                    
            elif choice == "5":
                branch = input("請輸入要推送的分支（直接按 Enter 使用當前分支）：")
                self.push_changes(branch if branch.strip() else None)
                
            elif choice == "6":
                branch_name = input("請輸入新分支名稱：")
                if branch_name.strip():
                    self.create_branch(branch_name)
                else:
                    print("❌ 分支名稱不能為空")
                    
            elif choice == "7":
                branch_name = input("請輸入要切換的分支名稱：")
                if branch_name.strip():
                    self.switch_branch(branch_name)
                else:
                    print("❌ 分支名稱不能為空")
                    
            elif choice == "8":
                self.pull_changes()
                
            elif choice == "9":
                try:
                    num = int(input("請輸入要顯示的提交數量（默認 5）：") or "5")
                    self.show_commit_history(num)
                except ValueError:
                    print("❌ 請輸入有效的數字")
            
            else:
                print("❌ 無效的選擇，請重試")
            
            time.sleep(1)  # 暫停一秒，方便閱讀輸出

def main():
    helper = GitHubHelper()
    helper.interactive_menu()

if __name__ == "__main__":
    main() 