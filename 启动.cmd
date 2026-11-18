@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动本地服务器：http://localhost:8080/
echo 关闭此窗口即可停止。
start "" "http://localhost:8080/"
python -m http.server 8080 2>nul || py -m http.server 8080 2>nul || (
  echo 未找到 Python，将直接用浏览器打开 index.html。
  start "" "%~dp0index.html"
  pause
)
