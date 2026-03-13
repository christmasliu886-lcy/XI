#!/bin/bash

# OpenClaw 备份与监控系统
# 功能：定时备份 + Gateway状态监控 + 崩溃自动恢复

# 配置
WORKSPACE="/root/.openclaw/workspace"
BACKUP_DIR="/root/.openclaw-backup"
KEEP_LOCAL=3
MAX_FAILURES=3

# 状态文件
FAIL_COUNT="/tmp/gateway_fail_count"

# 从环境变量获取Token
GITHUB_TOKEN="${GITHUB_TOKEN}"
TELEGRAM_TOKEN="8735180834:AAEFJSOuT7O3nCC_H5WnWDoSDz-UlBWgxJk"
TELEGRAM_CHAT="7315773508"

# 发送Telegram消息
send_telegram() {
    local message="$1"
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
        -d "chat_id=${TELEGRAM_CHAT}" \
        -d "text=${message}" \
        -d "parse_mode=HTML"
}

# 检查Gateway状态
check_gateway() {
    # 方法1: 检查进程
    if pgrep -f "openclaw gateway" > /dev/null 2>&1; then
        return 0
    fi
    
    # 方法2: 检查HTTP响应
    if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18789/ | grep -q "200\|302"; then
        return 0
    fi
    
    return 1
}

# 本地备份
local_backup() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_path="${BACKUP_DIR}/${timestamp}"
    
    # 创建备份目录
    mkdir -p "${backup_path}"
    
    # 复制文件（排除.git）
    rsync -a --exclude='.git' "${WORKSPACE}/" "${backup_path}/"
    
    # 保留最新KEEP_LOCAL份
    cd "${BACKUP_DIR}" || exit 1
    ls -t | tail -n +$((KEEP_LOCAL + 1)) | xargs -r rm -rf
    
    echo "本地备份完成: ${backup_path}"
}

# GitHub备份
github_backup() {
    cd "${WORKSPACE}" || exit 1
    
    # 添加所有文件
    git add -A
    
    # 检查是否有变化
    if git diff --staged --quiet; then
        echo "没有变化，跳过GitHub备份"
        return 0
    fi
    
    # 提交
    local timestamp=$(date +"%Y-%m-%d %H:%M")
    git commit -m "Backup ${timestamp}"
    
    # 推送（使用环境变量中的Token）
    git remote set-url origin "https://${GITHUB_TOKEN}@github.com/christmasliu886-lcy/XI.git"
    git push origin master
    
    echo "GitHub备份完成"
}

# 恢复Gateway（使用systemd，不依赖openclaw命令）
restore_gateway() {
    send_telegram "⚠️ 检测到Gateway崩溃，准备恢复..."
    
    # 先尝试本地恢复
    local latest_backup=$(ls -t "${BACKUP_DIR}" | head -1)
    if [ -n "${latest_backup}" ] && [ -d "${BACKUP_DIR}/${latest_backup}" ]; then
        send_telegram "🔄 尝试从本地备份恢复..."
        rm -rf "${WORKSPACE}"
        cp -r "${BACKUP_DIR}/${latest_backup}" "${WORKSPACE}/"
        if [ $? -eq 0 ]; then
            send_telegram "✅ 本地备份恢复成功，重启Gateway..."
            # 使用systemctl重启（不依赖openclaw命令）
            systemctl --user restart openclaw-gateway
            sleep 10
            if check_gateway; then
                send_telegram "✅ Gateway已重启成功！"
                return 0
            fi
        fi
    fi
    
    # 本地失败，尝试GitHub
    send_telegram "🔄 本地备份恢复失败，尝试从GitHub恢复..."
    cd "${WORKSPACE}" || exit 1
    git fetch origin
    git reset --hard origin/master
    systemctl --user restart openclaw-gateway
    sleep 10
    
    if check_gateway; then
        send_telegram "✅ GitHub备份恢复成功，Gateway已重启！"
        return 0
    fi
    
    # 都失败
    send_telegram "❌ 恢复失败，请人工检查！"
    return 1
}

# 主逻辑
main() {
    local action="$1"
    
    case "$action" in
        "check")
            # 检查Gateway状态
            if check_gateway; then
                echo "Gateway运行正常"
                echo "0" > "${FAIL_COUNT}"
            else
                # 记录失败次数
                local count=$(cat "${FAIL_COUNT}" 2>/dev/null || echo "0")
                count=$((count + 1))
                echo "$count" > "${FAIL_COUNT}"
                echo "Gateway检测失败，第${count}次"
                
                if [ "$count" -ge "$MAX_FAILURES" ]; then
                    restore_gateway
                    echo "0" > "${FAIL_COUNT}"
                fi
            fi
            ;;
        "backup")
            # 本地备份
            local_backup
            # GitHub备份
            github_backup
            send_telegram "✅ 备份完成"
            ;;
        *)
            echo "用法: $0 {check|backup}"
            ;;
    esac
}

main "$@"
