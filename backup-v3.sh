#!/bin/bash
# OpenClaw 备份脚本 v3.0
# 结合官方备份 + GitHub 同步 + 飞书通知

set -e

# 切换到 Node 22
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && nvm use 22 >/dev/null 2>&1

BACKUP_DIR="$HOME/openclaw-backups"
KEEP_COUNT=3  # 最多保留 3 份，超出后循环覆盖
GITHUB_REPO="christmasliu886-lcy/XI"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"  # 从环境变量读取
WORKSPACE="$HOME/.openclaw/workspace"
FEISHU_TARGET="chat:oc_0e6743f60110713cccf501212dc9ba3f"

# 飞书通知（发送到群，用 OPS 账号）
send_feishu() {
  local message="$1"
  openclaw message send \
    --channel feishu \
    --account ops \
    --target "$FEISHU_TARGET" \
    --message "$message" 2>/dev/null
}

# 获取磁盘剩余空间 (GB)
get_disk_free() {
  df -BG "$HOME" | awk 'NR==2 {print $4}' | sed 's/G//'
}

# 格式化文件大小
format_size() {
  local size=$1
  if [ $size -gt 1024 ]; then
    echo "$(echo "scale=1; $size/1024" | bc) GB"
  else
    echo "${size} MB"
  fi
}

# 主备份流程
main() {
  local start_time=$(date +%s)
  local timestamp=$(date +"%Y-%m-%d %H:%M:%S")
  local date_str=$(date +%Y-%m-%d)
  
  echo "========== 备份开始: $timestamp =========="
  
  # 1. 创建备份目录
  mkdir -p "$BACKUP_DIR"
  
  # 2. 官方全量备份（带验证）
  echo "[1/3] 执行官方备份..."
  cd "$HOME"
  backup_file="$BACKUP_DIR/openclaw-backup-$(date +%Y-%m-%d_%H%M%S).tar.gz"
  
  if openclaw backup create --verify --output "$backup_file" 2>&1; then
    echo "官方备份成功"
  else
    local disk_free=$(get_disk_free)
    send_feishu "🔴 备份失败

📅 时间: $timestamp
❌ 错误: openclaw backup 命令执行失败
💿 磁盘剩余: ${disk_free} GB
🔧 建议: 检查磁盘空间或 OpenClaw 配置"
    echo "官方备份失败"
    exit 1
  fi
  
  # 获取备份文件信息
  if [ -f "$backup_file" ]; then
    backup_size=$(stat -c%s "$backup_file")
    backup_size_human=$(format_size $((backup_size / 1024 / 1024)))
  else
    backup_size_human="未知"
  fi
  
  # 3. 清理旧备份（只保留最新的 3 份）
  echo "[3/4] 清理旧备份..."
  cd "$BACKUP_DIR" || exit 1
  backup_count=$(ls -1 openclaw-backup-*.tar.gz 2>/dev/null | wc -l)
  if [ $backup_count -gt $KEEP_COUNT ]; then
    delete_count=$((backup_count - KEEP_COUNT))
    ls -1t openclaw-backup-*.tar.gz | tail -n $delete_count | xargs -r rm -f
    echo "已清理 $delete_count 份旧备份"
  fi
  
  # 4. GitHub 同步
  echo "[2/4] GitHub 同步..."
  cd "$WORKSPACE" || exit 1
  
  # 配置 git
  git config user.name "OpenClaw Bot"
  git config user.email "bot@openclaw.local"
  git remote set-url origin "https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}" 2>/dev/null
  
  # 添加所有更改
  git add -A
  
  # 检查是否有变化
  if git diff --staged --quiet; then
    echo "没有变化，跳过 GitHub 同步"
    github_status="⏭️ 无变化"
  else
    if git commit -m "Backup $(date +'%Y-%m-%d %H:%M')" 2>/dev/null && \
       git push origin master -q 2>/dev/null; then
      echo "GitHub 同步成功"
      github_status="✅ 已同步"
    else
      echo "GitHub 同步失败"
      github_status="❌ 同步失败"
    fi
  fi
  
  # 4. 计算耗时
  local end_time=$(date +%s)
  local duration=$((end_time - start_time))
  local duration_str=""
  
  if [ $duration -lt 60 ]; then
    duration_str="${duration} 秒"
  else
    duration_str="$((duration / 60)) 分 $((duration % 60)) 秒"
  fi
  
  # 5. 获取磁盘信息
  local disk_free=$(get_disk_free)
  
  # 6. 发送成功通知
  echo "[4/4] 发送通知..."
  
  send_feishu "🟢 备份成功

📅 时间: $timestamp
📦 备份文件: $(basename $backup_file)
💾 文件大小: $backup_size_human
⏱️ 耗时: $duration_str
✅ 验证: 通过
💿 磁盘剩余: ${disk_free} GB
🔗 GitHub: $github_status

📊 备份已保存至: $backup_file"
  
  echo "========== 备份完成 =========="
}

# 执行
main
