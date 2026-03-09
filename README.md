# 🐈‍⬛ xiaomo-starter-kit

> 你的 AI 私人助手，一键启动。基于 [OpenClaw](https://openclaw.ai)（原 Clawdbot），中文用户友好。

<p align="center">
  <img src="https://img.shields.io/badge/OpenClaw-100k%2B%20⭐-blueviolet" alt="OpenClaw Stars" />
  <img src="https://img.shields.io/badge/Language-中文-orange" alt="Chinese" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License" />
</p>

---

## ✨ 这是什么？

一个预配置好的 OpenClaw AI 助手模板，帮你跳过繁琐的初始化，**5 分钟拥有自己的 AI 私人助手**。

包含：
- 📜 **灵魂三件套**：`SOUL.md` / `USER.md` / `IDENTITY.md` 模板
- 💓 **心跳配置**：`HEARTBEAT.md` 预设日常检查项
- 🧠 **记忆系统**：`MEMORY.md` + `memory/` 目录结构
- 📋 **工作指南**：`AGENTS.md` 行为准则
- 🔧 **工具笔记**：`TOOLS.md` 本地工具速查
- 📚 **推荐 Skills**：精选实用技能列表

## 🚀 快速开始

### 1. 安装 OpenClaw

```bash
npm install -g openclaw
```

### 2. 使用模板

```bash
# 克隆此模板
git clone https://github.com/mengjian-github/xiaomo-starter-kit.git my-assistant
cd my-assistant

# 或者直接用 GitHub 的 "Use this template" 按钮
```

### 3. 个性化配置

编辑以下文件，把助手变成「你的」：

```bash
# 定义助手的性格和行为
nano SOUL.md

# 告诉助手关于你的信息
nano USER.md

# 给助手起名字、设定形象
nano IDENTITY.md
```

### 4. 启动

```bash
openclaw gateway start
```

然后在 Telegram / WhatsApp / Discord 上跟你的助手说声「你好」！

## 📁 文件结构

```
my-assistant/
├── AGENTS.md          # 助手的行为准则和工作流程
├── SOUL.md            # 灵魂文件：性格、语气、边界
├── USER.md            # 用户画像：让助手了解你
├── IDENTITY.md        # 身份设定：名字、形象、Vibe
├── HEARTBEAT.md       # 心跳检查项：助手定期自动执行
├── MEMORY.md          # 长期记忆：重要事件和经验
├── TOOLS.md           # 工具笔记：本地配置速查
├── TODO.md            # 任务清单
├── memory/            # 每日记忆文件
│   └── .gitkeep
├── content/           # 内容输出目录
│   └── .gitkeep
└── docs/
    └── SKILLS-GUIDE.md  # 推荐技能清单和安装指南
```

## 🧩 推荐 Skills

| 技能 | 用途 | 安装命令 |
|------|------|---------|
| weather | 天气查询 | `clawdhub install weather` |
| github | GitHub 操作 | 内置 |
| todo-tracker | 任务管理 | `clawdhub install jdrhyne/todo-tracker` |
| remind-me | 自然语言提醒 | `clawdhub install remind-me` |
| gog | Google 邮箱/日历/文档 | `clawdhub install gog` |
| youtube-watcher | 视频摘要 | `clawdhub install youtube-watcher` |
| web-search | 网页搜索 | 内置 |

完整技能列表请查看 [ClawdHub](https://clawdhub.com)。

## 📖 7 天从入门到上手

我们写了一份详细的《人人都该有一个 AI 私人助手》7 天指南：

- **Day 1**: 遇见你的 AI 助手
- **Day 2**: 10 分钟搭建
- **Day 3**: 给助手一个灵魂
- **Day 4**: 接入数字生活
- **Day 5**: 解锁技能树
- **Day 6**: 让助手主动工作
- **Day 7**: 进阶玩法

👉 [阅读完整指南（飞书知识库）](https://my.feishu.cn/wiki/YkWgwqSchi9xW3kEuZscAm0lnFf)

## 🔒 安全提醒

- ⚠️ 不要把 API Key 提交到 Git（使用 `.env` 或环境变量）
- ⚠️ 安装 Skill 前检查源码
- ⚠️ `clawdbot.json` 配置文件权限建议设为 `chmod 600`
- ⚠️ 定期检查和清理 `MEMORY.md` 中的敏感信息

## 👤 关于

由 [孟健](https://github.com/mengjian-github) 和小墨 🐈‍⬛ 共同创建。

- 📱 公众号：**孟健AI编程**
- 🐦 Twitter: [@xjtumj](https://twitter.com/xjtumj)
- 💬 交流群：关注公众号回复「小墨」加入

## 📄 License

MIT License - 自由使用、修改、分发。

---

*喵~ 欢迎 Star ⭐ 支持，让更多人拥有自己的 AI 助手。* 🐈‍⬛